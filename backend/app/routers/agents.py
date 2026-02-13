"""API router for ITOM agent listing and status.

Provides GET /api/agents which returns the list of available ITOM agents
with their current operational status. Agent status is determined by
attempting to reach the orchestrator; if the orchestrator is unreachable,
all agents report as "offline".
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user
from ..config import Settings, get_settings
from ..models.agent import AgentDomain, AgentResponse, AgentStatus
from ..models.auth import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agents"])

# ---------------------------------------------------------------------------
# Agent definitions
# ---------------------------------------------------------------------------
# These are the real ITOM agents the system is designed to work with.
# Each definition describes a production agent service. The status field
# is resolved at request time by querying the orchestrator.

_AGENT_DEFINITIONS: list[dict[str, str]] = [
    {
        "id": "discovery",
        "name": "Discovery Agent",
        "description": "Network and infrastructure discovery",
        "domain": AgentDomain.DISCOVERY,
        "icon": "search",
    },
    {
        "id": "asset",
        "name": "Asset Agent",
        "description": "IT asset management and tracking",
        "domain": AgentDomain.ASSET,
        "icon": "server",
    },
    {
        "id": "auditor",
        "name": "Auditor Agent",
        "description": "IT compliance auditing and reporting",
        "domain": AgentDomain.AUDIT,
        "icon": "shield-check",
    },
    {
        "id": "documentator",
        "name": "Documentator Agent",
        "description": "ITOM documentation generation",
        "domain": AgentDomain.DOCUMENTATION,
        "icon": "file-text",
    },
    {
        "id": "auto",
        "name": "Auto (Orchestrator)",
        "description": "Let the orchestrator decide routing",
        "domain": AgentDomain.ORCHESTRATOR,
        "icon": "zap",
    },
]


async def _query_orchestrator_status(
    orchestrator_url: str,
) -> dict[str, AgentStatus]:
    """Query the orchestrator for real-time agent statuses.

    Attempts to reach the orchestrator's agents/status endpoint.
    Returns a mapping of agent_id -> AgentStatus.

    If the orchestrator is unreachable, returns an empty dict so that
    all agents default to "offline".
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{orchestrator_url}/api/agents/status")
            if response.status_code == 200:
                data = response.json()
                statuses: dict[str, AgentStatus] = {}
                # The orchestrator returns {"agents": [{"id": "...", "status": "..."}]}
                for agent_data in data.get("agents", []):
                    agent_id = agent_data.get("id", "")
                    raw_status = agent_data.get("status", "offline")
                    try:
                        statuses[agent_id] = AgentStatus(raw_status)
                    except ValueError:
                        statuses[agent_id] = AgentStatus.OFFLINE
                return statuses
    except httpx.RequestError as exc:
        logger.debug("Orchestrator unreachable at %s: %s", orchestrator_url, exc)
    except Exception:
        logger.exception("Unexpected error querying orchestrator status")

    return {}


def _build_agent_list(statuses: dict[str, AgentStatus]) -> list[AgentResponse]:
    """Build the agent response list, merging definitions with live statuses.

    If a status is available from the orchestrator for a given agent, use it.
    Otherwise default to "offline" -- we do not fabricate "online" statuses.
    """
    agents: list[AgentResponse] = []
    for defn in _AGENT_DEFINITIONS:
        agent_id = defn["id"]
        status = statuses.get(agent_id, AgentStatus.OFFLINE)
        agents.append(
            AgentResponse(
                id=agent_id,
                name=defn["name"],
                description=defn["description"],
                status=status,
                domain=defn["domain"],
                icon=defn.get("icon"),
            )
        )
    return agents


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/agents", response_model=list[AgentResponse])
async def list_agents(
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> list[AgentResponse]:
    """List all available ITOM agents with their current operational status.

    Returns a JSON array of agent objects. Queries the orchestrator for
    real-time status. If the orchestrator is unreachable, all agents are
    reported as "offline". This endpoint never returns fabricated "online"
    statuses.

    Requires a valid ServiceNow Bearer token.
    """
    statuses = await _query_orchestrator_status(settings.orchestrator_url)
    return _build_agent_list(statuses)


@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> AgentResponse:
    """Get details for a specific ITOM agent by ID.

    Returns 404 if the agent ID is not recognized.

    Requires a valid ServiceNow Bearer token.
    """
    # Find the agent definition
    defn = next((d for d in _AGENT_DEFINITIONS if d["id"] == agent_id), None)
    if defn is None:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_id}' not found. "
            f"Valid agent IDs: {', '.join(d['id'] for d in _AGENT_DEFINITIONS)}",
        )

    statuses = await _query_orchestrator_status(settings.orchestrator_url)
    status = statuses.get(agent_id, AgentStatus.OFFLINE)

    return AgentResponse(
        id=agent_id,
        name=defn["name"],
        description=defn["description"],
        status=status,
        domain=defn["domain"],
        icon=defn.get("icon"),
    )
