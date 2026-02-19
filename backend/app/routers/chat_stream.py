"""Streaming chat endpoint using Server-Sent Events (SSE).

Provides ``POST /api/chat/stream`` which accepts a user message and returns
a streaming response where partial agent reply chunks are delivered as SSE
events.  The client receives:

- ``stream_start`` -- once at the beginning, with metadata (message_id, agent_id).
- ``token`` -- for each partial text chunk of the agent's response.
- ``stream_end`` -- once at the end, with the full assembled response text.
- ``clarification`` -- when the orchestrator needs user clarification (SE-012).
- ``error`` -- if something goes wrong mid-stream.

The endpoint uses ``text/event-stream`` content type and follows the
W3C Server-Sent Events specification.

Also provides ``POST /api/chat/clarify`` which resolves a pending
clarification token and streams the resolved response.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import get_settings
from ..models.streaming import StreamChatRequest
from ..services.streaming import stream_chat_response

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.post(
    "/chat/stream",
    response_class=StreamingResponse,
    summary="Stream a chat response via Server-Sent Events",
    description=(
        "Send a message and receive the agent's reply as a stream of "
        "Server-Sent Events.  Each event is a JSON object with an ``event`` "
        "field (stream_start, token, stream_end, error) and a ``data`` field."
    ),
)
async def stream_chat(request: StreamChatRequest) -> StreamingResponse:
    """Accept a user message and stream the agent's response as SSE.

    The response is delivered as ``text/event-stream`` with chunked transfer
    encoding.  The client should consume this with an EventSource-compatible
    reader (or ``fetch`` with ``ReadableStream``).

    Request body:
        - ``content`` (str): The user's message text.
        - ``conversation_id`` (str): UUID of the conversation.
        - ``agent_target`` (str | null): Optional agent to route to.

    SSE events emitted:
        - ``stream_start``: ``{message_id, agent_id, conversation_id, timestamp}``
        - ``token``: ``{token, message_id}``
        - ``stream_end``: ``{message_id, full_content, agent_id, conversation_id, timestamp}``
        - ``error``: ``{code, message}``
    """
    logger.info(
        "Streaming chat request: conversation=%s, agent=%s, content_length=%d",
        request.conversation_id,
        request.agent_target or "auto",
        len(request.content),
    )

    return StreamingResponse(
        content=stream_chat_response(
            content=request.content,
            conversation_id=request.conversation_id,
            agent_target=request.agent_target,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class ClarifyRequest(BaseModel):
    """Request body for POST /api/chat/clarify.

    Attributes:
        pending_message_token: Token from the clarification SSE event.
        clarification_answer: The user's selected option or free-text answer.
        conversation_id: UUID of the conversation.
    """

    pending_message_token: str
    clarification_answer: str
    conversation_id: str


@router.post(
    "/chat/clarify",
    response_class=StreamingResponse,
    summary="Resolve a clarification and stream the response",
    description=(
        "Submit the user's answer to a clarification question.  "
        "Forwards the token and answer to the orchestrator's /api/chat/clarify "
        "endpoint, then streams the resolved response back as SSE events."
    ),
)
async def clarify_chat(request: ClarifyRequest) -> StreamingResponse:
    """Accept a clarification answer and stream the resolved agent response.

    Forwards the pending_message_token and clarification_answer to the
    orchestrator, which combines them with the original message and re-routes.
    The result is streamed back as SSE events identical to /api/chat/stream.

    SSE events emitted:
        - ``stream_start``: ``{message_id, agent_id, conversation_id, timestamp}``
        - ``token``: ``{token, message_id}``
        - ``stream_end``: ``{message_id, full_content, agent_id, conversation_id, timestamp}``
        - ``error``: ``{code, message}``
    """
    logger.info(
        "Clarification request: conversation=%s, token=%s",
        request.conversation_id,
        request.pending_message_token,
    )

    settings = get_settings()

    # Call orchestrator's /api/chat/clarify endpoint first to resolve the
    # pending clarification and get back a full ChatResponse.
    async def _forward_clarification_as_stream():
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(120.0, connect=10.0)
            ) as client:
                orch_url = f"{settings.orchestrator_url}/api/chat/clarify"
                response = await client.post(
                    orch_url,
                    json={
                        "pending_message_token": request.pending_message_token,
                        "clarification_answer": request.clarification_answer,
                        "session_id": request.conversation_id,
                    },
                )

            if response.status_code != 200:
                import json as _json
                error_event = {
                    "event": "error",
                    "data": {
                        "code": "CLARIFICATION_FAILED",
                        "message": f"Orchestrator returned HTTP {response.status_code}",
                    },
                }
                yield f"data: {_json.dumps(error_event)}\n\n"
                return

            # Re-stream as a regular chat response
            import json as _json
            from datetime import UTC, datetime
            import uuid

            orch_data = response.json()
            message_id = str(uuid.uuid4())
            agent_id = orch_data.get("agent_id", "orchestrator")
            agent_name = orch_data.get("agent_name", "Agent")

            # stream_start
            yield f"data: {_json.dumps({'event': 'stream_start', 'data': {'message_id': message_id, 'agent_id': agent_id, 'conversation_id': request.conversation_id, 'timestamp': datetime.now(UTC).isoformat()}})}\n\n"

            # Extract content and emit as single token
            from ..services.streaming import _extract_content
            content_text = _extract_content(orch_data)
            if content_text:
                yield f"data: {_json.dumps({'event': 'token', 'data': {'token': content_text, 'message_id': message_id}})}\n\n"

            # stream_end
            yield f"data: {_json.dumps({'event': 'stream_end', 'data': {'message_id': message_id, 'full_content': content_text or '', 'agent_id': agent_id, 'agent_name': agent_name, 'conversation_id': request.conversation_id, 'timestamp': datetime.now(UTC).isoformat()}})}\n\n"

        except httpx.ConnectError:
            import json as _json
            yield f"data: {_json.dumps({'event': 'error', 'data': {'code': 'ORCHESTRATOR_UNREACHABLE', 'message': 'Cannot connect to the ITOM orchestrator.'}})}\n\n"
        except Exception:
            import json as _json
            logger.exception("Unexpected error during clarification for %s", request.conversation_id)
            yield f"data: {_json.dumps({'event': 'error', 'data': {'code': 'CLARIFY_INTERNAL_ERROR', 'message': 'An unexpected error occurred.'}})}\n\n"

    return StreamingResponse(
        content=_forward_clarification_as_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
