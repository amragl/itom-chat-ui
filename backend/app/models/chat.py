"""Pydantic models for the chat API request and response payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Incoming chat message from the client.

    Attributes:
        content: The user's message text. Must be non-empty.
        conversation_id: Optional ID of an existing conversation. When ``None``,
            a new conversation is started.
        agent_target: Optional agent to route the message to. Valid values are
            ``"discovery"``, ``"asset"``, ``"auditor"``, ``"documentator"``, or
            ``None`` for auto-routing by the orchestrator.
    """

    content: str = Field(..., min_length=1, max_length=10000, description="The user's message text")
    conversation_id: str | None = Field(
        default=None,
        description="Existing conversation ID, or null to start a new conversation",
    )
    agent_target: str | None = Field(
        default=None,
        description=(
            "Target agent: 'discovery', 'asset', 'auditor', 'documentator', "
            "or null for auto-routing"
        ),
    )


class ChatResponse(BaseModel):
    """Response returned after processing a chat message.

    Contains the agent's reply along with metadata about how the request was
    processed (which agent handled it, response time, etc.).
    """

    message_id: str = Field(..., description="Unique identifier for this response message")
    conversation_id: str = Field(..., description="Conversation this message belongs to")
    content: str = Field(..., description="The agent's response text")
    agent_id: str = Field(..., description="ID of the agent that handled the request")
    agent_name: str = Field(..., description="Display name of the agent that responded")
    response_time_ms: int = Field(
        ..., ge=0, description="Time taken to produce the response in milliseconds"
    )
    timestamp: datetime = Field(..., description="When the response was generated")
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata about the response (tokens, model, etc.)",
    )


class OrchestratorRequest(BaseModel):
    """Payload sent to the itom-orchestrator MCP server.

    Wraps the user message with conversation context so the orchestrator can
    make informed routing and response decisions.
    """

    message: str = Field(..., description="The user's message content")
    conversation_id: str | None = Field(
        default=None, description="Conversation ID for context continuity"
    )
    agent_target: str | None = Field(
        default=None, description="Preferred agent, or null for auto-routing"
    )
    context: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Previous messages in the conversation for context",
    )
    user: dict[str, str] = Field(
        default_factory=dict,
        description="Authenticated user info (sys_id, user_name, name)",
    )


class OrchestratorResponse(BaseModel):
    """Expected response structure from the itom-orchestrator.

    The orchestrator returns the agent's reply along with metadata about
    which agent handled it and processing details.
    """

    content: str = Field(..., description="The agent's response text")
    agent_id: str = Field(..., description="ID of the agent that processed the request")
    agent_name: str = Field(..., description="Display name of the responding agent")
    conversation_id: str | None = Field(
        default=None, description="Conversation ID (may be newly created)"
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional response metadata",
    )
