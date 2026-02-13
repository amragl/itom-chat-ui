"""Pydantic models for the streaming chat endpoint.

Defines the request payload for initiating a streaming chat session and the
Server-Sent Event (SSE) chunk envelope used to deliver partial responses.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class StreamChatRequest(BaseModel):
    """Payload for ``POST /api/chat/stream``.

    Attributes:
        content: The user's message text.
        conversation_id: UUID of the conversation this message belongs to.
        agent_target: Optional agent ID to route the message to.
            When omitted, the orchestrator decides routing.
    """

    content: str = Field(..., min_length=1, max_length=50_000)
    conversation_id: str = Field(..., min_length=1)
    agent_target: str | None = None


class SSEEventType(str, Enum):
    """Discriminator for the kind of SSE event sent to the client.

    - ``stream_start`` -- emitted once at the beginning; carries metadata.
    - ``token`` -- emitted for each partial chunk of the agent response.
    - ``stream_end`` -- emitted once when the full response is complete.
    - ``error`` -- emitted if something goes wrong mid-stream.
    """

    STREAM_START = "stream_start"
    TOKEN = "token"
    STREAM_END = "stream_end"
    ERROR = "error"


class StreamStartData(BaseModel):
    """Data payload for the ``stream_start`` event."""

    message_id: str
    agent_id: str
    conversation_id: str


class TokenData(BaseModel):
    """Data payload for a ``token`` event -- a single text chunk."""

    token: str
    message_id: str


class StreamEndData(BaseModel):
    """Data payload for the ``stream_end`` event."""

    message_id: str
    full_content: str
    agent_id: str
    conversation_id: str


class StreamErrorData(BaseModel):
    """Data payload for the ``error`` event."""

    code: str
    message: str
