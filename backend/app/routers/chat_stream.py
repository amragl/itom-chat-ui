"""Streaming chat endpoint using Server-Sent Events (SSE).

Provides ``POST /api/chat/stream`` which accepts a user message and returns
a streaming response where partial agent reply chunks are delivered as SSE
events.  The client receives:

- ``stream_start`` -- once at the beginning, with metadata (message_id, agent_id).
- ``token`` -- for each partial text chunk of the agent's response.
- ``stream_end`` -- once at the end, with the full assembled response text.
- ``error`` -- if something goes wrong mid-stream.

The endpoint uses ``text/event-stream`` content type and follows the
W3C Server-Sent Events specification.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

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
