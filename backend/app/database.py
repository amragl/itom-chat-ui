"""SQLite database layer for conversation persistence.

Provides functions for creating, reading, updating, and deleting conversations
and messages using the Python standard library sqlite3 module. All data is
stored in a single SQLite database file configured via Settings.database_url.

Thread-safety: Each call to get_db() returns a module-level connection that
is reused across the application. For the test suite, call reset_db() to
discard the connection so the next get_db() call creates a fresh one.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from typing import Any

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    agent_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages(conversation_id);
"""

# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------

_connection: sqlite3.Connection | None = None


def _parse_database_url(database_url: str) -> str:
    """Convert a ``sqlite:///path`` URL to a plain filesystem path.

    Handles the common SQLAlchemy-style URLs:
    - ``sqlite:///./chat.db`` -> ``./chat.db``
    - ``sqlite://:memory:``   -> ``:memory:``
    - ``:memory:``            -> ``:memory:``
    """
    if database_url == ":memory:":
        return ":memory:"
    if database_url.startswith("sqlite:///"):
        return database_url[len("sqlite:///"):]
    if database_url.startswith("sqlite://"):
        remainder = database_url[len("sqlite://"):]
        if remainder in (":memory:", ""):
            return ":memory:"
        return remainder
    return database_url


def get_connection(database_url: str) -> sqlite3.Connection:
    """Open a new SQLite connection for *database_url*.

    Enables WAL mode and foreign key enforcement for every connection.
    """
    path = _parse_database_url(database_url)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Create the schema tables and indexes if they do not already exist."""
    conn.executescript(_SCHEMA_SQL)


def get_db(database_url: str = "sqlite:///./chat.db") -> sqlite3.Connection:
    """Return the module-level singleton connection, creating it on first call.

    The connection is initialized with the schema automatically.
    """
    global _connection
    if _connection is None:
        _connection = get_connection(database_url)
        init_db(_connection)
    return _connection


def reset_db() -> None:
    """Close and discard the singleton connection.

    Primarily used by the test suite to ensure a clean state between tests.
    """
    global _connection
    if _connection is not None:
        try:
            _connection.close()
        except Exception:  # noqa: BLE001
            pass
        _connection = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    """Generate a new UUID4 string."""
    return str(uuid.uuid4())


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    """Convert a sqlite3.Row to a plain dict."""
    return dict(row)


# ---------------------------------------------------------------------------
# Conversation CRUD
# ---------------------------------------------------------------------------

def create_conversation(
    conn: sqlite3.Connection,
    title: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a new conversation and return its representation as a dict."""
    conv_id = _new_id()
    now = _now_iso()
    meta_json = json.dumps(metadata or {})

    conn.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?)",
        (conv_id, title, now, now, meta_json),
    )
    conn.commit()

    return {
        "id": conv_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
        "metadata": metadata or {},
        "messages": [],
    }


def get_conversation(conn: sqlite3.Connection, conv_id: str) -> dict[str, Any] | None:
    """Fetch a single conversation by ID, including its messages.

    Returns None if the conversation does not exist.
    """
    row = conn.execute(
        "SELECT id, title, created_at, updated_at, metadata FROM conversations WHERE id = ?",
        (conv_id,),
    ).fetchone()

    if row is None:
        return None

    conv = _row_to_dict(row)
    conv["metadata"] = json.loads(conv["metadata"])
    conv["messages"] = get_messages(conn, conv_id)
    return conv


def list_conversations(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """List all conversations ordered by most recently updated.

    Each item includes ``message_count`` and ``last_message_preview`` for
    display in sidebar lists without loading full message histories.
    """
    rows = conn.execute(
        """
        SELECT
            c.id,
            c.title,
            c.created_at,
            c.updated_at,
            c.metadata,
            COUNT(m.id) AS message_count,
            (
                SELECT content FROM messages
                WHERE conversation_id = c.id
                ORDER BY created_at DESC
                LIMIT 1
            ) AS last_message_content
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        """,
    ).fetchall()

    results: list[dict[str, Any]] = []
    for row in rows:
        d = _row_to_dict(row)
        d["metadata"] = json.loads(d["metadata"])
        # Truncate last message to a preview
        last_msg = d.pop("last_message_content", None)
        d["last_message_preview"] = (last_msg[:100] + "...") if last_msg and len(last_msg) > 100 else last_msg
        results.append(d)

    return results


def delete_conversation(conn: sqlite3.Connection, conv_id: str) -> bool:
    """Delete a conversation and its messages. Returns True if it existed."""
    # Delete messages first (CASCADE should handle this, but be explicit)
    conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
    cursor = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    return cursor.rowcount > 0


def search_conversations(conn: sqlite3.Connection, query: str) -> list[dict[str, Any]]:
    """Search conversations by title and message content.

    Returns conversations whose title or any message content matches the
    query using a case-insensitive LIKE search.
    """
    like_pattern = f"%{query}%"
    rows = conn.execute(
        """
        SELECT DISTINCT
            c.id,
            c.title,
            c.created_at,
            c.updated_at,
            c.metadata,
            (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.title LIKE ? OR m.content LIKE ?
        ORDER BY c.updated_at DESC
        """,
        (like_pattern, like_pattern),
    ).fetchall()

    results: list[dict[str, Any]] = []
    for row in rows:
        d = _row_to_dict(row)
        d["metadata"] = json.loads(d["metadata"])
        d["last_message_preview"] = None
        results.append(d)

    return results


def update_conversation_metadata(
    conn: sqlite3.Connection,
    conv_id: str,
    metadata: dict[str, Any],
) -> bool:
    """Update the metadata JSON for a conversation. Returns True if it existed."""
    now = _now_iso()
    cursor = conn.execute(
        "UPDATE conversations SET metadata = ?, updated_at = ? WHERE id = ?",
        (json.dumps(metadata), now, conv_id),
    )
    conn.commit()
    return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Message CRUD
# ---------------------------------------------------------------------------

def save_message(
    conn: sqlite3.Connection,
    conversation_id: str,
    role: str,
    content: str,
    agent_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Save a new message to a conversation and return it as a dict.

    Also updates the conversation's ``updated_at`` timestamp.
    """
    msg_id = _new_id()
    now = _now_iso()
    meta_json = json.dumps(metadata or {})

    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, agent_id, metadata) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (msg_id, conversation_id, role, content, now, agent_id, meta_json),
    )
    # Touch the conversation's updated_at
    conn.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        (now, conversation_id),
    )
    conn.commit()

    return {
        "id": msg_id,
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "created_at": now,
        "agent_id": agent_id,
        "metadata": metadata or {},
    }


def get_messages(conn: sqlite3.Connection, conversation_id: str) -> list[dict[str, Any]]:
    """Get all messages for a conversation, ordered by creation time ASC."""
    rows = conn.execute(
        "SELECT id, conversation_id, role, content, created_at, agent_id, metadata "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,),
    ).fetchall()

    results: list[dict[str, Any]] = []
    for row in rows:
        d = _row_to_dict(row)
        d["metadata"] = json.loads(d["metadata"])
        results.append(d)

    return results


# ---------------------------------------------------------------------------
# Context helpers
# ---------------------------------------------------------------------------

def get_conversation_context(
    conn: sqlite3.Connection,
    conv_id: str,
) -> dict[str, Any] | None:
    """Return the metadata dict for a conversation, or None if not found."""
    row = conn.execute(
        "SELECT metadata FROM conversations WHERE id = ?",
        (conv_id,),
    ).fetchone()

    if row is None:
        return None
    return json.loads(row["metadata"])


def set_conversation_context(
    conn: sqlite3.Connection,
    conv_id: str,
    context: dict[str, Any],
) -> bool:
    """Update the metadata (context) for a conversation.

    Returns True if the conversation existed and was updated.
    """
    return update_conversation_metadata(conn, conv_id, context)
