"""Shared pytest configuration for the itom-chat-ui backend tests.

Sets CHAT_AUTH_MODE=dev and CHAT_DATABASE_URL=:memory: before any app code
is imported so that all tests bypass SSO authentication and use an in-memory
SQLite database.
"""

from __future__ import annotations

import os

# Set auth to dev mode BEFORE importing the app so the Settings singleton
# picks up dev mode on its first creation.
os.environ.setdefault("CHAT_AUTH_MODE", "dev")
os.environ.setdefault("CHAT_DATABASE_URL", "sqlite:///:memory:")

from collections.abc import AsyncIterator  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.config import reset_settings  # noqa: E402
from app.database import reset_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_singletons() -> None:
    """Reset settings and DB singletons before each test for isolation."""
    reset_settings()
    reset_db()


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """Provide an async HTTP test client for the FastAPI application."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
