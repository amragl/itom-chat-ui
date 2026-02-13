"""WebSocket endpoint for real-time client communication.

Handles the full connection lifecycle: accept, receive messages, echo/broadcast
responses, and clean up on disconnect.  All incoming messages are expected to be
JSON matching the :class:`WebSocketMessage` envelope schema.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..models.websocket import WebSocketMessage, WebSocketMessageType
from ..services.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)

router = APIRouter()

# Singleton connection manager shared across the application.
# Imported by main.py to make it available to other parts of the app if needed.
manager = ConnectionManager()


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str) -> None:
    """Handle an individual WebSocket connection for *client_id*.

    Protocol:
        1. Accept the connection and register in the manager.
        2. Send a welcome heartbeat so the client knows the link is live.
        3. Enter a receive loop: parse incoming JSON, validate against the
           message schema, echo back a server acknowledgement or relay to others.
        4. On disconnect (normal or abnormal), remove from the manager.
    """
    await manager.connect(websocket, client_id)

    # Send initial heartbeat to confirm the connection is live
    welcome: dict[str, object] = {
        "type": "heartbeat",
        "payload": {
            "timestamp": datetime.now(UTC).isoformat(),
        },
    }
    try:
        await websocket.send_text(json.dumps(welcome))
    except Exception:  # noqa: BLE001
        await manager.disconnect(client_id)
        return

    try:
        while True:
            raw = await websocket.receive_text()
            await _handle_message(raw, client_id)
    except WebSocketDisconnect:
        logger.info("Client %s disconnected normally", client_id)
    except Exception:
        logger.exception("Unexpected error for client %s", client_id)
    finally:
        await manager.disconnect(client_id)


async def _handle_message(raw: str, client_id: str) -> None:
    """Parse and route a single incoming WebSocket message."""
    # -- Parse JSON ---------------------------------------------------------
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON from client %s: %s", client_id, raw[:200])
        error_msg: dict[str, object] = {
            "type": "error",
            "payload": {
                "code": "INVALID_JSON",
                "message": "Message must be valid JSON.",
            },
        }
        await manager.send_personal(error_msg, client_id)
        return

    # -- Validate against schema --------------------------------------------
    try:
        message = WebSocketMessage.model_validate(data)
    except Exception:  # noqa: BLE001
        logger.warning("Invalid message schema from client %s", client_id)
        error_msg = {
            "type": "error",
            "payload": {
                "code": "INVALID_SCHEMA",
                "message": "Message does not match the expected WebSocketMessage schema.",
            },
        }
        await manager.send_personal(error_msg, client_id)
        return

    # -- Route by type ------------------------------------------------------
    if message.type == WebSocketMessageType.HEARTBEAT:
        await _handle_heartbeat(client_id)
    elif message.type == WebSocketMessageType.CHAT:
        await _handle_chat(message, client_id)
    elif message.type == WebSocketMessageType.STATUS:
        await _handle_status(message, client_id)
    else:
        logger.debug("Unhandled message type %s from %s", message.type, client_id)


async def _handle_heartbeat(client_id: str) -> None:
    """Respond to a heartbeat with a heartbeat (ping-pong)."""
    pong: dict[str, object] = {
        "type": "heartbeat",
        "payload": {
            "timestamp": datetime.now(UTC).isoformat(),
        },
    }
    await manager.send_personal(pong, client_id)


async def _handle_chat(message: WebSocketMessage, client_id: str) -> None:
    """Process an incoming chat message.

    For now, broadcasts the chat message to all connected clients so that
    multiple browser tabs stay in sync.  In Phase 2, this will be extended
    to route through the orchestrator for agent responses.
    """
    outgoing: dict[str, object] = {
        "type": "chat",
        "payload": message.payload,
        "correlationId": message.correlation_id,
    }
    await manager.broadcast(outgoing)
    logger.debug("Chat message from %s broadcast to all clients", client_id)


async def _handle_status(message: WebSocketMessage, client_id: str) -> None:
    """Broadcast a status update to all connected clients."""
    outgoing: dict[str, object] = {
        "type": "status",
        "payload": message.payload,
    }
    await manager.broadcast(outgoing)
    logger.debug("Status update from %s broadcast to all clients", client_id)
