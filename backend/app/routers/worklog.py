"""Worklog API router.

Provides an endpoint to fetch the user's prioritized ServiceNow work items
(incidents, changes, tasks, RITMs) from the orchestrator.

Endpoints:
    GET /api/worklog -- List the user's open work items
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import get_current_user
from ..config import Settings, get_settings
from ..models.auth import CurrentUser
from ..services.orchestrator import get_orchestrator_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["worklog"])


class WorkItem(BaseModel):
    """A single ServiceNow work item."""

    type: str = Field(..., description="Work item type: incident, change, task, ritm, problem")
    number: str = Field(..., description="ServiceNow number (e.g. INC0012345)")
    short_description: str = Field(..., description="Brief description of the work item")
    priority: int = Field(..., description="Priority level (1=critical, 5=planning)")
    state: str = Field(..., description="Current state of the work item")
    opened_at: str = Field(..., description="ISO 8601 timestamp of when the item was opened")
    due_date: str | None = Field(default=None, description="ISO 8601 due date, if applicable")
    assigned_to: str = Field(default="", description="Display name of the assignee")
    sys_id: str = Field(..., description="ServiceNow sys_id for deep linking")


class WorklogResponse(BaseModel):
    """Response from the worklog endpoint."""

    items: list[WorkItem] = Field(default_factory=list)
    status: str = Field(default="ok", description="Status message")


@router.get(
    "/worklog",
    summary="Get user's open work items",
    description=(
        "Fetches the current user's prioritized ServiceNow work items "
        "(incidents, changes, tasks, RITMs) via the orchestrator."
    ),
    responses={
        200: {"description": "List of work items or empty list with status"},
        401: {"description": "Authentication required"},
    },
)
async def get_worklog(
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WorklogResponse:
    """Fetch the user's open work items from the orchestrator."""
    orch = get_orchestrator_service(settings)

    try:
        health = await orch.check_health()
        if not health.get("available"):
            return WorklogResponse(
                items=[],
                status="Orchestrator unavailable — cannot fetch work items.",
            )

        data = await orch.fetch_worklog()
        raw_items = data.get("items", [])
        if not raw_items and data.get("status"):
            return WorklogResponse(items=[], status=data["status"])

        items = [WorkItem.model_validate(item) for item in raw_items]
        return WorklogResponse(items=items, status="ok")

    except Exception as exc:
        logger.error("Unexpected error fetching worklog: %s", exc)
        return WorklogResponse(
            items=[],
            status="Unexpected error fetching work items.",
        )
