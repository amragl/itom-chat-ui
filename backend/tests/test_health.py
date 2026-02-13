from httpx import AsyncClient


async def test_health_returns_200(client: AsyncClient) -> None:
    """GET /api/health should return HTTP 200."""
    response = await client.get("/api/health")
    assert response.status_code == 200


async def test_health_has_required_fields(client: AsyncClient) -> None:
    """GET /api/health response should contain status, version, and timestamp fields."""
    response = await client.get("/api/health")
    data = response.json()
    assert "status" in data
    assert "version" in data
    assert "timestamp" in data


async def test_health_status_is_healthy(client: AsyncClient) -> None:
    """GET /api/health should report status as 'healthy'."""
    response = await client.get("/api/health")
    data = response.json()
    assert data["status"] == "healthy"


async def test_health_version_is_correct(client: AsyncClient) -> None:
    """GET /api/health should report the current application version."""
    response = await client.get("/api/health")
    data = response.json()
    assert data["version"] == "0.1.0"


async def test_health_timestamp_is_valid_iso(client: AsyncClient) -> None:
    """GET /api/health timestamp should be a valid ISO 8601 datetime string."""
    from datetime import datetime

    response = await client.get("/api/health")
    data = response.json()
    # Should not raise if the timestamp is valid ISO 8601
    parsed = datetime.fromisoformat(data["timestamp"])
    assert parsed is not None
