"""Integration tests for the Claude AI conversational layer.

These tests require a valid CHAT_ANTHROPIC_API_KEY environment variable.
They make real API calls to the Anthropic Claude API.

Run with: pytest backend/tests/integration/test_claude_integration.py -v
Skip guard: tests are skipped if CHAT_ANTHROPIC_API_KEY is not set.
"""

from __future__ import annotations

import json
import os

os.environ.setdefault("CHAT_AUTH_MODE", "dev")
os.environ.setdefault("CHAT_DATABASE_URL", "sqlite:///:memory:")

import pytest

# Skip all tests in this module if no API key is set
pytestmark = pytest.mark.integration

SKIP_REASON = "CHAT_ANTHROPIC_API_KEY not set — skipping Claude integration tests"
api_key = os.environ.get("CHAT_ANTHROPIC_API_KEY", "")
if not api_key:
    pytestmark = [pytestmark, pytest.mark.skip(reason=SKIP_REASON)]


@pytest.mark.asyncio
async def test_claude_api_tool_use():
    """Real Claude API call that should trigger a tool_use response.

    Sends a query that clearly maps to a CMDB lookup, verifying that
    Claude returns a tool_use content block for query_cmdb.
    """
    import anthropic

    from app.services.claude_service import SYSTEM_PROMPT, TOOLS

    client = anthropic.AsyncAnthropic(api_key=api_key)

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        temperature=0.0,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": "Show me all production servers in the CMDB"}],
        tools=TOOLS,
    )

    # Claude should respond with at least one tool_use block
    tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
    assert len(tool_use_blocks) >= 1, (
        f"Expected tool_use block, got: {[b.type for b in response.content]}"
    )

    # The tool should be query_cmdb
    assert tool_use_blocks[0].name == "query_cmdb"
    assert "query" in tool_use_blocks[0].input


@pytest.mark.asyncio
async def test_claude_streaming_format():
    """Verify that stream_claude_response produces valid SSE events.

    Uses a real Claude API call but mocks the orchestrator to avoid
    needing the full ITOM stack running.
    """
    from unittest.mock import AsyncMock, patch

    from app.services.claude_service import stream_claude_response

    # Mock settings with a real API key
    with patch("app.services.claude_service.get_settings") as mock_settings:
        mock_settings.return_value.anthropic_api_key = api_key
        mock_settings.return_value.claude_model = "claude-haiku-4-5-20251001"
        mock_settings.return_value.claude_max_tokens = 1024
        mock_settings.return_value.claude_temperature = 0.0
        mock_settings.return_value.orchestrator_url = "http://localhost:8000"

        # Mock the orchestrator call so we don't need it running
        mock_orch_response = {
            "status": "success",
            "response": {
                "result": {
                    "agent_response": "Found 3 production servers: web-01, web-02, db-01."
                }
            },
        }
        mock_http_response = AsyncMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = mock_orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(
            return_value=mock_http_response
        )

        with patch(
            "app.services.claude_service.httpx.AsyncClient",
            return_value=mock_client,
        ):
            events = []
            async for event_str in stream_claude_response(
                "Show me production servers", "integration-conv-1"
            ):
                events.append(event_str)

    # Parse SSE events
    parsed = []
    for event_str in events:
        for line in event_str.strip().split("\n"):
            if line.startswith("data: "):
                parsed.append(json.loads(line[6:]))

    event_types = [e.get("event") for e in parsed]

    # Must have stream_start and stream_end
    assert "stream_start" in event_types, f"Missing stream_start in {event_types}"
    assert "stream_end" in event_types, f"Missing stream_end in {event_types}"

    # stream_start should have agent_id = "claude"
    start_events = [e for e in parsed if e.get("event") == "stream_start"]
    assert start_events[0]["data"]["agent_id"] == "claude"

    # Should have at least one token event (Claude streamed text)
    assert "token" in event_types, f"Missing token events in {event_types}"
