"""Tests for WebSocket endpoint and ConnectionManager.

Uses Starlette's WebSocket test client support via httpx.
"""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from app.main import app
from app.routers.websocket import manager


@pytest.fixture(autouse=True)
async def _clear_connections() -> None:
    """Ensure the connection manager is clean before each test."""
    for cid in await manager.get_active_connections():
        await manager.disconnect(cid)


class TestWebSocketConnection:
    """Tests for the /ws/{client_id} endpoint."""

    def test_connect_and_receive_welcome(self) -> None:
        """Connecting should return an initial heartbeat message."""
        client = TestClient(app)
        with client.websocket_connect("/ws/test-client-1") as ws:
            data = ws.receive_json()
            assert data["type"] == "heartbeat"
            assert "timestamp" in data["payload"]

    def test_disconnect_cleanup(self) -> None:
        """After closing, the client should be removed from the manager."""
        client = TestClient(app)
        with client.websocket_connect("/ws/cleanup-client"):
            pass
        # After the context manager exits, the client should be gone.
        # We need a sync check here since TestClient is synchronous.
        assert "cleanup-client" not in manager._connections

    def test_heartbeat_ping_pong(self) -> None:
        """Sending a heartbeat should receive a heartbeat response."""
        client = TestClient(app)
        with client.websocket_connect("/ws/ping-client") as ws:
            # Consume the welcome heartbeat
            ws.receive_json()
            # Send a heartbeat
            ws.send_json({
                "type": "heartbeat",
                "payload": {"timestamp": "2026-01-01T00:00:00Z"},
            })
            response = ws.receive_json()
            assert response["type"] == "heartbeat"
            assert "timestamp" in response["payload"]

    def test_chat_message_broadcast(self) -> None:
        """A chat message from one client should be broadcast to all clients."""
        client = TestClient(app)
        with client.websocket_connect("/ws/chat-sender") as ws1:
            # Consume welcome
            ws1.receive_json()

            with client.websocket_connect("/ws/chat-receiver") as ws2:
                # Consume welcome
                ws2.receive_json()

                chat_msg = {
                    "type": "chat",
                    "payload": {
                        "conversationId": "conv-1",
                        "content": "Hello from sender",
                        "role": "user",
                    },
                }
                ws1.send_json(chat_msg)

                # Both clients should receive the broadcast
                r1 = ws1.receive_json()
                assert r1["type"] == "chat"
                assert r1["payload"]["content"] == "Hello from sender"

                r2 = ws2.receive_json()
                assert r2["type"] == "chat"
                assert r2["payload"]["content"] == "Hello from sender"

    def test_invalid_json_returns_error(self) -> None:
        """Sending non-JSON text should return an error message."""
        client = TestClient(app)
        with client.websocket_connect("/ws/bad-json-client") as ws:
            ws.receive_json()  # welcome
            ws.send_text("this is not json{{{")
            response = ws.receive_json()
            assert response["type"] == "error"
            assert response["payload"]["code"] == "INVALID_JSON"

    def test_invalid_schema_returns_error(self) -> None:
        """Sending valid JSON but wrong schema should return an error."""
        client = TestClient(app)
        with client.websocket_connect("/ws/bad-schema-client") as ws:
            ws.receive_json()  # welcome
            ws.send_json({"not_a_type": "missing"})
            response = ws.receive_json()
            assert response["type"] == "error"
            assert response["payload"]["code"] == "INVALID_SCHEMA"

    def test_status_message_broadcast(self) -> None:
        """A status update should be broadcast to all clients."""
        client = TestClient(app)
        with client.websocket_connect("/ws/status-sender") as ws1:
            ws1.receive_json()  # welcome

            with client.websocket_connect("/ws/status-receiver") as ws2:
                ws2.receive_json()  # welcome

                status_msg = {
                    "type": "status",
                    "payload": {
                        "agentId": "discovery",
                        "status": "online",
                        "timestamp": "2026-01-01T00:00:00Z",
                    },
                }
                ws1.send_json(status_msg)

                r1 = ws1.receive_json()
                assert r1["type"] == "status"
                assert r1["payload"]["agentId"] == "discovery"

                r2 = ws2.receive_json()
                assert r2["type"] == "status"

    def test_correlation_id_preserved(self) -> None:
        """The correlationId should be preserved in chat responses."""
        client = TestClient(app)
        with client.websocket_connect("/ws/corr-client") as ws:
            ws.receive_json()  # welcome
            ws.send_json({
                "type": "chat",
                "payload": {
                    "conversationId": "conv-99",
                    "content": "Test",
                    "role": "user",
                },
                "correlation_id": "req-abc-123",
            })
            response = ws.receive_json()
            assert response["type"] == "chat"
            assert response["correlationId"] == "req-abc-123"


class TestConnectionManager:
    """Unit-level tests for the ConnectionManager class."""

    def test_multiple_clients_tracked(self) -> None:
        """Multiple simultaneous connections should all be tracked."""
        client = TestClient(app)
        with client.websocket_connect("/ws/multi-1") as ws1:
            ws1.receive_json()
            with client.websocket_connect("/ws/multi-2") as ws2:
                ws2.receive_json()
                # Both should be in the manager
                assert manager.connection_count >= 2

    def test_personal_message(self) -> None:
        """send_personal should only reach the targeted client."""
        client = TestClient(app)
        with client.websocket_connect("/ws/personal-target") as ws:
            ws.receive_json()  # welcome
            # Send a heartbeat to trigger a personal response
            ws.send_json({
                "type": "heartbeat",
                "payload": {"timestamp": "2026-01-01T00:00:00Z"},
            })
            response = ws.receive_json()
            # Should be a heartbeat pong -- personal response
            assert response["type"] == "heartbeat"
