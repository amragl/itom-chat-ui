from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response model for the health check endpoint."""

    status: str
    version: str
    timestamp: datetime
