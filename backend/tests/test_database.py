"""Tests for the SQLite database layer (backend/app/database.py).

All tests use an in-memory SQLite database for isolation and speed.
"""

from __future__ import annotations

import json
import sqlite3

import pytest

from app.database import (
    create_conversation,
    delete_conversation,
    get_connection,
    get_conversation,
    get_conversation_context,
    get_messages,
    init_db,
    list_conversations,
    save_message,
    search_conversations,
    set_conversation_context,
    update_conversation_metadata,
)


@pytest.fixture
def conn() -> sqlite3.Connection:
    """Provide a fresh in-memory SQLite connection with the schema initialized."""
    c = get_connection(":memory:")
    init_db(c)
    return c


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class TestSchema:
    """Verify that init_db creates the expected tables and indexes."""

    def test_tables_created(self, conn: sqlite3.Connection) -> None:
        """Both conversations and messages tables should exist."""
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        ).fetchall()
        table_names = [row["name"] for row in tables]
        assert "conversations" in table_names
        assert "messages" in table_names

    def test_index_created(self, conn: sqlite3.Connection) -> None:
        """The idx_messages_conversation_id index should exist."""
        indexes = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index'",
        ).fetchall()
        index_names = [row["name"] for row in indexes]
        assert "idx_messages_conversation_id" in index_names

    def test_foreign_keys_enabled(self, conn: sqlite3.Connection) -> None:
        """Foreign key enforcement should be ON."""
        fk = conn.execute("PRAGMA foreign_keys").fetchone()
        assert fk[0] == 1

    def test_idempotent_init(self, conn: sqlite3.Connection) -> None:
        """Calling init_db multiple times should not fail."""
        init_db(conn)
        init_db(conn)
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'",
        ).fetchall()
        assert len(tables) >= 2


# ---------------------------------------------------------------------------
# Conversation CRUD
# ---------------------------------------------------------------------------

class TestConversationCRUD:
    """Tests for conversation create, read, list, delete operations."""

    def test_create_returns_valid_dict(self, conn: sqlite3.Connection) -> None:
        """create_conversation should return a dict with expected keys."""
        conv = create_conversation(conn, title="Test Chat")
        assert "id" in conv
        assert conv["title"] == "Test Chat"
        assert "created_at" in conv
        assert "updated_at" in conv
        assert conv["messages"] == []

    def test_create_default_title(self, conn: sqlite3.Connection) -> None:
        """Creating a conversation without a title should default to empty string."""
        conv = create_conversation(conn)
        assert conv["title"] == ""

    def test_create_with_metadata(self, conn: sqlite3.Connection) -> None:
        """Creating a conversation with metadata should persist it."""
        meta = {"agent": "discovery", "priority": "high"}
        conv = create_conversation(conn, title="Meta", metadata=meta)
        assert conv["metadata"] == meta

    def test_get_existing(self, conn: sqlite3.Connection) -> None:
        """get_conversation should return the conversation and its messages."""
        conv = create_conversation(conn, title="Existing")
        fetched = get_conversation(conn, conv["id"])
        assert fetched is not None
        assert fetched["id"] == conv["id"]
        assert fetched["title"] == "Existing"

    def test_get_nonexistent(self, conn: sqlite3.Connection) -> None:
        """get_conversation should return None for a missing ID."""
        result = get_conversation(conn, "nonexistent-id")
        assert result is None

    def test_list_empty(self, conn: sqlite3.Connection) -> None:
        """list_conversations on an empty DB should return an empty list."""
        result = list_conversations(conn)
        assert result == []

    def test_list_ordered_by_updated(self, conn: sqlite3.Connection) -> None:
        """Conversations should be listed with most recently updated first."""
        c1 = create_conversation(conn, title="First")
        c2 = create_conversation(conn, title="Second")
        # c2 was created last, so it should appear first
        result = list_conversations(conn)
        assert len(result) == 2
        assert result[0]["id"] == c2["id"]
        assert result[1]["id"] == c1["id"]

    def test_list_includes_message_count(self, conn: sqlite3.Connection) -> None:
        """list_conversations should include message_count."""
        conv = create_conversation(conn, title="With Messages")
        save_message(conn, conv["id"], "user", "Hello")
        save_message(conn, conv["id"], "assistant", "Hi there!")
        result = list_conversations(conn)
        assert result[0]["message_count"] == 2

    def test_list_includes_last_message_preview(self, conn: sqlite3.Connection) -> None:
        """list_conversations should include a preview of the last message."""
        conv = create_conversation(conn, title="Preview Test")
        save_message(conn, conv["id"], "user", "First message")
        save_message(conn, conv["id"], "assistant", "Last message content")
        result = list_conversations(conn)
        assert result[0]["last_message_preview"] == "Last message content"

    def test_delete_existing(self, conn: sqlite3.Connection) -> None:
        """delete_conversation should return True and remove the conversation."""
        conv = create_conversation(conn, title="To Delete")
        save_message(conn, conv["id"], "user", "Bye")
        assert delete_conversation(conn, conv["id"]) is True
        assert get_conversation(conn, conv["id"]) is None

    def test_delete_nonexistent(self, conn: sqlite3.Connection) -> None:
        """delete_conversation should return False for a missing ID."""
        assert delete_conversation(conn, "nonexistent-id") is False

    def test_delete_removes_messages(self, conn: sqlite3.Connection) -> None:
        """Deleting a conversation should also remove its messages."""
        conv = create_conversation(conn, title="Delete Cascade")
        save_message(conn, conv["id"], "user", "Hello")
        delete_conversation(conn, conv["id"])
        messages = get_messages(conn, conv["id"])
        assert messages == []


# ---------------------------------------------------------------------------
# Message CRUD
# ---------------------------------------------------------------------------

class TestMessageCRUD:
    """Tests for message save and retrieval operations."""

    def test_save_returns_valid_dict(self, conn: sqlite3.Connection) -> None:
        """save_message should return a dict with expected keys."""
        conv = create_conversation(conn, title="Msg Test")
        msg = save_message(conn, conv["id"], "user", "Hello")
        assert "id" in msg
        assert msg["conversation_id"] == conv["id"]
        assert msg["role"] == "user"
        assert msg["content"] == "Hello"
        assert "created_at" in msg

    def test_save_with_agent_id(self, conn: sqlite3.Connection) -> None:
        """save_message should store the agent_id when provided."""
        conv = create_conversation(conn)
        msg = save_message(conn, conv["id"], "assistant", "Response", agent_id="discovery")
        assert msg["agent_id"] == "discovery"

    def test_save_with_metadata(self, conn: sqlite3.Connection) -> None:
        """save_message should store metadata when provided."""
        conv = create_conversation(conn)
        meta = {"tokens": 150, "model": "gpt-4"}
        msg = save_message(conn, conv["id"], "assistant", "Response", metadata=meta)
        assert msg["metadata"] == meta

    def test_save_updates_conversation_timestamp(self, conn: sqlite3.Connection) -> None:
        """Saving a message should update the conversation's updated_at."""
        conv = create_conversation(conn, title="Timestamp Test")
        original_updated = conv["updated_at"]
        save_message(conn, conv["id"], "user", "New message")
        refreshed = get_conversation(conn, conv["id"])
        assert refreshed is not None
        assert refreshed["updated_at"] >= original_updated

    def test_get_messages_ordered_asc(self, conn: sqlite3.Connection) -> None:
        """get_messages should return messages in chronological order."""
        conv = create_conversation(conn)
        save_message(conn, conv["id"], "user", "First")
        save_message(conn, conv["id"], "assistant", "Second")
        save_message(conn, conv["id"], "user", "Third")
        messages = get_messages(conn, conv["id"])
        assert len(messages) == 3
        assert messages[0]["content"] == "First"
        assert messages[1]["content"] == "Second"
        assert messages[2]["content"] == "Third"

    def test_get_messages_empty_conversation(self, conn: sqlite3.Connection) -> None:
        """get_messages for a conversation with no messages returns empty list."""
        conv = create_conversation(conn)
        messages = get_messages(conn, conv["id"])
        assert messages == []

    def test_role_validation(self, conn: sqlite3.Connection) -> None:
        """Messages with invalid roles should be rejected by the CHECK constraint."""
        conv = create_conversation(conn)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                ("test-id", conv["id"], "invalid_role", "bad", "2026-01-01T00:00:00Z"),
            )


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class TestSearch:
    """Tests for the search_conversations function."""

    def test_search_by_title(self, conn: sqlite3.Connection) -> None:
        """Should find conversations whose title matches the query."""
        create_conversation(conn, title="Discovery Audit Report")
        create_conversation(conn, title="Unrelated Chat")
        results = search_conversations(conn, "Discovery")
        assert len(results) == 1
        assert results[0]["title"] == "Discovery Audit Report"

    def test_search_by_message_content(self, conn: sqlite3.Connection) -> None:
        """Should find conversations that have matching message content."""
        conv = create_conversation(conn, title="General Chat")
        save_message(conn, conv["id"], "assistant", "The CMDB contains 500 servers.")
        results = search_conversations(conn, "CMDB")
        assert len(results) == 1
        assert results[0]["id"] == conv["id"]

    def test_search_case_insensitive(self, conn: sqlite3.Connection) -> None:
        """Search should be case-insensitive."""
        create_conversation(conn, title="IMPORTANT AUDIT")
        results = search_conversations(conn, "important")
        assert len(results) == 1

    def test_search_no_results(self, conn: sqlite3.Connection) -> None:
        """Search with no matches should return an empty list."""
        create_conversation(conn, title="Something Else")
        results = search_conversations(conn, "xyznonexistent")
        assert results == []


# ---------------------------------------------------------------------------
# Context / Metadata
# ---------------------------------------------------------------------------

class TestContext:
    """Tests for conversation context (metadata) operations."""

    def test_get_context(self, conn: sqlite3.Connection) -> None:
        """get_conversation_context should return the metadata dict."""
        meta = {"agent_routing": "discovery"}
        conv = create_conversation(conn, metadata=meta)
        ctx = get_conversation_context(conn, conv["id"])
        assert ctx == meta

    def test_get_context_nonexistent(self, conn: sqlite3.Connection) -> None:
        """get_conversation_context returns None for missing conversations."""
        assert get_conversation_context(conn, "missing") is None

    def test_set_context(self, conn: sqlite3.Connection) -> None:
        """set_conversation_context should replace the metadata."""
        conv = create_conversation(conn)
        new_ctx = {"session": "abc123", "mode": "auto"}
        result = set_conversation_context(conn, conv["id"], new_ctx)
        assert result is True
        assert get_conversation_context(conn, conv["id"]) == new_ctx

    def test_set_context_nonexistent(self, conn: sqlite3.Connection) -> None:
        """set_conversation_context returns False for missing conversations."""
        assert set_conversation_context(conn, "missing", {"key": "val"}) is False

    def test_update_metadata(self, conn: sqlite3.Connection) -> None:
        """update_conversation_metadata should update and return True."""
        conv = create_conversation(conn, metadata={"old": "value"})
        new_meta = {"new": "data"}
        assert update_conversation_metadata(conn, conv["id"], new_meta) is True
        ctx = get_conversation_context(conn, conv["id"])
        assert ctx == new_meta
