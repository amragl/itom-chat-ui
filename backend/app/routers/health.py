from datetime import UTC, datetime

from fastapi import APIRouter

from ..models.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Check the health status of the backend service.

    Returns the current status, version, and server timestamp.
    """
    return HealthResponse(
        status="healthy",
        version="0.1.0",
        timestamp=datetime.now(UTC),
    )
