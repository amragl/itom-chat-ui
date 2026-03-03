"""Tests for the Claude AI conversational layer (claude_service.py).

Validates:
- ConversationHistory: add/get/trim/cap/LRU behavior (pure unit, no external deps)
- _sse_event: SSE formatting (pure unit)
- TOOL_TO_AGENT: all 6 tools map to valid agent IDs
- Fallback to legacy streaming when API key is empty
- _call_orchestrator_tool: orchestrator integration with httpx mock
"""

from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("CHAT_AUTH_MODE", "dev")
os.environ.setdefault("CHAT_DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("CHAT_ANTHROPIC_API_KEY", "")

import pytest


# ---------------------------------------------------------------------------
# ConversationHistory tests (pure unit — no external deps)
# ---------------------------------------------------------------------------


class TestConversationHistory:
    """Tests for the in-memory ConversationHistory class."""

    def _make_history(self):
        from app.services.claude_service import ConversationHistory

        return ConversationHistory()

    def test_add_and_get(self):
        """Messages can be added and retrieved by conversation_id."""
        h = self._make_history()
        h.add("conv-1", {"role": "user", "content": "hello"})
        h.add("conv-1", {"role": "assistant", "content": "hi"})

        msgs = h.get("conv-1")
        assert len(msgs) == 2
        assert msgs[0]["content"] == "hello"
        assert msgs[1]["content"] == "hi"

    def test_get_empty(self):
        """Getting messages for an unknown conversation returns empty list."""
        h = self._make_history()
        assert h.get("nonexistent") == []

    def test_trim_to_max_messages(self):
        """Messages are trimmed to MAX_MESSAGES_PER_CONVERSATION."""
        from app.services import claude_service

        h = self._make_history()
        max_msgs = claude_service.MAX_MESSAGES_PER_CONVERSATION

        for i in range(max_msgs + 10):
            h.add("conv-1", {"role": "user", "content": f"msg-{i}"})

        msgs = h.get("conv-1")
        assert len(msgs) == max_msgs
        # Should keep the most recent messages
        assert msgs[-1]["content"] == f"msg-{max_msgs + 9}"
        assert msgs[0]["content"] == f"msg-{10}"

    def test_cap_conversations(self):
        """Oldest conversations are evicted when MAX_CONVERSATIONS is reached."""
        from app.services import claude_service

        h = self._make_history()
        max_convs = claude_service.MAX_CONVERSATIONS

        for i in range(max_convs + 5):
            h.add(f"conv-{i}", {"role": "user", "content": f"msg-{i}"})

        assert h.conversation_count == max_convs
        # Oldest conversations should be evicted
        assert h.get("conv-0") == []
        assert h.get("conv-4") == []
        # Newest should exist
        assert len(h.get(f"conv-{max_convs + 4}")) == 1

    def test_lru_eviction(self):
        """Accessing a conversation moves it to the end, protecting it from eviction."""
        from app.services import claude_service

        h = self._make_history()
        max_convs = claude_service.MAX_CONVERSATIONS

        # Fill to capacity
        for i in range(max_convs):
            h.add(f"conv-{i}", {"role": "user", "content": f"msg-{i}"})

        # Access conv-0 to move it to the end (most recently used)
        h.get("conv-0")

        # Add more conversations to trigger eviction
        for i in range(5):
            h.add(f"new-conv-{i}", {"role": "user", "content": f"new-{i}"})

        # conv-0 should still exist (was moved to end)
        assert len(h.get("conv-0")) == 1
        # conv-1 through conv-5 should be evicted
        assert h.get("conv-1") == []

    def test_get_returns_copy(self):
        """get() returns a copy, not a reference to internal storage."""
        h = self._make_history()
        h.add("conv-1", {"role": "user", "content": "hello"})

        msgs = h.get("conv-1")
        msgs.append({"role": "user", "content": "injected"})

        # Internal storage should be unaffected
        assert len(h.get("conv-1")) == 1

    def test_conversation_count(self):
        """conversation_count reflects the number of active conversations."""
        h = self._make_history()
        assert h.conversation_count == 0

        h.add("conv-1", {"role": "user", "content": "a"})
        assert h.conversation_count == 1

        h.add("conv-2", {"role": "user", "content": "b"})
        assert h.conversation_count == 2

        h.add("conv-1", {"role": "user", "content": "c"})
        assert h.conversation_count == 2  # Same conversation, no increase


# ---------------------------------------------------------------------------
# _sse_event tests (pure unit)
# ---------------------------------------------------------------------------


class TestSSEEvent:
    """Tests for the SSE event formatter."""

    def test_format(self):
        """_sse_event produces valid SSE data lines."""
        from app.services.claude_service import _sse_event

        result = _sse_event("token", {"token": "hello", "message_id": "m1"})

        assert result.startswith("data: ")
        assert result.endswith("\n\n")

        parsed = json.loads(result[6:].strip())
        assert parsed["event"] == "token"
        assert parsed["data"]["token"] == "hello"
        assert parsed["data"]["message_id"] == "m1"

    def test_stream_start_event(self):
        """stream_start event has expected structure."""
        from app.services.claude_service import _sse_event

        result = _sse_event("stream_start", {
            "message_id": "m1",
            "agent_id": "claude",
            "conversation_id": "c1",
            "timestamp": "2026-01-01T00:00:00",
        })

        parsed = json.loads(result[6:].strip())
        assert parsed["event"] == "stream_start"
        assert parsed["data"]["agent_id"] == "claude"

    def test_error_event(self):
        """error event has code and message."""
        from app.services.claude_service import _sse_event

        result = _sse_event("error", {
            "code": "CLAUDE_AUTH_ERROR",
            "message": "Auth failed",
        })

        parsed = json.loads(result[6:].strip())
        assert parsed["event"] == "error"
        assert parsed["data"]["code"] == "CLAUDE_AUTH_ERROR"


# ---------------------------------------------------------------------------
# TOOL_TO_AGENT mapping tests
# ---------------------------------------------------------------------------


class TestToolToAgent:
    """Tests that all tool definitions map to valid agent IDs."""

    def test_all_tools_have_agent_mapping(self):
        """Every tool in TOOLS has a corresponding entry in TOOL_TO_AGENT."""
        from app.services.claude_service import TOOL_TO_AGENT, TOOLS

        tool_names = {t["name"] for t in TOOLS}
        mapped_names = set(TOOL_TO_AGENT.keys())

        assert tool_names == mapped_names, (
            f"Mismatch between TOOLS and TOOL_TO_AGENT: "
            f"missing={tool_names - mapped_names}, extra={mapped_names - tool_names}"
        )

    def test_seven_tools_defined(self):
        """Exactly 7 ITOM agent tools are defined."""
        from app.services.claude_service import TOOLS

        assert len(TOOLS) == 7

    def test_agent_ids(self):
        """TOOL_TO_AGENT maps to known orchestrator agent IDs."""
        from app.services.claude_service import TOOL_TO_AGENT

        expected_agents = {
            "task-manager-agent", "cmdb-agent", "csa-agent", "discovery",
            "asset", "auditor", "documentator",
        }
        assert set(TOOL_TO_AGENT.values()) == expected_agents

    def test_tool_schemas_valid(self):
        """Each tool has name, description, and input_schema with required 'query' field."""
        from app.services.claude_service import TOOLS

        for tool in TOOLS:
            assert "name" in tool
            assert "description" in tool
            assert "input_schema" in tool
            schema = tool["input_schema"]
            assert schema["type"] == "object"
            assert "query" in schema["properties"]
            assert "query" in schema["required"]

    def test_create_service_request_structured_schema(self):
        """create_service_request schema accepts structured remediation parameters."""
        from app.services.claude_service import TOOLS

        csr_tool = next(t for t in TOOLS if t["name"] == "create_service_request")
        props = csr_tool["input_schema"]["properties"]

        # Must have the new structured fields
        assert "remediation_type" in props
        assert "remediation_mode" in props
        assert "affected_cis" in props
        assert "risk_level" in props

        # Enums are correct
        assert props["remediation_type"]["enum"] == ["missing_data", "duplicate_merge", "stale_retirement"]
        assert props["remediation_mode"]["enum"] == ["manual", "agent"]
        assert props["risk_level"]["enum"] == ["low", "medium", "high", "critical"]

        # affected_cis is an array of objects with expected properties
        items = props["affected_cis"]["items"]
        assert items["type"] == "object"
        assert "sys_id" in items["properties"]
        assert "name" in items["properties"]
        assert "ci_class" in items["properties"]
        assert "issue" in items["properties"]
        assert "proposed_fix" in items["properties"]

        # Only query is required — all others are optional
        assert csr_tool["input_schema"]["required"] == ["query"]


# ---------------------------------------------------------------------------
# Fallback to legacy streaming tests
# ---------------------------------------------------------------------------


class TestFallbackToLegacy:
    """Tests that Claude service falls back to legacy streaming when no API key."""

    @pytest.mark.asyncio
    async def test_no_api_key_uses_legacy(self):
        """When CHAT_ANTHROPIC_API_KEY is empty, delegates to stream_chat_response."""
        from app.services.claude_service import stream_claude_response

        mock_events = [
            'data: {"event": "stream_start", "data": {"message_id": "m1"}}\n\n',
            'data: {"event": "token", "data": {"token": "hello"}}\n\n',
            'data: {"event": "stream_end", "data": {"full_content": "hello"}}\n\n',
        ]

        async def mock_legacy_stream(*args, **kwargs):
            for event in mock_events:
                yield event

        with patch("app.services.claude_service.get_settings") as mock_settings:
            mock_settings.return_value.anthropic_api_key = ""
            with patch(
                "app.services.streaming.stream_chat_response",
                side_effect=mock_legacy_stream,
            ):
                events = []
                async for event in stream_claude_response("hello", "conv-1"):
                    events.append(event)

        assert len(events) == 3
        assert "stream_start" in events[0]

    @pytest.mark.asyncio
    async def test_explicit_agent_target_uses_legacy(self):
        """When agent_target is set, delegates to legacy streaming (skips Claude)."""
        from app.services.claude_service import stream_claude_response

        async def mock_legacy_stream(*args, **kwargs):
            yield 'data: {"event": "stream_start", "data": {}}\n\n'

        with patch("app.services.claude_service.get_settings") as mock_settings:
            mock_settings.return_value.anthropic_api_key = "sk-test-key"
            with patch(
                "app.services.streaming.stream_chat_response",
                side_effect=mock_legacy_stream,
            ):
                events = []
                async for event in stream_claude_response(
                    "hello", "conv-1", agent_target="cmdb-agent"
                ):
                    events.append(event)

        assert len(events) == 1


# ---------------------------------------------------------------------------
# _call_orchestrator_tool tests
# ---------------------------------------------------------------------------


class TestCallOrchestratorTool:
    """Tests for _call_orchestrator_tool with httpx transport mock."""

    @pytest.mark.asyncio
    async def test_successful_tool_call(self):
        """Successful orchestrator call returns agent_response text."""
        from app.services.claude_service import _call_orchestrator_tool

        orch_response = {
            "status": "success",
            "agent_id": "cmdb-agent",
            "response": {
                "result": {
                    "agent_response": "Found 5 production servers.",
                }
            },
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            result = await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input={"query": "show production servers"},
                conversation_id="conv-1",
            )

        text, actions, auth_artifacts = result
        assert text == "Found 5 production servers."
        assert actions == []
        assert auth_artifacts == []

    @pytest.mark.asyncio
    async def test_unknown_tool(self):
        """Unknown tool name returns error string."""
        from app.services.claude_service import _call_orchestrator_tool

        result = await _call_orchestrator_tool(
            tool_name="nonexistent_tool",
            tool_input={"query": "test"},
            conversation_id="conv-1",
        )

        text, actions, _auth = result
        assert "Unknown tool" in text
        assert actions == []

    @pytest.mark.asyncio
    async def test_orchestrator_error_status(self):
        """Non-200 orchestrator response returns error string."""
        from app.services.claude_service import _call_orchestrator_tool

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            result = await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input={"query": "test"},
                conversation_id="conv-1",
            )

        text, actions, _auth = result
        assert "Error" in text
        assert "500" in text
        assert actions == []

    @pytest.mark.asyncio
    async def test_orchestrator_connect_error(self):
        """ConnectError returns descriptive error string."""
        import httpx as _httpx
        from app.services.claude_service import _call_orchestrator_tool

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(
            side_effect=_httpx.ConnectError("Connection refused")
        )

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            result = await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input={"query": "test"},
                conversation_id="conv-1",
            )

        text, actions, _auth = result
        assert "Cannot connect" in text
        assert actions == []

    @pytest.mark.asyncio
    async def test_orchestrator_timeout(self):
        """ReadTimeout returns descriptive error string."""
        import httpx as _httpx
        from app.services.claude_service import _call_orchestrator_tool

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(
            side_effect=_httpx.ReadTimeout("Read timed out")
        )

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            result = await _call_orchestrator_tool(
                tool_name="run_discovery",
                tool_input={"query": "scan 10.0.0.0/8"},
                conversation_id="conv-1",
            )

        text, actions, _auth = result
        assert "too long" in text
        assert actions == []

    @pytest.mark.asyncio
    async def test_passes_context_from_tool_input(self):
        """When tool_input has fields beyond query, they are passed as context."""
        from app.services.claude_service import _call_orchestrator_tool

        orch_response = {
            "status": "success",
            "response": {"result": {"agent_response": "Request created."}},
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        tool_input = {
            "query": "Create remediation for stale servers",
            "remediation_type": "stale_retirement",
            "remediation_mode": "agent",
            "affected_cis": [
                {"sys_id": "abc123", "name": "srv-01", "ci_class": "cmdb_ci_server"},
            ],
        }

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            await _call_orchestrator_tool(
                tool_name="create_service_request",
                tool_input=tool_input,
                conversation_id="conv-ctx",
            )

        # Verify the POST payload includes context
        post_mock = mock_client.__aenter__.return_value.post
        call_kwargs = post_mock.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert payload["session_id"] == "conv-ctx"
        assert "context" in payload
        assert payload["context"]["remediation_type"] == "stale_retirement"
        assert payload["context"]["remediation_mode"] == "agent"
        assert len(payload["context"]["affected_cis"]) == 1
        # query should NOT be in context
        assert "query" not in payload["context"]

    @pytest.mark.asyncio
    async def test_no_context_when_only_query(self):
        """When tool_input only has query, no context field is sent."""
        from app.services.claude_service import _call_orchestrator_tool

        orch_response = {
            "status": "success",
            "response": {"result": {"agent_response": "OK"}},
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input={"query": "show servers"},
                conversation_id="conv-no-ctx",
            )

        post_mock = mock_client.__aenter__.return_value.post
        call_kwargs = post_mock.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert "context" not in payload

    @pytest.mark.asyncio
    async def test_fallback_json_response(self):
        """When agent_response is missing, returns JSON representation."""
        from app.services.claude_service import _call_orchestrator_tool

        orch_response = {
            "status": "success",
            "response": {
                "result": {
                    "dispatched_to": "cmdb-agent",
                    "data": {"count": 3},
                }
            },
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            result = await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input={"query": "test"},
                conversation_id="conv-1",
            )

        # Should be JSON string since no agent_response key
        text, actions, _auth = result
        parsed = json.loads(text)
        assert "dispatched_to" in parsed
        assert actions == []

    @pytest.mark.asyncio
    async def test_authoritative_artifacts_extracted_from_dashboard_block(self):
        """Dashboard code blocks in orchestrator response produce authoritative artifacts."""
        from app.services.claude_service import _call_orchestrator_tool

        dashboard_json = json.dumps({
            "title": "CMDB Health",
            "metrics": {
                "Total CIs": {
                    "value": 464,
                    "link": "https://dev354780.service-now.com/nav_to.do?uri=cmdb_ci_server_list.do",
                    "drill_down": "Show all server CIs",
                },
                "Health Score": 37,
            },
        })
        agent_response = f"Here are the metrics:\n\n```dashboard\n{dashboard_json}\n```\n\nDone."

        orch_response = {
            "status": "success",
            "response": {"result": {"agent_response": agent_response}},
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            text, actions, auth_artifacts = await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input={"query": "show health metrics"},
                conversation_id="conv-auth",
            )

        assert len(auth_artifacts) == 1
        art = auth_artifacts[0]
        assert art["type"] == "dashboard"
        assert art["title"] == "CMDB Health"
        assert art["metadata"]["authoritative"] is True
        # Content should contain the real SN URL
        content = json.loads(art["content"])
        total_metric = content["metrics"]["Total CIs"]
        assert total_metric["link"] == "https://dev354780.service-now.com/nav_to.do?uri=cmdb_ci_server_list.do"

    @pytest.mark.asyncio
    async def test_no_authoritative_artifacts_for_plain_response(self):
        """Plain text responses produce no authoritative artifacts."""
        from app.services.claude_service import _call_orchestrator_tool

        orch_response = {
            "status": "success",
            "response": {"result": {"agent_response": "Found 5 servers."}},
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            _, _, auth_artifacts = await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input={"query": "show servers"},
                conversation_id="conv-plain",
            )

        assert auth_artifacts == []


# ---------------------------------------------------------------------------
# Tool hint / tool_args schema + pass-through tests
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# create_artifact tool definition tests
# ---------------------------------------------------------------------------


class TestCreateArtifactTool:
    """Tests for the create_artifact tool definition and ALL_TOOLS list."""

    def test_create_artifact_not_in_tool_to_agent(self):
        """create_artifact is local — must NOT be in TOOL_TO_AGENT."""
        from app.services.claude_service import TOOL_TO_AGENT

        assert "create_artifact" not in TOOL_TO_AGENT

    def test_create_artifact_in_all_tools_but_not_tools(self):
        """create_artifact is in ALL_TOOLS but not in TOOLS."""
        from app.services.claude_service import ALL_TOOLS, TOOLS

        tool_names = {t["name"] for t in TOOLS}
        all_tool_names = {t["name"] for t in ALL_TOOLS}

        assert "create_artifact" not in tool_names
        assert "create_artifact" in all_tool_names

    def test_all_tools_includes_orchestrator_tools(self):
        """ALL_TOOLS contains all 6 orchestrator tools plus local tools."""
        from app.services.claude_service import ALL_TOOLS, TOOLS

        assert len(ALL_TOOLS) == len(TOOLS) + 2

    def test_create_artifact_schema_required_fields(self):
        """create_artifact schema requires artifact_type, title, and content."""
        from app.services.claude_service import CREATE_ARTIFACT_TOOL

        schema = CREATE_ARTIFACT_TOOL["input_schema"]
        assert set(schema["required"]) == {"artifact_type", "title", "content"}

    def test_create_artifact_type_enum(self):
        """artifact_type enum matches the 4 frontend viewer types."""
        from app.services.claude_service import CREATE_ARTIFACT_TOOL

        props = CREATE_ARTIFACT_TOOL["input_schema"]["properties"]
        assert set(props["artifact_type"]["enum"]) == {
            "report", "dashboard", "table", "document",
        }


# ---------------------------------------------------------------------------
# _build_artifact_from_tool tests
# ---------------------------------------------------------------------------


class TestBuildArtifactFromTool:
    """Tests for the _build_artifact_from_tool helper function."""

    def test_report_artifact(self):
        """Report artifact has correct type, title, and JSON-stringified content."""
        from app.services.claude_service import _build_artifact_from_tool

        result = _build_artifact_from_tool({
            "artifact_type": "report",
            "title": "Compliance Report",
            "content": {
                "score": 85,
                "findings": [
                    {"severity": "high", "description": "Missing patches"},
                ],
            },
        })

        assert result is not None
        assert result["type"] == "report"
        assert result["title"] == "Compliance Report"
        assert result["metadata"]["source"] == "create_artifact_tool"
        # Content should be JSON-stringified
        import json
        parsed = json.loads(result["content"])
        assert parsed["score"] == 85
        assert len(parsed["findings"]) == 1

    def test_dashboard_artifact(self):
        """Dashboard artifact has correct structure."""
        from app.services.claude_service import _build_artifact_from_tool

        result = _build_artifact_from_tool({
            "artifact_type": "dashboard",
            "title": "CMDB Health",
            "content": {
                "status": "healthy",
                "metrics": {"total_cis": 1234, "health_score": 92},
            },
        })

        assert result is not None
        assert result["type"] == "dashboard"
        assert result["title"] == "CMDB Health"
        import json
        parsed = json.loads(result["content"])
        assert parsed["metrics"]["total_cis"] == 1234

    def test_table_artifact(self):
        """Table artifact has correct structure."""
        from app.services.claude_service import _build_artifact_from_tool

        result = _build_artifact_from_tool({
            "artifact_type": "table",
            "title": "Server List",
            "content": {
                "headers": ["Name", "Status"],
                "rows": [["srv-01", "Online"], ["srv-02", "Offline"]],
            },
        })

        assert result is not None
        assert result["type"] == "table"
        import json
        parsed = json.loads(result["content"])
        assert parsed["headers"] == ["Name", "Status"]
        assert len(parsed["rows"]) == 2

    def test_document_artifact_extracts_markdown(self):
        """Document artifact extracts markdown string from content object."""
        from app.services.claude_service import _build_artifact_from_tool

        result = _build_artifact_from_tool({
            "artifact_type": "document",
            "title": "Runbook",
            "content": {"markdown": "# Step 1\n\nDo the thing."},
        })

        assert result is not None
        assert result["type"] == "document"
        # markdown should be extracted as a plain string, not JSON-stringified
        assert result["content"] == "# Step 1\n\nDo the thing."

    def test_missing_fields_returns_none(self):
        """Returns None when required fields are missing."""
        from app.services.claude_service import _build_artifact_from_tool

        assert _build_artifact_from_tool({}) is None
        assert _build_artifact_from_tool({"artifact_type": "report"}) is None
        assert _build_artifact_from_tool({"artifact_type": "report", "title": "X"}) is None

    def test_each_artifact_gets_unique_id(self):
        """Each artifact gets a unique UUID."""
        from app.services.claude_service import _build_artifact_from_tool

        a1 = _build_artifact_from_tool({
            "artifact_type": "report",
            "title": "Report A",
            "content": {"score": 1},
        })
        a2 = _build_artifact_from_tool({
            "artifact_type": "report",
            "title": "Report B",
            "content": {"score": 2},
        })

        assert a1 is not None and a2 is not None
        assert a1["id"] != a2["id"]


# ---------------------------------------------------------------------------
# Tool hint / tool_args schema + pass-through tests
# ---------------------------------------------------------------------------


class TestToolHintSchema:
    """Tests that tool_hint and tool_args are defined in all tool schemas."""

    def test_all_tools_have_tool_hint(self):
        """Every tool schema includes optional tool_hint and tool_args properties."""
        from app.services.claude_service import TOOLS

        for tool in TOOLS:
            props = tool["input_schema"]["properties"]
            assert "tool_hint" in props, f"{tool['name']} missing tool_hint"
            assert props["tool_hint"]["type"] == "string"
            assert "tool_args" in props, f"{tool['name']} missing tool_args"
            assert props["tool_args"]["type"] == "object"

    def test_tool_hint_not_required(self):
        """tool_hint and tool_args must NOT be in required fields."""
        from app.services.claude_service import TOOLS

        for tool in TOOLS:
            required = tool["input_schema"].get("required", [])
            assert "tool_hint" not in required, f"{tool['name']} has tool_hint as required"
            assert "tool_args" not in required, f"{tool['name']} has tool_args as required"

    def test_system_prompt_contains_tool_catalog(self):
        """System prompt includes MCP tool catalog for Claude's reference."""
        from app.services.claude_service import SYSTEM_PROMPT

        assert "AVAILABLE MCP TOOLS" in SYSTEM_PROMPT
        assert "find_stale_configuration_items" in SYSTEM_PROMPT
        assert "create_remediation_request" in SYSTEM_PROMPT
        assert "TOOL_HINT RULES" in SYSTEM_PROMPT


class TestToolHintPassThrough:
    """Tests that tool_hint and tool_args flow through to orchestrator context."""

    @pytest.mark.asyncio
    async def test_tool_hint_passed_as_context(self):
        """tool_hint and tool_args from tool_input are passed in context to orchestrator."""
        from app.services.claude_service import _call_orchestrator_tool

        orch_response = {
            "status": "success",
            "response": {"result": {"agent_response": "Found 3 stale servers."}},
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        tool_input = {
            "query": "show stale linux servers older than 60 days",
            "tool_hint": "find_stale_configuration_items",
            "tool_args": {"ci_type": "linux_server", "days": 60, "limit": 10},
        }

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input=tool_input,
                conversation_id="conv-hint",
            )

        post_mock = mock_client.__aenter__.return_value.post
        call_kwargs = post_mock.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert "context" in payload
        assert payload["context"]["tool_hint"] == "find_stale_configuration_items"
        assert payload["context"]["tool_args"]["ci_type"] == "linux_server"
        assert payload["context"]["tool_args"]["days"] == 60
        # query should NOT be in context
        assert "query" not in payload["context"]

    @pytest.mark.asyncio
    async def test_tool_hint_absent_no_context(self):
        """When tool_hint is not set and only query present, no context field is sent."""
        from app.services.claude_service import _call_orchestrator_tool

        orch_response = {
            "status": "success",
            "response": {"result": {"agent_response": "OK"}},
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = orch_response

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        with patch("app.services.claude_service.httpx.AsyncClient", return_value=mock_client):
            await _call_orchestrator_tool(
                tool_name="query_cmdb",
                tool_input={"query": "show servers"},
                conversation_id="conv-no-hint",
            )

        post_mock = mock_client.__aenter__.return_value.post
        call_kwargs = post_mock.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert "context" not in payload


# ---------------------------------------------------------------------------
# suggest_follow_ups tool definition tests
# ---------------------------------------------------------------------------


class TestSuggestFollowUpsTool:
    """Tests for the suggest_follow_ups tool definition."""

    def test_suggest_follow_ups_not_in_tool_to_agent(self):
        """suggest_follow_ups is local — must NOT be in TOOL_TO_AGENT."""
        from app.services.claude_service import TOOL_TO_AGENT

        assert "suggest_follow_ups" not in TOOL_TO_AGENT

    def test_suggest_follow_ups_in_all_tools(self):
        """suggest_follow_ups is in ALL_TOOLS but not in TOOLS."""
        from app.services.claude_service import ALL_TOOLS, TOOLS

        tool_names = {t["name"] for t in TOOLS}
        all_tool_names = {t["name"] for t in ALL_TOOLS}

        assert "suggest_follow_ups" not in tool_names
        assert "suggest_follow_ups" in all_tool_names

    def test_suggest_follow_ups_schema(self):
        """suggest_follow_ups schema requires follow_ups array."""
        from app.services.claude_service import SUGGEST_FOLLOW_UPS_TOOL

        schema = SUGGEST_FOLLOW_UPS_TOOL["input_schema"]
        assert "follow_ups" in schema["properties"]
        assert schema["required"] == ["follow_ups"]

        items = schema["properties"]["follow_ups"]["items"]
        assert set(items["required"]) == {"label", "message"}

    def test_all_tools_count(self):
        """ALL_TOOLS = 6 orchestrator tools + create_artifact + suggest_follow_ups."""
        from app.services.claude_service import ALL_TOOLS, TOOLS

        assert len(ALL_TOOLS) == len(TOOLS) + 2


# ---------------------------------------------------------------------------
# _extract_follow_ups tests
# ---------------------------------------------------------------------------


class TestExtractFollowUps:
    """Tests for the _extract_follow_ups helper."""

    def test_valid_input(self):
        """Extracts follow-ups from well-formed input."""
        from app.services.claude_service import _extract_follow_ups

        result = _extract_follow_ups({
            "follow_ups": [
                {"label": "Check health", "message": "Show CMDB health metrics"},
                {"label": "Find stale CIs", "message": "Find stale servers"},
                {"label": "Run audit", "message": "Run a compliance audit"},
            ]
        })

        assert len(result) == 3
        assert result[0]["label"] == "Check health"
        assert result[1]["message"] == "Find stale servers"

    def test_invalid_input_returns_empty(self):
        """Returns empty list on invalid input."""
        from app.services.claude_service import _extract_follow_ups

        assert _extract_follow_ups({}) == []
        assert _extract_follow_ups({"follow_ups": "not a list"}) == []
        assert _extract_follow_ups({"follow_ups": None}) == []

    def test_truncates_to_three(self):
        """Only takes the first 3 follow-ups."""
        from app.services.claude_service import _extract_follow_ups

        result = _extract_follow_ups({
            "follow_ups": [
                {"label": f"Item {i}", "message": f"msg {i}"}
                for i in range(5)
            ]
        })

        assert len(result) == 3

    def test_skips_malformed_entries(self):
        """Skips entries missing required fields."""
        from app.services.claude_service import _extract_follow_ups

        result = _extract_follow_ups({
            "follow_ups": [
                {"label": "Good one", "message": "OK"},
                {"label": "Missing message"},
                {"label": "Also good", "message": "Also OK"},
            ]
        })

        assert len(result) == 2
        assert result[0]["label"] == "Good one"
        assert result[1]["label"] == "Also good"


# ---------------------------------------------------------------------------
# LOCAL_TOOLS tests
# ---------------------------------------------------------------------------


class TestLocalTools:
    """Tests for the LOCAL_TOOLS set."""

    def test_local_tools_contents(self):
        """LOCAL_TOOLS contains create_artifact and suggest_follow_ups."""
        from app.services.claude_service import LOCAL_TOOLS

        assert LOCAL_TOOLS == {"create_artifact", "suggest_follow_ups"}

    def test_local_tools_not_in_tool_to_agent(self):
        """No local tool should be in TOOL_TO_AGENT."""
        from app.services.claude_service import LOCAL_TOOLS, TOOL_TO_AGENT

        for tool_name in LOCAL_TOOLS:
            assert tool_name not in TOOL_TO_AGENT


# ---------------------------------------------------------------------------
# _build_system_prompt tests
# ---------------------------------------------------------------------------


class TestBuildSystemPrompt:
    """Tests for the _build_system_prompt function."""

    def test_with_servicenow_instance(self):
        """When servicenow_instance is set, prompt includes SN URLs."""
        from app.services.claude_service import SYSTEM_PROMPT, _build_system_prompt

        with patch("app.services.claude_service.get_settings") as mock_settings:
            mock_settings.return_value.servicenow_instance = "https://myinstance.service-now.com/"
            result = _build_system_prompt()

        assert result.startswith(SYSTEM_PROMPT)
        assert "https://myinstance.service-now.com" in result
        assert "nav_to.do?uri=cmdb_ci.do" in result
        # Should strip trailing slash
        assert "service-now.com//" not in result

    def test_without_servicenow_instance(self):
        """When servicenow_instance is empty, returns base SYSTEM_PROMPT."""
        from app.services.claude_service import SYSTEM_PROMPT, _build_system_prompt

        with patch("app.services.claude_service.get_settings") as mock_settings:
            mock_settings.return_value.servicenow_instance = ""
            result = _build_system_prompt()

        assert result == SYSTEM_PROMPT

    def test_system_prompt_has_follow_up_instructions(self):
        """SYSTEM_PROMPT includes follow-up suggestion instructions."""
        from app.services.claude_service import SYSTEM_PROMPT

        assert "FOLLOW-UP SUGGESTIONS" in SYSTEM_PROMPT
        assert "suggest_follow_ups" in SYSTEM_PROMPT
