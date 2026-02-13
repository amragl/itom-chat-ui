"""Chat API router for proxying messages to the itom-orchestrator.

Provides the POST /chat endpoint that receives user messages, assembles
conversation context, forwards to the orchestrator, and returns the
agent response with metadata.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user
from ..config import Settings, get_settings
from ..models.auth import CurrentUser
from ..models.chat import ChatRequest, ChatResponse, OrchestratorRequest
from ..services.orchestrator import OrchestratorError, get_orchestrator_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Send a chat message",
    description=(
        "Send a message to an ITOM agent via the orchestrator. "
        "The orchestrator routes the message to the appropriate agent based on "
        "the optional agent_target parameter, or auto-routes if not specified."
    ),
    responses={
        200: {"description": "Agent response with metadata"},
        401: {"description": "Authentication required"},
        422: {"description": "Invalid request payload"},
        502: {"description": "Orchestrator unavailable or returned an error"},
        504: {"description": "Orchestrator request timed out"},
    },
)
async def send_chat_message(
    request: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    """Process a chat message by proxying it to the itom-orchestrator.

    Steps:
        1. Validate the incoming message payload.
        2. Assemble conversation context (previous messages for continuity).
        3. Forward the message to the orchestrator.
        4. Return the agent response with timing and routing metadata.

    If the orchestrator is unreachable, returns a system-level error response
    with ``agent_id: "system"`` so the client can display a meaningful message.
    """
    logger.info(
        "Chat request from user '%s': conversation_id=%s, agent_target=%s, content_length=%d",
        current_user.user_name,
        request.conversation_id,
        request.agent_target,
        len(request.content),
    )

    # Build the orchestrator request with user context
    orch_request = OrchestratorRequest(
        message=request.content,
        conversation_id=request.conversation_id,
        agent_target=request.agent_target,
        context=[],  # Context assembly will be enhanced when persistence is added (CHAT-015)
        user={
            "sys_id": current_user.sys_id,
            "user_name": current_user.user_name,
            "name": current_user.name,
        },
    )

    # Resolve or generate conversation ID
    conversation_id = request.conversation_id or str(uuid.uuid4())

    # Attempt to proxy to the orchestrator
    service = get_orchestrator_service(settings)
    start_time = time.monotonic()

    try:
        orch_response, response_time_ms = await service.send_message(orch_request)
    except OrchestratorError as exc:
        # The orchestrator is unavailable or returned an error.
        # Return an honest system-level response rather than failing silently.
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        logger.warning(
            "Orchestrator unavailable for user '%s': %s",
            current_user.user_name,
            exc,
        )

        # Determine the appropriate HTTP status based on the error type
        if exc.status_code is not None:
            # Orchestrator returned an HTTP error -- relay as 502 Bad Gateway
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "message_id": str(uuid.uuid4()),
                    "conversation_id": conversation_id,
                    "content": (
                        "The orchestrator service is currently unavailable. "
                        "Your message could not be delivered to an ITOM agent. "
                        "Please try again later or contact your administrator."
                    ),
                    "agent_id": "system",
                    "agent_name": "System",
                    "response_time_ms": elapsed_ms,
                    "error": str(exc),
                },
            ) from exc

        # Connection or timeout error
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message_id": str(uuid.uuid4()),
                "conversation_id": conversation_id,
                "content": (
                    "Unable to connect to the ITOM orchestrator. "
                    "The service may be offline or unreachable. "
                    "Please try again later."
                ),
                "agent_id": "system",
                "agent_name": "System",
                "response_time_ms": elapsed_ms,
                "error": str(exc),
            },
        ) from exc

    # Use the conversation_id from the orchestrator if it assigned one,
    # otherwise use our local one.
    final_conversation_id = orch_response.conversation_id or conversation_id

    response = ChatResponse(
        message_id=str(uuid.uuid4()),
        conversation_id=final_conversation_id,
        content=orch_response.content,
        agent_id=orch_response.agent_id,
        agent_name=orch_response.agent_name,
        response_time_ms=response_time_ms,
        timestamp=datetime.now(UTC),
        metadata=orch_response.metadata,
    )

    logger.info(
        "Chat response: message_id=%s, agent=%s, time=%dms",
        response.message_id,
        response.agent_id,
        response.response_time_ms,
    )

    return response
