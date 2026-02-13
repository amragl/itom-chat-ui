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
    """Payload sent to the itom-orchestrator HTTP API.

    Matches the orchestrator's ChatRequest schema:
      message, target_agent, domain, context (dict), session_id.
    """

    message: str = Field(..., description="The user's message content")
    target_agent: str | None = Field(
        default=None, description="Preferred agent, or null for auto-routing"
    )
    domain: str | None = Field(
        default=None, description="Domain hint for routing (cmdb, discovery, etc.)"
    )
    context: dict[str, Any] = Field(
        default_factory=dict,
        description="Session context passed to the agent",
    )
    session_id: str | None = Field(
        default=None, description="Session/conversation ID for continuity"
    )


class OrchestratorResponse(BaseModel):
    """Expected response structure from the itom-orchestrator.

    Matches the orchestrator's ChatResponse schema:
    message_id, status, agent_id, agent_name, domain, response (dict),
    routing_method, timestamp, session_id.
    """

    message_id: str = Field(..., description="Unique ID for this response")
    status: str = Field(..., description="Response status (success, error)")
    agent_id: str = Field(..., description="ID of the agent that processed the request")
    agent_name: str = Field(..., description="Display name of the responding agent")
    domain: str = Field(..., description="Domain the message was routed to")
    response: dict[str, Any] = Field(
        ..., description="Nested response with result and routing info"
    )
    routing_method: str = Field(..., description="How the message was routed")
    timestamp: str = Field(..., description="When the response was generated")
    session_id: str | None = Field(
        default=None, description="Session/conversation ID"
    )

    @property
    def content(self) -> str:
        """Extract the displayable text from the nested response."""
        result = self.response.get("result", {})
        if isinstance(result, dict):
            if "agent_response" in result:
                return result["agent_response"]
            if "dispatched_to" in result:
                agent = result.get("dispatched_to", "unknown")
                return (
                    f"Message received by {agent}. "
                    "The agent acknowledged the request."
                )
            if result:
                import json
                return json.dumps(result, indent=2)
        return f"Response from {self.agent_name} (status: {self.status})"

    @property
    def conversation_id(self) -> str | None:
        """Map session_id to conversation_id for the chat backend."""
        return self.session_id

    @property
    def metadata(self) -> dict[str, Any]:
        """Extract metadata from the nested response."""
        return {
            "routing_method": self.routing_method,
            "domain": self.domain,
            "tool_used": self.response.get("result", {}).get("tool_used"),
            "source": self.response.get("result", {}).get("source"),
        }
