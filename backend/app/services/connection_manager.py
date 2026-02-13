"""WebSocket connection manager for tracking and broadcasting to active clients.

Provides a thread-safe manager that tracks WebSocket connections by client ID,
supports personal messages, broadcasts, and heartbeat pings.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and provides messaging primitives.

    Each connection is identified by a unique ``client_id`` string.  The manager
    supports sending messages to individual clients, broadcasting to all clients,
    and periodic heartbeat pings.

    Attributes:
        _connections: Mapping of client_id to active WebSocket instances.
        _lock: Asyncio lock for safe concurrent access to the connections dict.
    """

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        """Accept a WebSocket connection and register it under *client_id*.

        If a connection with the same *client_id* already exists it is closed
        first (last-writer-wins semantics).
        """
        await websocket.accept()
        async with self._lock:
            existing = self._connections.get(client_id)
            if existing is not None:
                logger.warning(
                    "Replacing existing connection for client_id=%s",
                    client_id,
                )
                try:
                    await existing.close(code=1000, reason="Replaced by new connection")
                except Exception:  # noqa: BLE001
                    pass  # Old socket may already be dead
            self._connections[client_id] = websocket
        logger.info(
            "Client connected: client_id=%s (total=%d)",
            client_id,
            len(self._connections),
        )

    async def disconnect(self, client_id: str) -> None:
        """Remove a connection by *client_id*.

        Silently does nothing if the client_id is not tracked.
        """
        async with self._lock:
            ws = self._connections.pop(client_id, None)
        if ws is not None:
            logger.info(
                "Client disconnected: client_id=%s (total=%d)",
                client_id,
                len(self._connections),
            )
        else:
            logger.debug(
                "disconnect called for unknown client_id=%s",
                client_id,
            )

    async def send_personal(self, message: dict[str, Any], client_id: str) -> bool:
        """Send a JSON-serializable *message* to a single client.

        Returns ``True`` if the message was sent successfully, ``False`` if the
        client is not connected or the send failed.
        """
        async with self._lock:
            ws = self._connections.get(client_id)
        if ws is None:
            logger.debug("send_personal: client_id=%s not connected", client_id)
            return False
        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to send to client_id=%s, removing connection",
                client_id,
            )
            await self.disconnect(client_id)
            return False

    async def broadcast(self, message: dict[str, Any]) -> int:
        """Send a JSON-serializable *message* to every connected client.

        Returns the number of clients that successfully received the message.
        Clients that fail to receive are automatically disconnected.
        """
        async with self._lock:
            snapshot = dict(self._connections)

        payload = json.dumps(message)
        failed_ids: list[str] = []
        sent = 0

        for cid, ws in snapshot.items():
            try:
                await ws.send_text(payload)
                sent += 1
            except Exception:  # noqa: BLE001
                logger.warning("Broadcast failed for client_id=%s", cid)
                failed_ids.append(cid)

        # Clean up broken connections
        for cid in failed_ids:
            await self.disconnect(cid)

        logger.debug("Broadcast delivered to %d/%d clients", sent, len(snapshot))
        return sent

    async def send_heartbeat(self) -> int:
        """Send a heartbeat message to all connected clients.

        Returns the number of clients that received the heartbeat.
        """
        heartbeat: dict[str, Any] = {
            "type": "heartbeat",
            "payload": {
                "timestamp": datetime.now(UTC).isoformat(),
            },
        }
        return await self.broadcast(heartbeat)

    async def get_active_connections(self) -> list[str]:
        """Return a list of currently connected client IDs."""
        async with self._lock:
            return list(self._connections.keys())

    @property
    def connection_count(self) -> int:
        """Return the number of active connections."""
        return len(self._connections)
