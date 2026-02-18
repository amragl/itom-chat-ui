"""Integration tests for the conversations API router.

Uses the FastAPI TestClient with the dev auth mode so token validation is
bypassed. Each test gets a fresh database by resetting the DB singleton.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import reset_db
from app.main import app
from app.services.conversation_service import reset_conversation_service


@pytest.fixture(autouse=True)
def _reset_state() -> None:
    """Reset database and service singletons before each test."""
    reset_conversation_service()
    reset_db()


@pytest.fixture
async def client():
    """Provide an async HTTP test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Conversation CRUD
# ---------------------------------------------------------------------------

class TestConversationCRUD:
    """Test the conversations CRUD endpoints."""

    async def test_list_empty(self, client: AsyncClient) -> None:
        """GET /api/conversations on empty DB should return empty list."""
        response = await client.get("/api/conversations")
        assert response.status_code == 200
        assert response.json() == []

    async def test_create_conversation(self, client: AsyncClient) -> None:
        """POST /api/conversations should create and return a conversation."""
        response = await client.post(
            "/api/conversations",
            json={"title": "Test Conversation"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Test Conversation"
        assert "id" in data
        assert "created_at" in data

    async def test_create_with_initial_message(self, client: AsyncClient) -> None:
        """POST /api/conversations with initial_message should seed a message."""
        response = await client.post(
            "/api/conversations",
            json={"initial_message": "Hello, what can you help me with?"},
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data["messages"]) == 1
        assert data["messages"][0]["role"] == "user"
        assert data["messages"][0]["content"] == "Hello, what can you help me with?"
        # Title should be auto-generated from the message
        assert data["title"] != ""

    async def test_get_conversation(self, client: AsyncClient) -> None:
        """GET /api/conversations/{id} should return the conversation."""
        create_resp = await client.post(
            "/api/conversations",
            json={"title": "Fetch Me"},
        )
        conv_id = create_resp.json()["id"]

        response = await client.get(f"/api/conversations/{conv_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == conv_id
        assert data["title"] == "Fetch Me"

    async def test_get_nonexistent_returns_404(self, client: AsyncClient) -> None:
        """GET /api/conversations/{id} for missing ID should return 404."""
        response = await client.get("/api/conversations/nonexistent-id")
        assert response.status_code == 404

    async def test_delete_conversation(self, client: AsyncClient) -> None:
        """DELETE /api/conversations/{id} should remove the conversation."""
        create_resp = await client.post(
            "/api/conversations",
            json={"title": "Delete Me"},
        )
        conv_id = create_resp.json()["id"]

        delete_resp = await client.delete(f"/api/conversations/{conv_id}")
        assert delete_resp.status_code == 204

        # Verify it is gone
        get_resp = await client.get(f"/api/conversations/{conv_id}")
        assert get_resp.status_code == 404

    async def test_delete_nonexistent_returns_404(self, client: AsyncClient) -> None:
        """DELETE /api/conversations/{id} for missing ID should return 404."""
        response = await client.delete("/api/conversations/nonexistent-id")
        assert response.status_code == 404

    async def test_list_after_create(self, client: AsyncClient) -> None:
        """After creating conversations, list should return them all."""
        await client.post("/api/conversations", json={"title": "Conv A"})
        await client.post("/api/conversations", json={"title": "Conv B"})

        response = await client.get("/api/conversations")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

class TestMessages:
    """Test the message endpoints within conversations."""

    async def test_add_message(self, client: AsyncClient) -> None:
        """POST /api/conversations/{id}/messages should add a message."""
        create_resp = await client.post(
            "/api/conversations",
            json={"title": "Msg Test"},
        )
        conv_id = create_resp.json()["id"]

        msg_resp = await client.post(
            f"/api/conversations/{conv_id}/messages",
            json={"role": "user", "content": "Hello agent"},
        )
        assert msg_resp.status_code == 201
        data = msg_resp.json()
        assert data["role"] == "user"
        assert data["content"] == "Hello agent"
        assert data["conversation_id"] == conv_id

    async def test_add_message_to_nonexistent(self, client: AsyncClient) -> None:
        """Adding a message to a nonexistent conversation should return 404."""
        response = await client.post(
            "/api/conversations/nonexistent/messages",
            json={"role": "user", "content": "Hello"},
        )
        assert response.status_code == 404

    async def test_get_messages(self, client: AsyncClient) -> None:
        """GET /api/conversations/{id}/messages should return all messages."""
        create_resp = await client.post(
            "/api/conversations",
            json={"title": "Messages List"},
        )
        conv_id = create_resp.json()["id"]

        await client.post(
            f"/api/conversations/{conv_id}/messages",
            json={"role": "user", "content": "First"},
        )
        await client.post(
            f"/api/conversations/{conv_id}/messages",
            json={"role": "assistant", "content": "Second", "agent_id": "discovery"},
        )

        response = await client.get(f"/api/conversations/{conv_id}/messages")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["content"] == "First"
        assert data[1]["content"] == "Second"
        assert data[1]["agent_id"] == "discovery"

    async def test_invalid_role_rejected(self, client: AsyncClient) -> None:
        """Adding a message with an invalid role should return 422."""
        create_resp = await client.post(
            "/api/conversations",
            json={"title": "Bad Role"},
        )
        conv_id = create_resp.json()["id"]

        response = await client.post(
            f"/api/conversations/{conv_id}/messages",
            json={"role": "invalid", "content": "Bad"},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class TestSearch:
    """Test the search endpoint."""

    async def test_search_by_title(self, client: AsyncClient) -> None:
        """GET /api/conversations/search?q= should search by title."""
        await client.post("/api/conversations", json={"title": "Discovery Audit"})
        await client.post("/api/conversations", json={"title": "Unrelated"})

        response = await client.get("/api/conversations/search", params={"q": "Discovery"})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["title"] == "Discovery Audit"

    async def test_search_by_message_content(self, client: AsyncClient) -> None:
        """Search should also match message content."""
        create_resp = await client.post(
            "/api/conversations",
            json={"title": "General"},
        )
        conv_id = create_resp.json()["id"]
        await client.post(
            f"/api/conversations/{conv_id}/messages",
            json={"role": "assistant", "content": "Found 42 CMDB records"},
        )

        response = await client.get("/api/conversations/search", params={"q": "CMDB"})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    async def test_search_no_results(self, client: AsyncClient) -> None:
        """Search with no matches returns empty list."""
        response = await client.get("/api/conversations/search", params={"q": "xyznonexistent"})
        assert response.status_code == 200
        assert response.json() == []


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

class TestExport:
    """Test the export endpoint with different formats."""

    async def _create_conversation_with_messages(self, client: AsyncClient) -> str:
        """Helper: create a conversation with messages and return its ID."""
        create_resp = await client.post(
            "/api/conversations",
            json={"title": "Export Test"},
        )
        conv_id = create_resp.json()["id"]
        await client.post(
            f"/api/conversations/{conv_id}/messages",
            json={"role": "user", "content": "What is the status?"},
        )
        await client.post(
            f"/api/conversations/{conv_id}/messages",
            json={
                "role": "assistant",
                "content": "All systems operational.",
                "agent_id": "auditor",
            },
        )
        return conv_id

    async def test_export_json(self, client: AsyncClient) -> None:
        """Export as JSON should return valid JSON content."""
        conv_id = await self._create_conversation_with_messages(client)
        response = await client.get(
            f"/api/conversations/{conv_id}/export",
            params={"format": "json"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["format"] == "json"
        assert data["content_type"] == "application/json"
        assert "Export Test" in data["content"]

    async def test_export_text(self, client: AsyncClient) -> None:
        """Export as text should return plain text content."""
        conv_id = await self._create_conversation_with_messages(client)
        response = await client.get(
            f"/api/conversations/{conv_id}/export",
            params={"format": "text"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["format"] == "text"
        assert data["content_type"] == "text/plain"
        assert "USER:" in data["content"]
        assert "ASSISTANT" in data["content"]

    async def test_export_markdown(self, client: AsyncClient) -> None:
        """Export as markdown should return formatted markdown."""
        conv_id = await self._create_conversation_with_messages(client)
        response = await client.get(
            f"/api/conversations/{conv_id}/export",
            params={"format": "markdown"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["format"] == "markdown"
        assert data["content_type"] == "text/markdown"
        assert "# Export Test" in data["content"]
        assert "### User" in data["content"]

    async def test_export_nonexistent_returns_404(self, client: AsyncClient) -> None:
        """Exporting a nonexistent conversation should return 404."""
        response = await client.get(
            "/api/conversations/nonexistent/export",
            params={"format": "json"},
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

class TestContext:
    """Test the context/metadata endpoint."""

    async def test_update_context(self, client: AsyncClient) -> None:
        """PUT /api/conversations/{id}/context should update metadata."""
        create_resp = await client.post(
            "/api/conversations",
            json={"title": "Context Test"},
        )
        conv_id = create_resp.json()["id"]

        ctx_resp = await client.put(
            f"/api/conversations/{conv_id}/context",
            json={"context": {"agent_preference": "auditor", "mode": "detailed"}},
        )
        assert ctx_resp.status_code == 200
        assert ctx_resp.json()["status"] == "updated"

        # Verify context was persisted
        conv_resp = await client.get(f"/api/conversations/{conv_id}")
        assert conv_resp.json()["metadata"]["agent_preference"] == "auditor"

    async def test_update_context_nonexistent(self, client: AsyncClient) -> None:
        """Updating context for a nonexistent conversation should return 404."""
        response = await client.put(
            "/api/conversations/nonexistent/context",
            json={"context": {"key": "value"}},
        )
        assert response.status_code == 404
