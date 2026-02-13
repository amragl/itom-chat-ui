"""Pydantic models for WebSocket message envelopes and payloads.

These models mirror the TypeScript types defined in the frontend at
``frontend/src/types/websocket.ts`` and are used for server-side
validation and serialization of WebSocket traffic.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel


class WebSocketMessageType(str, Enum):
    """Discriminator for the kind of WebSocket message."""

    CHAT = "chat"
    STATUS = "status"
    ERROR = "error"
    HEARTBEAT = "heartbeat"


class WebSocketMessage(BaseModel):
    """Envelope for all WebSocket communication.

    ``type`` determines how ``payload`` should be interpreted.
    ``correlation_id`` is optional and used to match requests with responses.
    """

    type: WebSocketMessageType
    payload: dict[str, Any]
    correlation_id: str | None = None

    model_config = {"populate_by_name": True}


class ChatPayload(BaseModel):
    """Payload for ``type: "chat"`` messages."""

    conversation_id: str
    content: str
    role: str  # "user" | "assistant" | "system"
    agent_id: str | None = None


class StatusPayload(BaseModel):
    """Payload for ``type: "status"`` messages."""

    agent_id: str
    status: str  # "online" | "offline" | "busy"
    timestamp: datetime


class ErrorPayload(BaseModel):
    """Payload for ``type: "error"`` messages."""

    code: str
    message: str


class HeartbeatPayload(BaseModel):
    """Payload for ``type: "heartbeat"`` messages."""

    timestamp: datetime
