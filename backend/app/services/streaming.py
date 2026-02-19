"""Streaming chat service that proxies requests to the ITOM orchestrator.

This service manages the Server-Sent Event (SSE) lifecycle for a single
chat interaction:

1. Accept the user message and target agent.
2. Forward to the ITOM orchestrator endpoint.
3. Parse the orchestrator's JSON response.
4. Emit SSE events (stream_start, token, stream_end) to the client.

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

# Session agent store: maps conversation_id -> last successful agent_id
# This enables conversational continuity for follow-up messages.
_session_agents: dict[str, str] = {}


async def stream_chat_response(
    content: str,
    conversation_id: str,
    agent_target: str | None = None,
) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted strings for a chat interaction.

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

    # Build the request payload for the orchestrator.
    orchestrator_payload = {
        "message": content,
        "target_agent": agent_target,
        "session_id": conversation_id,
        "context": {
            "last_agent_id": _session_agents.get(conversation_id),
        },
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            orchestrator_url = f"{settings.orchestrator_url}/api/chat"
            logger.info(
                "Sending request to orchestrator: %s (agent=%s, conversation=%s)",
                orchestrator_url,
                agent_id,
                conversation_id,
            )

            response = await client.post(orchestrator_url, json=orchestrator_payload)

            if response.status_code != 200:
                logger.error(
                    "Orchestrator returned status %d: %s",
                    response.status_code,
                    response.text[:500],
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

            # Parse the orchestrator's JSON response.
            # The response structure is:
            # {
            #   "message_id": "...",
            #   "status": "success",
            #   "agent_id": "cmdb-agent",
            #   "agent_name": "CMDB Agent",
            #   "domain": "cmdb",
            #   "response": {
            #     "task_id": "...",
            #     "result": {
            #       "agent_response": "actual text content...",
            #       "tool_used": "...",
            #       ...
            #     },
            #     "routing": {...}
            #   },
            #   ...
            # }
            try:
                orch_data = response.json()
            except Exception:
                logger.error("Failed to parse orchestrator JSON response")
                error_event = {
                    "event": "error",
                    "data": {
                        "code": "ORCHESTRATOR_PARSE_ERROR",
                        "message": "Failed to parse orchestrator response.",
                    },
                }
                yield f"data: {json.dumps(error_event)}\n\n"
                return

            # Extract the actual content from the nested response
            agent_response_text = _extract_content(orch_data)
            actual_agent_id = orch_data.get("agent_id", agent_id)
            actual_agent_name = orch_data.get("agent_name", "Agent")

            # Store the agent for session continuity
            if actual_agent_id and actual_agent_id != "orchestrator":
                if len(_session_agents) > 1000:
                    # Drop the oldest entry
                    oldest_key = next(iter(_session_agents))
                    del _session_agents[oldest_key]
                _session_agents[conversation_id] = actual_agent_id

            # Emit the full response as a single token event
            if agent_response_text:
                token_event = {
                    "event": "token",
                    "data": {
                        "token": agent_response_text,
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
        logger.exception("Unexpected error during chat for conversation %s", conversation_id)
        error_event = {
            "event": "error",
            "data": {
                "code": "STREAM_INTERNAL_ERROR",
                "message": "An unexpected error occurred.",
            },
        }
        yield f"data: {json.dumps(error_event)}\n\n"
        return

    # Emit stream_end event with the full assembled content
    end_event = {
        "event": "stream_end",
        "data": {
            "message_id": message_id,
            "full_content": agent_response_text or "",
            "agent_id": actual_agent_id,
            "agent_name": actual_agent_name,
            "conversation_id": conversation_id,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    }
    yield f"data: {json.dumps(end_event)}\n\n"

    logger.info(
        "Chat completed for message %s (conversation=%s, agent=%s, length=%d)",
        message_id,
        conversation_id,
        actual_agent_id,
        len(agent_response_text or ""),
    )


def _extract_content(orch_data: dict) -> str:
    """Extract the displayable text content from an orchestrator response.

    Tries several paths to find the agent's actual response text:
    1. response.result.agent_response  (dispatch handler result)
    2. response.result.dispatched_to   (default stub)
    3. Flat string fallback
    """
    resp = orch_data.get("response", {})
    if isinstance(resp, dict):
        result = resp.get("result", {})
        if isinstance(result, dict):
            # Real agent response from dispatch handler
            if "agent_response" in result:
                return result["agent_response"]
            # Default stub response
            if "dispatched_to" in result:
                agent = result.get("dispatched_to", "unknown")
                return (
                    f"Message received by {agent}. "
                    "The agent acknowledged the request but no detailed response "
                    "was returned. This may mean the agent's MCP server is not "
                    "running or not connected."
                )
            # Generic result with some data
            if result:
                return json.dumps(result, indent=2)
        # response is a dict but no result key
        if resp:
            return json.dumps(resp, indent=2)

    # Fallback: status message
    status = orch_data.get("status", "unknown")
    agent = orch_data.get("agent_name", orch_data.get("agent_id", "unknown"))
    return f"Response from {agent} (status: {status})"
