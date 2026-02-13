"""Pydantic models for ITOM agent representation.

Defines the data structures used by the GET /api/agents endpoint to describe
available ITOM agents and their operational status.
"""

from enum import Enum

from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    """Operational status of an ITOM agent."""

    ONLINE = "online"
    OFFLINE = "offline"
    BUSY = "busy"


class AgentDomain(str, Enum):
    """Functional domain of an ITOM agent."""

    DISCOVERY = "discovery"
    ASSET = "asset"
    AUDIT = "audit"
    DOCUMENTATION = "documentation"
    ORCHESTRATOR = "orchestrator"


class AgentResponse(BaseModel):
    """Response model for a single ITOM agent.

    Returned as part of the GET /api/agents list and used by the frontend
    AgentSelector component to display agent options with live status.
    """

    id: str = Field(description="Unique identifier for the agent (e.g., 'discovery', 'asset').")
    name: str = Field(description="Human-readable display name (e.g., 'Discovery Agent').")
    description: str = Field(description="Short description of the agent's purpose.")
    status: AgentStatus = Field(description="Current operational status.")
    domain: AgentDomain = Field(description="The ITOM domain this agent operates in.")
    icon: str | None = Field(
        default=None,
        description="Optional icon identifier for display in the UI.",
    )
