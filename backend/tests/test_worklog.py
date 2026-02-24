"""Tests for the worklog API router.

Uses the FastAPI TestClient with dev auth mode so token validation is bypassed.
Mocks the orchestrator service to avoid needing a live orchestrator.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    """Provide an async HTTP test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestWorklog:
    """Test the GET /api/worklog endpoint."""

    async def test_worklog_orchestrator_unavailable(self, client: AsyncClient) -> None:
        """When orchestrator is unavailable, return empty items with status."""
        with patch(
            "app.routers.worklog.get_orchestrator_service",
        ) as mock_get_orch:
            mock_orch = AsyncMock()
            mock_orch.check_health.return_value = {"available": False}
            mock_get_orch.return_value = mock_orch

            response = await client.get("/api/worklog")
            assert response.status_code == 200
            data = response.json()
            assert data["items"] == []
            assert "unavailable" in data["status"].lower()

    async def test_worklog_orchestrator_returns_items(self, client: AsyncClient) -> None:
        """When orchestrator returns items, pass them through."""
        mock_items = [
            {
                "type": "incident",
                "number": "INC0012345",
                "short_description": "Server down",
                "priority": 1,
                "state": "New",
                "opened_at": "2026-02-24T10:00:00Z",
                "due_date": None,
                "assigned_to": "John Doe",
                "sys_id": "abc123",
            },
            {
                "type": "change",
                "number": "CHG0067890",
                "short_description": "Upgrade firmware",
                "priority": 3,
                "state": "Scheduled",
                "opened_at": "2026-02-23T08:00:00Z",
                "due_date": "2026-03-01T00:00:00Z",
                "assigned_to": "John Doe",
                "sys_id": "def456",
            },
        ]

        with patch(
            "app.routers.worklog.get_orchestrator_service",
        ) as mock_get_orch:
            mock_orch = AsyncMock()
            mock_orch.check_health.return_value = {"available": True}
            mock_orch.fetch_worklog.return_value = {"items": mock_items}
            mock_get_orch.return_value = mock_orch

            response = await client.get("/api/worklog")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
            assert len(data["items"]) == 2
            assert data["items"][0]["number"] == "INC0012345"
            assert data["items"][1]["number"] == "CHG0067890"

    async def test_worklog_orchestrator_error_status(self, client: AsyncClient) -> None:
        """When orchestrator returns error status, pass it through."""
        with patch(
            "app.routers.worklog.get_orchestrator_service",
        ) as mock_get_orch:
            mock_orch = AsyncMock()
            mock_orch.check_health.return_value = {"available": True}
            mock_orch.fetch_worklog.return_value = {
                "items": [],
                "status": "Orchestrator returned HTTP 500.",
            }
            mock_get_orch.return_value = mock_orch

            response = await client.get("/api/worklog")
            assert response.status_code == 200
            data = response.json()
            assert data["items"] == []
            assert "500" in data["status"]

    async def test_worklog_empty_response(self, client: AsyncClient) -> None:
        """When orchestrator returns empty list, return empty items."""
        with patch(
            "app.routers.worklog.get_orchestrator_service",
        ) as mock_get_orch:
            mock_orch = AsyncMock()
            mock_orch.check_health.return_value = {"available": True}
            mock_orch.fetch_worklog.return_value = {"items": []}
            mock_get_orch.return_value = mock_orch

            response = await client.get("/api/worklog")
            assert response.status_code == 200
            data = response.json()
            assert data["items"] == []
            assert data["status"] == "ok"

    async def test_worklog_unexpected_exception(self, client: AsyncClient) -> None:
        """When an unexpected exception occurs, return error status."""
        with patch(
            "app.routers.worklog.get_orchestrator_service",
        ) as mock_get_orch:
            mock_orch = AsyncMock()
            mock_orch.check_health.side_effect = RuntimeError("boom")
            mock_get_orch.return_value = mock_orch

            response = await client.get("/api/worklog")
            assert response.status_code == 200
            data = response.json()
            assert data["items"] == []
            assert "unexpected" in data["status"].lower()
