"""Conversation management API router.

Provides CRUD endpoints for conversations and messages, plus search and
export capabilities. All endpoints require authentication (dev mode skips
token validation).

Endpoints:
    GET    /api/conversations          -- List all conversations
    POST   /api/conversations          -- Create a new conversation
    GET    /api/conversations/search   -- Search conversations
    GET    /api/conversations/{id}     -- Get conversation with messages
    DELETE /api/conversations/{id}     -- Delete a conversation
    GET    /api/conversations/{id}/messages  -- Get messages only
    POST   /api/conversations/{id}/messages  -- Add a message
    GET    /api/conversations/{id}/export    -- Export conversation
    PUT    /api/conversations/{id}/context   -- Update conversation context
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..auth import get_current_user
from ..config import Settings, get_settings
from ..models.auth import CurrentUser
from ..services.conversation_service import get_conversation_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["conversations"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CreateConversationRequest(BaseModel):
    """Request body for creating a new conversation."""

    title: str = Field(default="", description="Optional title for the conversation")
    initial_message: str | None = Field(
        default=None,
        description="Optional first message to seed the conversation with",
    )
    agent_id: str | None = Field(
        default=None,
        description="Optional default agent for this conversation",
    )


class AddMessageRequest(BaseModel):
    """Request body for adding a message to a conversation."""

    role: str = Field(
        ...,
        description="Message role: 'user', 'assistant', or 'system'",
        pattern=r"^(user|assistant|system)$",
    )
    content: str = Field(
        ...,
        min_length=1,
        max_length=50000,
        description="The message text content",
    )
    agent_id: str | None = Field(
        default=None,
        description="Optional agent ID for assistant messages",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional metadata to attach to the message",
    )


class UpdateContextRequest(BaseModel):
    """Request body for updating conversation context (metadata)."""

    context: dict[str, Any] = Field(
        ...,
        description="The context data to store as conversation metadata",
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/conversations",
    summary="List all conversations",
    description=(
        "Returns all conversations ordered by most recently updated. "
        "Each entry includes a message count and a preview of the last message."
    ),
    responses={
        200: {"description": "List of conversation summaries"},
        401: {"description": "Authentication required"},
    },
)
async def list_conversations(
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    """List all conversations with summary information."""
    service = get_conversation_service(settings)
    return service.list_conversations()


@router.post(
    "/conversations",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new conversation",
    description=(
        "Create a new conversation. Optionally provide a title and an initial "
        "message to seed the conversation."
    ),
    responses={
        201: {"description": "The newly created conversation"},
        401: {"description": "Authentication required"},
        422: {"description": "Invalid request payload"},
    },
)
async def create_conversation(
    request: CreateConversationRequest,
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Create a new conversation."""
    service = get_conversation_service(settings)
    return service.create_conversation(
        title=request.title,
        initial_message=request.initial_message,
        agent_id=request.agent_id,
    )


@router.get(
    "/conversations/search",
    summary="Search conversations",
    description=(
        "Search conversations by title and message content using a text query. "
        "Returns matching conversations ordered by most recently updated."
    ),
    responses={
        200: {"description": "List of matching conversations"},
        401: {"description": "Authentication required"},
    },
)
async def search_conversations(
    q: str = Query(
        ...,
        min_length=1,
        max_length=200,
        description="Search query string",
    ),
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    """Search conversations by title and message content."""
    service = get_conversation_service(settings)
    return service.search(q)


@router.get(
    "/conversations/{conv_id}",
    summary="Get a conversation with messages",
    description=(
        "Fetch a single conversation by ID, including its full message history "
        "ordered chronologically."
    ),
    responses={
        200: {"description": "The conversation with all messages"},
        401: {"description": "Authentication required"},
        404: {"description": "Conversation not found"},
    },
)
async def get_conversation(
    conv_id: str,
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Get a conversation with its full message history."""
    service = get_conversation_service(settings)
    conv = service.get_conversation_with_messages(conv_id)
    if conv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conv_id}' not found.",
        )
    return conv


@router.delete(
    "/conversations/{conv_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation",
    description="Delete a conversation and all its messages permanently.",
    responses={
        204: {"description": "Conversation deleted successfully"},
        401: {"description": "Authentication required"},
        404: {"description": "Conversation not found"},
    },
)
async def delete_conversation(
    conv_id: str,
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> None:
    """Delete a conversation and all its messages."""
    service = get_conversation_service(settings)
    deleted = service.delete_conversation(conv_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conv_id}' not found.",
        )


@router.get(
    "/conversations/{conv_id}/messages",
    summary="Get messages for a conversation",
    description="Fetch all messages in a conversation, ordered chronologically.",
    responses={
        200: {"description": "List of messages"},
        401: {"description": "Authentication required"},
    },
)
async def get_messages(
    conv_id: str,
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    """Get all messages for a conversation."""
    service = get_conversation_service(settings)
    return service.get_messages(conv_id)


@router.post(
    "/conversations/{conv_id}/messages",
    status_code=status.HTTP_201_CREATED,
    summary="Add a message to a conversation",
    description=(
        "Add a new message to an existing conversation. The conversation's "
        "updated_at timestamp is automatically refreshed."
    ),
    responses={
        201: {"description": "The newly created message"},
        401: {"description": "Authentication required"},
        404: {"description": "Conversation not found"},
        422: {"description": "Invalid request payload"},
    },
)
async def add_message(
    conv_id: str,
    request: AddMessageRequest,
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Add a message to a conversation."""
    service = get_conversation_service(settings)

    # Verify the conversation exists
    conv = service.get_conversation_with_messages(conv_id)
    if conv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conv_id}' not found.",
        )

    return service.add_message(
        conv_id=conv_id,
        role=request.role,
        content=request.content,
        agent_id=request.agent_id,
        metadata=request.metadata,
    )


@router.get(
    "/conversations/{conv_id}/export",
    summary="Export a conversation",
    description=(
        "Export a conversation in the specified format. "
        "Supported formats: json (default), text, markdown."
    ),
    responses={
        200: {"description": "Exported conversation content"},
        401: {"description": "Authentication required"},
        404: {"description": "Conversation not found"},
    },
)
async def export_conversation(
    conv_id: str,
    format: str = Query(
        default="json",
        description="Export format: json, text, or markdown",
        pattern=r"^(json|text|markdown)$",
    ),
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Export a conversation in the specified format."""
    service = get_conversation_service(settings)
    result = service.export_conversation(conv_id, fmt=format)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conv_id}' not found.",
        )

    # Determine content type based on format
    content_types = {
        "json": "application/json",
        "text": "text/plain",
        "markdown": "text/markdown",
    }

    return {
        "conversation_id": conv_id,
        "format": format,
        "content_type": content_types.get(format, "text/plain"),
        "content": result,
    }


@router.put(
    "/conversations/{conv_id}/context",
    summary="Update conversation context",
    description=(
        "Update the metadata/context for a conversation. This is used to "
        "store agent routing preferences, session state, and other context."
    ),
    responses={
        200: {"description": "Context updated successfully"},
        401: {"description": "Authentication required"},
        404: {"description": "Conversation not found"},
    },
)
async def update_context(
    conv_id: str,
    request: UpdateContextRequest,
    _user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    """Update the context (metadata) for a conversation."""
    service = get_conversation_service(settings)
    updated = service.update_context(conv_id, request.context)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conv_id}' not found.",
        )
    return {"status": "updated", "conversation_id": conv_id}
