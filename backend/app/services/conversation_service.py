"""Business logic for conversation operations.

Provides a high-level service layer that composes database CRUD with
artifact detection and export formatting. Router endpoints delegate to
this service rather than calling database functions directly.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from ..artifact_detector import ArtifactDetector
from ..config import Settings
from ..database import (
    create_conversation,
    delete_conversation,
    get_conversation,
    get_db,
    get_messages,
    list_conversations,
    save_message,
    search_conversations,
    set_conversation_context,
    update_conversation_metadata,
)

logger = logging.getLogger(__name__)


class ConversationService:
    """Encapsulates conversation business logic.

    Connects to the SQLite database via the module-level singleton in
    ``database.py`` and uses the ``ArtifactDetector`` to detect structured
    content in agent responses.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._detector = ArtifactDetector()

    @property
    def _conn(self):
        """Return the database connection, lazily initialized."""
        return get_db(self._settings.database_url)

    # -- Conversations ------------------------------------------------------

    def create_conversation(
        self,
        title: str = "",
        initial_message: str | None = None,
        agent_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a new conversation, optionally seeding it with an initial message.

        If *initial_message* is provided it is saved as a ``user`` role message.
        When no title is given, the first 60 characters of the initial message
        are used as the conversation title.
        """
        effective_title = title
        if not effective_title and initial_message:
            effective_title = initial_message[:60] + ("..." if len(initial_message) > 60 else "")

        conv = create_conversation(self._conn, title=effective_title)

        if initial_message:
            msg = save_message(
                self._conn,
                conversation_id=conv["id"],
                role="user",
                content=initial_message,
                agent_id=agent_id,
            )
            conv["messages"] = [msg]

        return conv

    def get_conversation_with_messages(self, conv_id: str) -> dict[str, Any] | None:
        """Fetch a conversation with its full message history."""
        return get_conversation(self._conn, conv_id)

    def list_conversations(self) -> list[dict[str, Any]]:
        """List all conversations ordered by most recently updated."""
        return list_conversations(self._conn)

    def delete_conversation(self, conv_id: str) -> bool:
        """Delete a conversation and all its messages."""
        return delete_conversation(self._conn, conv_id)

    # -- Messages -----------------------------------------------------------

    def add_message(
        self,
        conv_id: str,
        role: str,
        content: str,
        agent_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Add a message to a conversation.

        For assistant messages, artifact detection is run automatically and
        any detected artifacts are stored in the message metadata.
        """
        effective_metadata = dict(metadata or {})

        if role == "assistant":
            artifacts = self._detector.detect(content)
            if artifacts:
                effective_metadata["artifacts"] = [
                    a.model_dump(mode="json") for a in artifacts
                ]

        return save_message(
            self._conn,
            conversation_id=conv_id,
            role=role,
            content=content,
            agent_id=agent_id,
            metadata=effective_metadata,
        )

    def get_messages(self, conv_id: str) -> list[dict[str, Any]]:
        """Get all messages for a conversation."""
        return get_messages(self._conn, conv_id)

    # -- Search -------------------------------------------------------------

    def search(self, query: str) -> list[dict[str, Any]]:
        """Search conversations by title and message content."""
        return search_conversations(self._conn, query)

    # -- Context ------------------------------------------------------------

    def update_context(self, conv_id: str, context: dict[str, Any]) -> bool:
        """Update the context (metadata) for a conversation."""
        return set_conversation_context(self._conn, conv_id, context)

    # -- Export -------------------------------------------------------------

    def export_conversation(self, conv_id: str, fmt: str = "json") -> str | None:
        """Export a conversation in the specified format.

        Supported formats:
        - ``json``: Full conversation data as pretty-printed JSON.
        - ``text``: Plain text with timestamps and role labels.
        - ``markdown``: Formatted markdown with headers per agent.

        Returns None if the conversation does not exist.
        """
        conv = get_conversation(self._conn, conv_id)
        if conv is None:
            return None

        if fmt == "json":
            return self._export_json(conv)
        if fmt == "text":
            return self._export_text(conv)
        if fmt == "markdown":
            return self._export_markdown(conv)

        # Default to JSON for unknown formats
        return self._export_json(conv)

    @staticmethod
    def _export_json(conv: dict[str, Any]) -> str:
        """Export as pretty-printed JSON."""
        return json.dumps(conv, indent=2, default=str)

    @staticmethod
    def _export_text(conv: dict[str, Any]) -> str:
        """Export as plain text with timestamps."""
        lines: list[str] = []
        title = conv.get("title", "Untitled Conversation")
        lines.append(f"Conversation: {title}")
        lines.append(f"Created: {conv.get('created_at', 'unknown')}")
        lines.append(f"Updated: {conv.get('updated_at', 'unknown')}")
        lines.append("")
        lines.append("-" * 60)

        for msg in conv.get("messages", []):
            role = msg.get("role", "unknown").upper()
            agent = msg.get("agent_id", "")
            label = f"{role}" + (f" ({agent})" if agent else "")
            timestamp = msg.get("created_at", "")
            lines.append(f"[{timestamp}] {label}:")
            lines.append(msg.get("content", ""))
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def _export_markdown(conv: dict[str, Any]) -> str:
        """Export as formatted markdown."""
        lines: list[str] = []
        title = conv.get("title", "Untitled Conversation")
        lines.append(f"# {title}")
        lines.append("")
        lines.append(f"**Created:** {conv.get('created_at', 'unknown')}")
        lines.append(f"**Updated:** {conv.get('updated_at', 'unknown')}")
        lines.append("")
        lines.append("---")
        lines.append("")

        for msg in conv.get("messages", []):
            role = msg.get("role", "unknown")
            agent = msg.get("agent_id", "")
            timestamp = msg.get("created_at", "")

            if role == "user":
                lines.append(f"### User ({timestamp})")
            elif role == "assistant":
                agent_label = agent if agent else "ITOM Agent"
                lines.append(f"### {agent_label} ({timestamp})")
            else:
                lines.append(f"### System ({timestamp})")

            lines.append("")
            lines.append(msg.get("content", ""))
            lines.append("")

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_service: ConversationService | None = None


def get_conversation_service(settings: Settings) -> ConversationService:
    """Return a singleton ConversationService instance."""
    global _service
    if _service is None:
        _service = ConversationService(settings)
    return _service


def reset_conversation_service() -> None:
    """Reset the singleton. Used by the test suite."""
    global _service
    _service = None
