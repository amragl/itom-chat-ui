"""Tests for SE-012/SE-019: Clarification SSE path and /api/chat/clarify endpoint.

Validates that:
- stream_chat_response emits a 'clarification' SSE event when orchestrator
  returns response_type=clarification
- stream_chat_response emits stream_end with empty content after clarification
- POST /api/chat/clarify endpoint exists and streams a response
- clarify endpoint handles orchestrator errors gracefully
- _extract_content is not called when response_type=clarification
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("CHAT_AUTH_MODE", "dev")
os.environ.setdefault("CHAT_DATABASE_URL", "sqlite:///:memory:")

import pytest
import httpx
from httpx import AsyncClient, ASGITransport


async def _collect_sse_events(async_gen) -> list[dict]:
    """Collect all SSE events from an async generator."""
    events = []
    buffer = ""
    async for chunk in async_gen:
        buffer += chunk
        while "\n\n" in buffer:
            part, buffer = buffer.split("\n\n", 1)
            for line in part.splitlines():
                if line.startswith("data: "):
                    try:
                        event = json.loads(line[6:])
                        events.append(event)
                    except json.JSONDecodeError:
                        pass
    return events


class TestClarificationSSE:
    """Tests that streaming.py emits clarification events correctly."""

    @pytest.mark.asyncio
    async def test_clarification_event_emitted(self):
        """Orchestrator clarification response → 'clarification' SSE event."""
        from app.services.streaming import stream_chat_response

        clarification_response = {
            "response_type": "clarification",
            "message_id": "msg-001",
            "question": "Are you querying CMDB or creating a service request?",
            "options": ["Query CMDB", "Create request"],
            "pending_message_token": "tok-abc123",
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = clarification_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(
            return_value=mock_response
        )

        with patch("app.services.streaming.httpx.AsyncClient", return_value=mock_client):
            events = await _collect_sse_events(
                stream_chat_response("show me server requests", "conv-001")
            )

        event_types = [e.get("event") for e in events]
        assert "stream_start" in event_types
        assert "clarification" in event_types
        assert "stream_end" in event_types
        assert "token" not in event_types  # No token for clarification

    @pytest.mark.asyncio
    async def test_clarification_event_data(self):
        """Clarification event contains question, options, and token."""
        from app.services.streaming import stream_chat_response

        clarification_response = {
            "response_type": "clarification",
            "message_id": "msg-002",
            "question": "Which domain?",
            "options": ["CMDB", "Asset"],
            "pending_message_token": "tok-xyz",
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = clarification_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(
            return_value=mock_response
        )

        with patch("app.services.streaming.httpx.AsyncClient", return_value=mock_client):
            events = await _collect_sse_events(
                stream_chat_response("ambiguous query", "conv-002")
            )

        clarification_events = [e for e in events if e.get("event") == "clarification"]
        assert len(clarification_events) == 1

        data = clarification_events[0]["data"]
        assert data["question"] == "Which domain?"
        assert data["options"] == ["CMDB", "Asset"]
        assert data["pending_message_token"] == "tok-xyz"

    @pytest.mark.asyncio
    async def test_stream_end_has_empty_content_after_clarification(self):
        """stream_end after clarification has empty full_content."""
        from app.services.streaming import stream_chat_response

        clarification_response = {
            "response_type": "clarification",
            "message_id": "msg-003",
            "question": "Which?",
            "options": ["A", "B"],
            "pending_message_token": "tok-000",
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = clarification_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(
            return_value=mock_response
        )

        with patch("app.services.streaming.httpx.AsyncClient", return_value=mock_client):
            events = await _collect_sse_events(
                stream_chat_response("ambiguous", "conv-003")
            )

        stream_end_events = [e for e in events if e.get("event") == "stream_end"]
        assert len(stream_end_events) == 1
        assert stream_end_events[0]["data"]["full_content"] == ""

    @pytest.mark.asyncio
    async def test_normal_response_not_treated_as_clarification(self):
        """A normal orchestrator response does not emit a clarification event."""
        from app.services.streaming import stream_chat_response

        normal_response = {
            "message_id": "msg-004",
            "status": "success",
            "agent_id": "cmdb-agent",
            "agent_name": "CMDB Agent",
            "response": {
                "result": {"agent_response": "Found 5 production servers."}
            },
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = normal_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(
            return_value=mock_response
        )

        with patch("app.services.streaming.httpx.AsyncClient", return_value=mock_client):
            events = await _collect_sse_events(
                stream_chat_response("Show me production servers", "conv-004")
            )

        event_types = [e.get("event") for e in events]
        assert "clarification" not in event_types
        assert "token" in event_types


class TestClarifyEndpoint:
    """Tests for POST /api/chat/clarify endpoint."""

    @pytest.mark.asyncio
    async def test_clarify_endpoint_exists(self):
        """POST /api/chat/clarify endpoint is registered and reachable."""
        from app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Use a dummy token — will fail at orchestrator call, but endpoint exists
            mock_orch_response = MagicMock()
            mock_orch_response.status_code = 200
            mock_orch_response.json.return_value = {
                "message_id": "msg-005",
                "status": "success",
                "agent_id": "cmdb-agent",
                "agent_name": "CMDB Agent",
                "response": {"result": {"agent_response": "Done."}},
            }

            mock_async_client = AsyncMock()
            mock_async_client.__aenter__.return_value.post = AsyncMock(
                return_value=mock_orch_response
            )

            with patch(
                "app.routers.chat_stream.httpx.AsyncClient",
                return_value=mock_async_client,
            ):
                response = await client.post(
                    "/api/chat/clarify",
                    json={
                        "pending_message_token": "tok-test",
                        "clarification_answer": "Query CMDB",
                        "conversation_id": "conv-test",
                    },
                )

        # Endpoint exists and returns streaming response
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_clarify_streams_token_event(self):
        """POST /api/chat/clarify streams the resolved response as SSE."""
        from app.main import app

        orch_response = {
            "message_id": "msg-006",
            "status": "success",
            "agent_id": "cmdb-agent",
            "agent_name": "CMDB Agent",
            "response": {
                "result": {"agent_response": "Found 3 production servers."}
            },
        }

        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = orch_response

        mock_async_client = AsyncMock()
        mock_async_client.__aenter__.return_value.post = AsyncMock(
            return_value=mock_http_response
        )

        with patch(
            "app.routers.chat_stream.httpx.AsyncClient",
            return_value=mock_async_client,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/chat/clarify",
                    json={
                        "pending_message_token": "tok-abc",
                        "clarification_answer": "Query CMDB",
                        "conversation_id": "conv-006",
                    },
                )

        assert response.status_code == 200
        body = response.text

        # Parse all SSE events
        events = []
        for line in body.split("\n"):
            if line.startswith("data: "):
                try:
                    events.append(json.loads(line[6:]))
                except json.JSONDecodeError:
                    pass

        event_types = [e.get("event") for e in events]
        assert "stream_start" in event_types
        assert "token" in event_types
        assert "stream_end" in event_types

        token_events = [e for e in events if e.get("event") == "token"]
        assert any("Found" in e.get("data", {}).get("token", "") for e in token_events)

    @pytest.mark.asyncio
    async def test_clarify_handles_orchestrator_error(self):
        """POST /api/chat/clarify emits error event on orchestrator failure."""
        from app.main import app

        mock_http_response = MagicMock()
        mock_http_response.status_code = 400
        mock_http_response.json.return_value = {"detail": "token not found"}

        mock_async_client = AsyncMock()
        mock_async_client.__aenter__.return_value.post = AsyncMock(
            return_value=mock_http_response
        )

        with patch(
            "app.routers.chat_stream.httpx.AsyncClient",
            return_value=mock_async_client,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/chat/clarify",
                    json={
                        "pending_message_token": "expired-tok",
                        "clarification_answer": "CSA",
                        "conversation_id": "conv-007",
                    },
                )

        assert response.status_code == 200  # SSE streams always return 200
        body = response.text
        events = [
            json.loads(line[6:])
            for line in body.split("\n")
            if line.startswith("data: ")
        ]
        error_events = [e for e in events if e.get("event") == "error"]
        assert len(error_events) >= 1
        assert "400" in str(error_events[0].get("data", {}))
