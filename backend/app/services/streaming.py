"""Streaming chat service that proxies requests to the ITOM orchestrator.

This service manages the Server-Sent Event (SSE) lifecycle for a single
streaming chat interaction:

1. Accept the user message and target agent.
2. Forward to the ITOM orchestrator endpoint.
3. Stream the orchestrator's response back as SSE token events.
4. Emit a ``stream_end`` event with the complete assembled response.

If the orchestrator is unreachable, the service emits an ``error`` SSE event
so the client can surface the failure gracefully.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)


async def stream_chat_response(
    content: str,
    conversation_id: str,
    agent_target: str | None = None,
) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted strings for a streaming chat interaction.

    Each yielded string is a complete SSE message (``data: ...\\n\\n``) that
    the client can parse according to the EventSource specification.

    Parameters:
        content: The user's message text.
        conversation_id: UUID of the conversation.
        agent_target: Optional agent ID.  If ``None``, the orchestrator routes.

    Yields:
        SSE-formatted strings: ``data: {json}\\n\\n``.
    """
    settings = get_settings()
    message_id = str(uuid.uuid4())
    agent_id = agent_target or "orchestrator"

    # Emit stream_start event
    start_event = {
        "event": "stream_start",
        "data": {
            "message_id": message_id,
            "agent_id": agent_id,
            "conversation_id": conversation_id,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    }
    yield f"data: {json.dumps(start_event)}\n\n"

    # Build the request payload for the orchestrator
    orchestrator_payload = {
        "content": content,
        "conversation_id": conversation_id,
        "agent_target": agent_target,
        "stream": True,
    }

    accumulated_content = ""

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            orchestrator_url = f"{settings.orchestrator_url}/api/chat/stream"
            logger.info(
                "Streaming request to orchestrator: %s (agent=%s, conversation=%s)",
                orchestrator_url,
                agent_id,
                conversation_id,
            )

            async with client.stream(
                "POST",
                orchestrator_url,
                json=orchestrator_payload,
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    logger.error(
                        "Orchestrator returned status %d: %s",
                        response.status_code,
                        error_body.decode("utf-8", errors="replace")[:500],
                    )
                    error_event = {
                        "event": "error",
                        "data": {
                            "code": "ORCHESTRATOR_ERROR",
                            "message": (
                                f"Orchestrator returned HTTP {response.status_code}. "
                                "The service may be temporarily unavailable."
                            ),
                        },
                    }
                    yield f"data: {json.dumps(error_event)}\n\n"
                    return

                # Stream tokens from the orchestrator response
                async for line in response.aiter_lines():
                    if not line:
                        continue

                    # The orchestrator sends SSE-format lines prefixed with "data: "
                    if line.startswith("data: "):
                        raw_data = line[6:]
                    else:
                        raw_data = line

                    try:
                        chunk = json.loads(raw_data)
                    except json.JSONDecodeError:
                        # Treat non-JSON lines as raw text tokens
                        chunk = {"token": raw_data}

                    token_text = chunk.get("token", chunk.get("content", ""))
                    if token_text:
                        accumulated_content += token_text
                        token_event = {
                            "event": "token",
                            "data": {
                                "token": token_text,
                                "message_id": message_id,
                            },
                        }
                        yield f"data: {json.dumps(token_event)}\n\n"

    except httpx.ConnectError:
        logger.error(
            "Cannot connect to orchestrator at %s",
            settings.orchestrator_url,
        )
        error_event = {
            "event": "error",
            "data": {
                "code": "ORCHESTRATOR_UNREACHABLE",
                "message": (
                    "Cannot connect to the ITOM orchestrator. "
                    "Ensure the orchestrator service is running."
                ),
            },
        }
        yield f"data: {json.dumps(error_event)}\n\n"
        return

    except httpx.ReadTimeout:
        logger.error("Orchestrator read timeout for conversation %s", conversation_id)
        error_event = {
            "event": "error",
            "data": {
                "code": "ORCHESTRATOR_TIMEOUT",
                "message": "The orchestrator took too long to respond. Please try again.",
            },
        }
        yield f"data: {json.dumps(error_event)}\n\n"
        return

    except Exception:
        logger.exception("Unexpected error during streaming for conversation %s", conversation_id)
        error_event = {
            "event": "error",
            "data": {
                "code": "STREAM_INTERNAL_ERROR",
                "message": "An unexpected error occurred during streaming.",
            },
        }
        yield f"data: {json.dumps(error_event)}\n\n"
        return

    # Emit stream_end event with the full assembled content
    end_event = {
        "event": "stream_end",
        "data": {
            "message_id": message_id,
            "full_content": accumulated_content,
            "agent_id": agent_id,
            "conversation_id": conversation_id,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    }
    yield f"data: {json.dumps(end_event)}\n\n"

    logger.info(
        "Stream completed for message %s (conversation=%s, length=%d)",
        message_id,
        conversation_id,
        len(accumulated_content),
    )
