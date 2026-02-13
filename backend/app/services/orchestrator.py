"""Service for proxying chat requests to the itom-orchestrator MCP server.

Handles connection management, request formatting, response parsing, and
graceful error handling when the orchestrator is unavailable.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from ..config import Settings
from ..models.chat import OrchestratorRequest, OrchestratorResponse

logger = logging.getLogger(__name__)

# Timeout configuration for orchestrator requests (seconds).
# Connect timeout is short to fail fast if orchestrator is down.
# Read timeout is longer to allow for agent processing time.
CONNECT_TIMEOUT = 5.0
READ_TIMEOUT = 120.0


class OrchestratorError(Exception):
    """Raised when the orchestrator returns an error or is unreachable."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class OrchestratorService:
    """Proxy service for communicating with the itom-orchestrator.

    Manages an async HTTP client to send chat messages to the orchestrator
    and parse the responses. Handles connection failures gracefully with
    clear error reporting.

    Args:
        settings: Application settings containing the orchestrator URL.
    """

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.orchestrator_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Return the shared async HTTP client, creating it if needed."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=httpx.Timeout(
                    connect=CONNECT_TIMEOUT,
                    read=READ_TIMEOUT,
                    write=10.0,
                    pool=10.0,
                ),
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
        return self._client

    async def close(self) -> None:
        """Close the underlying HTTP client. Safe to call multiple times."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def send_message(
        self,
        request: OrchestratorRequest,
    ) -> tuple[OrchestratorResponse, int]:
        """Send a chat message to the orchestrator and return the response.

        Args:
            request: The formatted orchestrator request with message, context,
                and routing information.

        Returns:
            A tuple of (OrchestratorResponse, response_time_ms).

        Raises:
            OrchestratorError: If the orchestrator is unreachable or returns
                an error response.
        """
        client = await self._get_client()
        payload = request.model_dump(mode="json")

        start_time = time.monotonic()

        try:
            response = await client.post("/api/chat", json=payload)
        except httpx.ConnectError as exc:
            logger.error(
                "Cannot connect to orchestrator at %s: %s",
                self._base_url,
                exc,
            )
            raise OrchestratorError(
                f"Cannot connect to orchestrator at {self._base_url}. "
                "The orchestrator service may be offline or unreachable.",
            ) from exc
        except httpx.TimeoutException as exc:
            logger.error("Orchestrator request timed out: %s", exc)
            raise OrchestratorError(
                "Orchestrator request timed out. The service may be overloaded "
                "or processing a long-running operation.",
            ) from exc
        except httpx.RequestError as exc:
            logger.error("Orchestrator request failed: %s", exc)
            raise OrchestratorError(
                f"Failed to communicate with orchestrator: {exc}",
            ) from exc

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        if response.status_code != 200:
            body = response.text
            logger.error(
                "Orchestrator returned status %d: %s",
                response.status_code,
                body[:500],
            )
            raise OrchestratorError(
                f"Orchestrator returned HTTP {response.status_code}: {body[:200]}",
                status_code=response.status_code,
            )

        try:
            data = response.json()
        except Exception as exc:
            logger.error("Failed to parse orchestrator response as JSON: %s", exc)
            raise OrchestratorError(
                "Orchestrator returned an invalid JSON response.",
            ) from exc

        try:
            orch_response = OrchestratorResponse.model_validate(data)
        except Exception as exc:
            logger.error("Orchestrator response does not match expected schema: %s", exc)
            raise OrchestratorError(
                "Orchestrator response does not match the expected schema.",
            ) from exc

        logger.info(
            "Orchestrator responded in %dms via agent '%s'",
            elapsed_ms,
            orch_response.agent_id,
        )
        return orch_response, elapsed_ms

    async def check_health(self) -> dict[str, Any]:
        """Check whether the orchestrator is reachable and healthy.

        Returns a dict with keys: ``available`` (bool), ``status`` (str),
        ``response_time_ms`` (int or None), and ``error`` (str or None).
        """
        client = await self._get_client()
        start_time = time.monotonic()

        try:
            response = await client.get("/api/health")
            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            if response.status_code == 200:
                return {
                    "available": True,
                    "status": "healthy",
                    "response_time_ms": elapsed_ms,
                    "error": None,
                }

            return {
                "available": False,
                "status": f"unhealthy (HTTP {response.status_code})",
                "response_time_ms": elapsed_ms,
                "error": f"Health check returned status {response.status_code}",
            }
        except httpx.ConnectError:
            return {
                "available": False,
                "status": "offline",
                "response_time_ms": None,
                "error": f"Cannot connect to orchestrator at {self._base_url}",
            }
        except httpx.TimeoutException:
            return {
                "available": False,
                "status": "timeout",
                "response_time_ms": None,
                "error": "Orchestrator health check timed out",
            }
        except httpx.RequestError as exc:
            return {
                "available": False,
                "status": "error",
                "response_time_ms": None,
                "error": str(exc),
            }


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_service: OrchestratorService | None = None


def get_orchestrator_service(settings: Settings) -> OrchestratorService:
    """Return a singleton OrchestratorService instance.

    Creates the service on first call using the provided settings.
    Subsequent calls return the same instance.
    """
    global _service
    if _service is None:
        _service = OrchestratorService(settings)
    return _service


def reset_orchestrator_service() -> None:
    """Reset the singleton, forcing re-creation on next access.

    Useful for testing or when settings change.
    """
    global _service
    _service = None
