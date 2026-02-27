"""Claude AI conversational layer for ITOM Chat.

Replaces keyword-based routing with semantic intent classification via Claude's
tool_use capability. Claude interprets user messages, decides which ITOM agent
tool to call, then wraps structured agent data in natural language responses.

When CHAT_ANTHROPIC_API_KEY is not set, all requests fall back transparently
to the legacy keyword-based streaming service.

Architecture:
    Frontend -> chat_stream.py -> stream_claude_response()
        -> Claude Messages API (streaming, with tools)
        -> _call_orchestrator_tool() -> POST orchestrator /api/chat
        -> Claude interprets tool result -> SSE tokens to frontend
"""

from __future__ import annotations

import json
import logging
import uuid
from collections import OrderedDict
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import anthropic
import httpx

from ..artifact_detector import ArtifactDetector
from ..config import get_settings

# Module-level artifact detector (stateless, safe to reuse)
_artifact_detector = ArtifactDetector()

# Cached Anthropic async client — reuses the internal httpx connection pool
_anthropic_client: anthropic.AsyncAnthropic | None = None
_anthropic_client_key: str | None = None


def _get_anthropic_client(api_key: str) -> anthropic.AsyncAnthropic:
    """Return a cached AsyncAnthropic client, recreating only if the key changes."""
    global _anthropic_client, _anthropic_client_key  # noqa: PLW0603
    if _anthropic_client is None or _anthropic_client_key != api_key:
        _anthropic_client = anthropic.AsyncAnthropic(api_key=api_key)
        _anthropic_client_key = api_key
    return _anthropic_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an ITOM (IT Operations Management) assistant integrated with \
ServiceNow. You help users manage their IT infrastructure through 6 specialized agent tools.

Instructions:
- Use the appropriate tool when users ask about infrastructure, services, assets, \
compliance, discovery, or documentation.
- For conversational follow-ups (greetings, clarifications, "what did you find?", \
"tell me more"), respond directly without calling a tool.
- If the user's request is ambiguous, ask a clarifying question instead of guessing.
- When multiple tools could apply, choose the most specific one. For example, \
"create a remediation request" -> create_service_request, not query_cmdb.
- If a tool returns an error, explain what went wrong and suggest next steps.

ARTIFACT CREATION (CRITICAL — follow these rules exactly):
When a tool returns data, you MUST call create_artifact to present it visually. This is NOT \
optional. Every tool result that contains metrics, tables, findings, or lists MUST become an \
artifact. Do NOT paste tool results as inline text or markdown tables in your response.
- Use artifact_type "dashboard" for metrics, health scores, agent status overviews.
- Use artifact_type "report" for audit results, compliance findings with severity levels.
- Use artifact_type "table" for tabular CI listings, comparison data, search results with \
multiple rows.
- Use artifact_type "document" for generated runbooks, KB articles, long-form documentation.
- Your text response MUST include a brief natural-language summary (1-3 sentences) alongside \
the artifact. Mention key highlights (e.g., "Found 50 servers, 15 running EOL operating systems").
- Do NOT duplicate the data as inline text — the artifact IS the presentation.
- Do NOT call other tools in the same response as create_artifact. Present the data you have.

PRESENTING TOOL RESULTS:
- If the tool result contains ServiceNow links (URLs), preserve them in the artifact content.
- When mentioning CIs or RITMs in your summary text, include a clickable ServiceNow link \
for each (up to 5). If more than 5 items, show the first 5 with links and add "... and N more" \
with a link to the full list view.
- When creating a remediation request after a CMDB query, FIRST show the user which \
CIs you found (via create_artifact with type "table"), THEN proceed to create the request.

PRESERVING STRUCTURED DATA FROM TOOL RESULTS:
When the tool result contains a ```dashboard or ```report fenced code block with JSON, \
you do NOT need to create an artifact for it — the system extracts these automatically. \
Focus your create_artifact calls on data that is NOT already in a dashboard/report block. \
Do NOT fabricate ServiceNow URLs — only use URLs that appear in the tool result.

REMEDIATION REQUEST TYPES:
There are 2 remediation modes:
1. Manual — CI owners must update their CIs (for missing data: serial numbers, owners, OS info). \
Use when humans need to provide data the agent doesn't have.
2. Agent — The system auto-remediates (for duplicate merges, stale CI retirement, creating missing \
relationships). Use when the fix can be automated.
Always specify the correct mode based on the issue type.

STRUCTURED REMEDIATION:
When creating remediation requests after a CMDB query, you MUST include structured data from the \
previous results:
- List affected CIs with their sys_ids, names, and CI class.
- Describe what's wrong with each CI (the issue) and what needs to be done (the proposed fix).
- Specify remediation_type and remediation_mode.

AVAILABLE MCP TOOLS (set tool_hint to the exact tool name when you can determine the specific operation):

CMDB (query_cmdb):
  search_configuration_items(ci_type, environment, query, limit) — search CIs by type/env/query
  find_stale_configuration_items(ci_type, days, limit) — CIs not updated in N days
  find_duplicate_configuration_items(ci_type, match_field) — duplicate detection
  get_cmdb_health_metrics(ci_type) — health scores and data quality
  get_cmdb_health_trend_report(ci_type, days) — health trends over time
  get_operational_dashboard() — comprehensive CMDB overview
  query_ci_dependency_tree(ci_sys_id, depth) — relationship tree
  analyze_configuration_item_impact(ci_sys_id) — change impact analysis
  get_configuration_item_history(ci_sys_id, limit) — change audit log
  reconcile_cmdb_configuration_data(ci_type, dry_run) — data drift detection
  get_ire_rules_for_class(ci_class) — IRE rules lookup
  list_ci_types() — available CI types and classes

CSA (create_service_request):
  create_remediation_request(remediation_type, remediation_mode, issue_summary, affected_cis, \
proposed_action, risk_level) — create RITM with per-CI tasks
  create_service_request(description) — generic service request
  check_approval_status(ritm_sys_id) — approval state
  approve_remediation_request(ritm_sys_id, comments) — approve a pending RITM
  reject_remediation_request(ritm_sys_id, comments) — reject a pending RITM (comments required)
  get_request_details(req_sys_id) — full request tree

TOOL_HINT RULES:
- Set tool_hint to the exact MCP tool name (e.g. "find_stale_configuration_items") when the \
user's intent clearly maps to a specific tool.
- Set tool_args to the tool's parameters as a JSON object (e.g. {"ci_type": "linux_server", \
"days": 60, "limit": 10}).
- If unsure which tool to use, omit tool_hint — the orchestrator will use keyword matching.
- Common ci_type values: server, linux_server, win_server, database, application, network_gear, \
storage.

FOLLOW-UP SUGGESTIONS (CRITICAL — call with EVERY response):
After every response, you MUST call suggest_follow_ups with exactly 3 suggestions:
1. A follow-up that digs deeper into the current result (e.g., "Show dependency tree for srv-01").
2. A follow-up that takes the next logical action (e.g., "Create remediation request for stale CIs").
3. An alternative useful action unrelated to the current topic (e.g., "Check CMDB health metrics").
Keep labels short (3-6 words). Messages should be specific and actionable.
Call suggest_follow_ups in the SAME response as create_artifact — do not make a separate response."""

# ---------------------------------------------------------------------------
# Tool definitions (6 ITOM agent tools)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "query_cmdb",
        "description": (
            "Search and query the ServiceNow CMDB (Configuration Management Database). "
            "Use for finding CIs (configuration items), checking CI health metrics, "
            "finding stale or duplicate CIs, and any CMDB-related queries."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language query about CMDB data",
                },
                "tool_hint": {
                    "type": "string",
                    "description": "Exact MCP tool name (e.g. 'find_stale_configuration_items'). Set when you can determine the specific operation.",
                },
                "tool_args": {
                    "type": "object",
                    "description": "Arguments for the MCP tool. Keys must match tool parameter names (e.g. {\"ci_type\": \"server\", \"days\": 90, \"limit\": 10}).",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "create_service_request",
        "description": (
            "Create service requests, remediation requests, change requests, or "
            "interact with the ServiceNow service catalog. Use for any request "
            "creation, ticket creation, or catalog item operations."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Description of the service request to create",
                },
                "tool_hint": {
                    "type": "string",
                    "description": "Exact MCP tool name (e.g. 'create_remediation_request'). Set when you can determine the specific operation.",
                },
                "tool_args": {
                    "type": "object",
                    "description": "Arguments for the MCP tool. Keys must match tool parameter names.",
                },
                "remediation_type": {
                    "type": "string",
                    "enum": ["missing_data", "duplicate_merge", "stale_retirement"],
                    "description": "Type of remediation (omit for generic service requests)",
                },
                "remediation_mode": {
                    "type": "string",
                    "enum": ["manual", "agent"],
                    "description": "manual=CI owner updates, agent=system auto-fixes",
                },
                "affected_cis": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sys_id": {"type": "string"},
                            "name": {"type": "string"},
                            "ci_class": {"type": "string"},
                            "issue": {"type": "string"},
                            "proposed_fix": {"type": "string"},
                        },
                    },
                    "description": "CIs from previous CMDB queries that need remediation",
                },
                "risk_level": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "run_discovery",
        "description": (
            "Run network discovery scans, IP range discovery, or check discovery "
            "status. Use for finding new devices on the network, scanning IP ranges, "
            "or checking what has been discovered."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Discovery operation to perform",
                },
                "tool_hint": {
                    "type": "string",
                    "description": "Exact MCP tool name. Set when you can determine the specific operation.",
                },
                "tool_args": {
                    "type": "object",
                    "description": "Arguments for the MCP tool. Keys must match tool parameter names.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "manage_assets",
        "description": (
            "Manage hardware and software assets, check inventory, license "
            "compliance, and asset lifecycle. Use for asset-related queries "
            "including hardware inventory, software licenses, and asset tracking."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Asset management query or operation",
                },
                "tool_hint": {
                    "type": "string",
                    "description": "Exact MCP tool name. Set when you can determine the specific operation.",
                },
                "tool_args": {
                    "type": "object",
                    "description": "Arguments for the MCP tool. Keys must match tool parameter names.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "run_audit",
        "description": (
            "Run compliance audits, check configuration drift, and verify "
            "infrastructure compliance. Use for audit-related queries, compliance "
            "checks, drift detection, and security posture assessment."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Audit or compliance check to perform",
                },
                "tool_hint": {
                    "type": "string",
                    "description": "Exact MCP tool name. Set when you can determine the specific operation.",
                },
                "tool_args": {
                    "type": "object",
                    "description": "Arguments for the MCP tool. Keys must match tool parameter names.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "generate_documentation",
        "description": (
            "Generate runbooks, KB articles, operational documentation, and "
            "technical guides. Use for documentation creation, runbook generation, "
            "and knowledge base operations."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Documentation to generate or look up",
                },
                "tool_hint": {
                    "type": "string",
                    "description": "Exact MCP tool name. Set when you can determine the specific operation.",
                },
                "tool_args": {
                    "type": "object",
                    "description": "Arguments for the MCP tool. Keys must match tool parameter names.",
                },
            },
            "required": ["query"],
        },
    },
]

CREATE_ARTIFACT_TOOL = {
    "name": "create_artifact",
    "description": (
        "Create a rich visual artifact for the user. Use this when a tool returns structured "
        "data that is better presented as a visual component (dashboard, report, table, document) "
        "rather than as inline text.\n\n"
        "Content schemas by artifact_type:\n"
        "- report: {score?, score_link?: string, status?, sections?: [{title, content, score?, status?, link?}], "
        "findings?: [{severity, title?, description, recommendation?, link?: string (SN URL), affected_count?: number}]}\n"
        "- dashboard: {status?, metrics?: {key: number|string|MetricValue}, "
        "agents?: [{name, status, response_time_ms?}]}  "
        "MetricValue = {value: number|string, link?: string (SN URL), drill_down?: string}\n"
        "- table: {headers: string[], rows: string[][]}\n"
        "- document: {markdown: string}"
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "artifact_type": {
                "type": "string",
                "enum": ["report", "dashboard", "table", "document"],
                "description": "The type of visual artifact to create.",
            },
            "title": {
                "type": "string",
                "description": "Human-readable title for the artifact.",
            },
            "content": {
                "type": "object",
                "description": "Structured content matching the schema for the chosen artifact_type.",
            },
        },
        "required": ["artifact_type", "title", "content"],
    },
}

SUGGEST_FOLLOW_UPS_TOOL = {
    "name": "suggest_follow_ups",
    "description": (
        "Suggest 3 follow-up actions for the user. Call this tool with every response. "
        "Provide exactly 3 suggestions: 2 follow-ups related to the current response, "
        "and 1 alternative useful action unrelated to the current topic."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "follow_ups": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {
                            "type": "string",
                            "description": "Short pill label (3-6 words).",
                        },
                        "message": {
                            "type": "string",
                            "description": "Full chat message to send when clicked.",
                        },
                    },
                    "required": ["label", "message"],
                },
                "minItems": 3,
                "maxItems": 3,
            },
        },
        "required": ["follow_ups"],
    },
}

# Tools handled locally (not routed to orchestrator)
LOCAL_TOOLS = {"create_artifact", "suggest_follow_ups"}

# ALL_TOOLS = orchestrator tools + local tools (passed to Claude API)
ALL_TOOLS = TOOLS + [CREATE_ARTIFACT_TOOL, SUGGEST_FOLLOW_UPS_TOOL]

# Maps tool names to orchestrator target_agent IDs
TOOL_TO_AGENT: dict[str, str] = {
    "query_cmdb": "cmdb-agent",
    "create_service_request": "csa-agent",
    "run_discovery": "discovery",
    "manage_assets": "asset",
    "run_audit": "auditor",
    "generate_documentation": "documentator",
}

# ---------------------------------------------------------------------------
# Conversation history (in-memory, per-conversation)
# ---------------------------------------------------------------------------

MAX_MESSAGES_PER_CONVERSATION = 20
MAX_CONVERSATIONS = 500


class ConversationHistory:
    """In-memory conversation history store using LRU eviction.

    Stores the last MAX_MESSAGES_PER_CONVERSATION messages per conversation,
    with a cap of MAX_CONVERSATIONS total conversations. Uses OrderedDict
    for LRU behavior — accessing a conversation moves it to the end.
    """

    def __init__(self) -> None:
        self._store: OrderedDict[str, list[dict]] = OrderedDict()

    def add(self, conversation_id: str, message: dict) -> None:
        """Add a message to a conversation's history."""
        if conversation_id not in self._store:
            # Evict oldest if at capacity
            if len(self._store) >= MAX_CONVERSATIONS:
                self._store.popitem(last=False)
            self._store[conversation_id] = []
        else:
            # Move to end (most recently used)
            self._store.move_to_end(conversation_id)

        self._store[conversation_id].append(message)

        # Trim to max messages
        if len(self._store[conversation_id]) > MAX_MESSAGES_PER_CONVERSATION:
            self._store[conversation_id] = self._store[conversation_id][
                -MAX_MESSAGES_PER_CONVERSATION:
            ]

    def get(self, conversation_id: str) -> list[dict]:
        """Get all messages for a conversation."""
        if conversation_id in self._store:
            self._store.move_to_end(conversation_id)
            return list(self._store[conversation_id])
        return []

    @property
    def conversation_count(self) -> int:
        """Number of active conversations."""
        return len(self._store)


# Module-level singleton
_conversation_history = ConversationHistory()


def get_conversation_history() -> ConversationHistory:
    """Return the module-level conversation history singleton."""
    return _conversation_history


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


def _sse_event(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event string."""
    payload = {"event": event_type, "data": data}
    return f"data: {json.dumps(payload)}\n\n"


# ---------------------------------------------------------------------------
# Artifact builder (local tool handler)
# ---------------------------------------------------------------------------


def _build_artifact_from_tool(tool_input: dict) -> dict | None:
    """Build a frontend-compatible artifact dict from create_artifact tool input.

    Returns None if required fields are missing.
    """
    artifact_type = tool_input.get("artifact_type")
    title = tool_input.get("title")
    content = tool_input.get("content")

    if not artifact_type or not title or content is None:
        return None

    # For document type, extract the markdown string directly
    if artifact_type == "document" and isinstance(content, dict):
        serialized_content = content.get("markdown", json.dumps(content))
    else:
        # JSON-stringify for transport; frontend will parse back
        serialized_content = json.dumps(content) if not isinstance(content, str) else content

    return {
        "id": str(uuid.uuid4()),
        "type": artifact_type,
        "title": title,
        "content": serialized_content,
        "metadata": {"source": "create_artifact_tool"},
    }


def _extract_follow_ups(tool_input: dict) -> list[dict]:
    """Extract follow-up suggestions from suggest_follow_ups tool input.

    Returns a list of {label, message} dicts, or [] on invalid input.
    """
    follow_ups = tool_input.get("follow_ups")
    if not isinstance(follow_ups, list):
        return []
    return [
        {"label": f["label"], "message": f["message"]}
        for f in follow_ups[:3]
        if isinstance(f, dict) and "label" in f and "message" in f
    ]


# ---------------------------------------------------------------------------
# Dynamic system prompt
# ---------------------------------------------------------------------------


def _build_system_prompt() -> str:
    """Build the system prompt, optionally injecting ServiceNow instance URL."""
    settings = get_settings()
    sn_url = (
        settings.servicenow_instance.rstrip("/")
        if settings.servicenow_instance
        else ""
    )
    if sn_url:
        sn_section = (
            f"\n\nSERVICENOW INSTANCE:\n"
            f"URL: {sn_url}\n"
            f"CI link: {sn_url}/nav_to.do?uri=cmdb_ci.do?sys_id=<SYS_ID>\n"
            f"CI list: {sn_url}/nav_to.do?uri=cmdb_ci_list.do?sysparm_query=name=<NAME>\n"
            f"In table artifacts, make the Name column a markdown link: [CI Name](url)\n"
            f"In your summary text, include clickable links for the top 10 CIs mentioned."
        )
        return SYSTEM_PROMPT + sn_section
    return SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_tool_input(tool_block: dict, fallback_content: str) -> dict:
    """Parse a tool block's accumulated JSON, with a safe fallback."""
    try:
        return json.loads(tool_block["input_json"])
    except json.JSONDecodeError as e:
        logger.warning(
            "Malformed tool JSON from Claude: %s — raw: %s",
            e,
            tool_block["input_json"][:500],
        )
        return {"query": fallback_content, "_parse_error": str(e)}


# ---------------------------------------------------------------------------
# Core streaming function
# ---------------------------------------------------------------------------


async def stream_claude_response(
    content: str,
    conversation_id: str,
    agent_target: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream a Claude-powered chat response as SSE events.

    If CHAT_ANTHROPIC_API_KEY is not set, falls back to the legacy
    keyword-based streaming service transparently.

    Parameters:
        content: The user's message text.
        conversation_id: UUID of the conversation.
        agent_target: Optional explicit agent target (bypasses Claude routing).

    Yields:
        SSE-formatted strings: ``data: {json}\\n\\n``.
    """
    settings = get_settings()

    # Fallback: no API key -> legacy streaming
    if not settings.anthropic_api_key:
        from .streaming import stream_chat_response

        async for event in stream_chat_response(content, conversation_id, agent_target):
            yield event
        return

    # If an explicit agent_target is set, skip Claude and use legacy routing
    # (the user clicked a suggested action pill targeting a specific agent)
    if agent_target:
        from .streaming import stream_chat_response

        async for event in stream_chat_response(content, conversation_id, agent_target):
            yield event
        return

    message_id = str(uuid.uuid4())
    history = get_conversation_history()

    logger.info(
        "Claude request: conversation=%s, history_turns=%d",
        conversation_id,
        len(history.get(conversation_id)),
    )

    # Emit stream_start
    yield _sse_event("stream_start", {
        "message_id": message_id,
        "agent_id": "claude",
        "conversation_id": conversation_id,
        "timestamp": datetime.now(UTC).isoformat(),
    })

    # Add user message to history
    history.add(conversation_id, {"role": "user", "content": content})

    # Track whether stream_end has been emitted so the finally block can
    # guarantee it is always sent (even after exceptions).
    stream_end_emitted = False
    full_content = ""

    try:
        client = _get_anthropic_client(settings.anthropic_api_key)
        messages = history.get(conversation_id)

        tool_use_blocks: list[dict] = []

        # First Claude call (may include tool_use)
        async with client.messages.stream(
            model=settings.claude_model,
            max_tokens=settings.claude_max_tokens,
            temperature=settings.claude_temperature,
            system=_build_system_prompt(),
            messages=messages,
            tools=ALL_TOOLS,
        ) as stream:
            async for event in stream:
                if event.type == "content_block_start":
                    if event.content_block.type == "tool_use":
                        tool_use_blocks.append({
                            "id": event.content_block.id,
                            "name": event.content_block.name,
                            "input_json": "",
                        })
                elif event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        text = event.delta.text
                        full_content += text
                        yield _sse_event("token", {
                            "token": text,
                            "message_id": message_id,
                        })
                    elif event.delta.type == "input_json_delta":
                        if tool_use_blocks:
                            tool_use_blocks[-1]["input_json"] += event.delta.partial_json

        # Suggested actions collected from orchestrator tool responses
        # (populated when tool calls return actions from the orchestrator)
        collected_actions: list[dict] = []
        # Artifacts created via create_artifact tool calls
        collected_artifacts: list[dict] = []
        # Follow-up suggestions from suggest_follow_ups tool
        collected_follow_ups: list[dict] = []
        # Authoritative artifacts pre-extracted from orchestrator responses
        # (contain real SN URLs — these replace any Claude-fabricated versions)
        authoritative_artifacts: list[dict] = []

        # If Claude wants to call tools, execute them and get a follow-up response
        if tool_use_blocks:
            # Build the assistant message with tool_use blocks for history
            assistant_content: list[dict] = []
            if full_content:
                assistant_content.append({"type": "text", "text": full_content})
            for tool_block in tool_use_blocks:
                tool_input = _parse_tool_input(tool_block, content)
                assistant_content.append({
                    "type": "tool_use",
                    "id": tool_block["id"],
                    "name": tool_block["name"],
                    "input": tool_input,
                })

            history.add(conversation_id, {"role": "assistant", "content": assistant_content})

            # Execute each tool call
            tool_results: list[dict] = []
            has_orchestrator_tools = False
            for tool_block in tool_use_blocks:
                tool_input = _parse_tool_input(tool_block, content)

                # Handle local tools (not routed to orchestrator)
                if tool_block["name"] in LOCAL_TOOLS:
                    if tool_block["name"] == "create_artifact":
                        artifact = _build_artifact_from_tool(tool_input)
                        if artifact:
                            collected_artifacts.append(artifact)
                    elif tool_block["name"] == "suggest_follow_ups":
                        collected_follow_ups.extend(_extract_follow_ups(tool_input))
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_block["id"],
                        "content": f"{tool_block['name']} processed successfully.",
                    })
                    continue

                has_orchestrator_tools = True
                result_text, actions, auth_arts = await _call_orchestrator_tool(
                    tool_name=tool_block["name"],
                    tool_input=tool_input,
                    conversation_id=conversation_id,
                )
                if actions:
                    collected_actions.extend(actions)
                if auth_arts:
                    authoritative_artifacts.extend(auth_arts)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_block["id"],
                    "content": result_text,
                })

            if has_orchestrator_tools:
                # Add tool results to history
                history.add(conversation_id, {"role": "user", "content": tool_results})

                # Second Claude call: interpret tool results
                messages_with_results = history.get(conversation_id)
                full_content = ""  # Reset for second response
                second_round_tool_blocks: list[dict] = []

                async with client.messages.stream(
                    model=settings.claude_model,
                    max_tokens=settings.claude_max_tokens,
                    temperature=settings.claude_temperature,
                    system=_build_system_prompt(),
                    messages=messages_with_results,
                    tools=ALL_TOOLS,
                ) as stream:
                    async for event in stream:
                        if event.type == "content_block_start":
                            if event.content_block.type == "tool_use":
                                second_round_tool_blocks.append({
                                    "id": event.content_block.id,
                                    "name": event.content_block.name,
                                    "input_json": "",
                                })
                        elif event.type == "content_block_delta":
                            if event.delta.type == "text_delta":
                                text = event.delta.text
                                full_content += text
                                yield _sse_event("token", {
                                    "token": text,
                                    "message_id": message_id,
                                })
                            elif event.delta.type == "input_json_delta":
                                if second_round_tool_blocks:
                                    second_round_tool_blocks[-1]["input_json"] += (
                                        event.delta.partial_json
                                    )

                # Process local tool calls from the second round
                for tb in second_round_tool_blocks:
                    if tb["name"] in LOCAL_TOOLS:
                        try:
                            ti = json.loads(tb["input_json"])
                        except json.JSONDecodeError:
                            continue
                        if tb["name"] == "create_artifact":
                            artifact = _build_artifact_from_tool(ti)
                            if artifact:
                                collected_artifacts.append(artifact)
                        elif tb["name"] == "suggest_follow_ups":
                            collected_follow_ups.extend(_extract_follow_ups(ti))
                    else:
                        logger.warning(
                            "Ignoring unexpected tool_use '%s' in second-round response",
                            tb["name"],
                        )

        # Store assistant response in history
        if full_content:
            history.add(conversation_id, {"role": "assistant", "content": full_content})

        # Replace Claude-fabricated dashboard/report artifacts with
        # authoritative versions that contain real ServiceNow URLs.
        if authoritative_artifacts:
            auth_types = {a["type"] for a in authoritative_artifacts}
            # Drop Claude's fabricated versions for types we have authoritative data for
            collected_artifacts = [
                a for a in collected_artifacts
                if a["type"] not in auth_types
            ]
            # Prepend authoritative artifacts (real SN URLs)
            collected_artifacts = authoritative_artifacts + collected_artifacts

        # Detect artifacts in the final response content (passive fallback)
        detected_artifacts = _artifact_detector.detect(full_content)
        serialized_detected = ArtifactDetector.serialize_for_frontend(detected_artifacts)

        # Merge: existing artifacts take priority; deduplicate by type+title
        existing_keys = {(a["type"], a["title"]) for a in collected_artifacts}
        existing_types = {a["type"] for a in collected_artifacts}
        for detected in serialized_detected:
            # Skip if we already have an authoritative artifact of this type
            if detected["type"] in existing_types and detected["type"] in {"dashboard", "report"}:
                continue
            if (detected["type"], detected["title"]) not in existing_keys:
                collected_artifacts.append(detected)

        # Emit stream_end (include suggested_actions from orchestrator + follow-ups)
        end_data: dict = {
            "message_id": message_id,
            "full_content": full_content,
            "agent_id": "claude",
            "agent_name": "ITOM Assistant",
            "conversation_id": conversation_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        all_actions = collected_actions + collected_follow_ups
        if all_actions:
            end_data["suggested_actions"] = all_actions
        if collected_artifacts:
            end_data["artifacts"] = collected_artifacts
        yield _sse_event("stream_end", end_data)
        stream_end_emitted = True

    except anthropic.AuthenticationError:
        logger.error("Claude API authentication failed — check CHAT_ANTHROPIC_API_KEY")
        yield _sse_event("error", {
            "code": "CLAUDE_AUTH_ERROR",
            "message": (
                "Claude AI authentication failed. "
                "Please check the CHAT_ANTHROPIC_API_KEY configuration."
            ),
        })

    except anthropic.RateLimitError:
        logger.warning("Claude API rate limited — falling back to legacy streaming")
        from .streaming import stream_chat_response

        async for event in stream_chat_response(content, conversation_id, agent_target):
            yield event
        stream_end_emitted = True  # fallback emits its own stream_end

    except anthropic.APIError:
        logger.exception("Claude API error — falling back to legacy streaming")
        from .streaming import stream_chat_response

        async for event in stream_chat_response(content, conversation_id, agent_target):
            yield event
        stream_end_emitted = True  # fallback emits its own stream_end

    except Exception:
        logger.exception("Unexpected error in Claude streaming for conversation %s", conversation_id)
        yield _sse_event("error", {
            "code": "CLAUDE_INTERNAL_ERROR",
            "message": "An unexpected error occurred with the AI assistant.",
        })

    finally:
        # Guarantee stream_end is always emitted so the frontend never hangs.
        if not stream_end_emitted:
            logger.warning(
                "Emitting fallback stream_end for conversation %s (partial content: %d chars)",
                conversation_id,
                len(full_content),
            )
            yield _sse_event("stream_end", {
                "message_id": message_id,
                "full_content": full_content,
                "agent_id": "claude",
                "agent_name": "ITOM Assistant",
                "conversation_id": conversation_id,
                "timestamp": datetime.now(UTC).isoformat(),
            })


# ---------------------------------------------------------------------------
# Authoritative artifact extraction
# ---------------------------------------------------------------------------


def _extract_authoritative_artifacts(response_text: str) -> list[dict]:
    """Pre-extract dashboard/report artifacts from orchestrator response text.

    These artifacts contain real ServiceNow URLs generated by the orchestrator.
    By extracting them here, we can replace any fabricated versions that Claude
    produces via create_artifact, ensuring ZERO MOCKS compliance.

    Returns frontend-compatible artifact dicts (same shape as _build_artifact_from_tool).
    """
    detected = _artifact_detector.detect(response_text)
    authoritative: list[dict] = []
    for art in detected:
        if art.artifact_type.value not in ("dashboard", "report", "table"):
            continue
        content = art.content
        if not isinstance(content, str):
            content = json.dumps(content)
        authoritative.append({
            "id": str(uuid.uuid4()),
            "type": art.artifact_type.value,
            "title": art.title,
            "content": content,
            "metadata": {**art.metadata, "authoritative": True},
        })
    return authoritative


# ---------------------------------------------------------------------------
# Orchestrator tool caller
# ---------------------------------------------------------------------------


async def _call_orchestrator_tool(
    tool_name: str,
    tool_input: dict,
    conversation_id: str,
) -> tuple[str, list[dict], list[dict]]:
    """Call the ITOM orchestrator with an explicit target_agent.

    This bypasses the orchestrator's keyword router entirely by setting
    target_agent directly (Step 1 of the router's 5-step cascade).

    Parameters:
        tool_name: The Claude tool name (e.g., "query_cmdb").
        tool_input: The tool input from Claude (contains "query" key).
        conversation_id: Current conversation ID for session continuity.

    Returns:
        A tuple of (agent_response_text, suggested_actions, authoritative_artifacts).
        Authoritative artifacts are pre-extracted from ```dashboard/```report blocks
        in the orchestrator response and contain real ServiceNow URLs.
    """
    settings = get_settings()
    target_agent = TOOL_TO_AGENT.get(tool_name)

    if not target_agent:
        return f"Unknown tool: {tool_name}", [], []

    query = tool_input.get("query", "")
    context = {k: v for k, v in tool_input.items() if k != "query"}
    orchestrator_payload: dict = {
        "message": query,
        "target_agent": target_agent,
        "session_id": conversation_id,
    }
    if context:
        orchestrator_payload["context"] = context

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            orchestrator_url = f"{settings.orchestrator_url}/api/chat"
            logger.info(
                "Claude tool call: %s -> %s (conversation=%s)",
                tool_name,
                target_agent,
                conversation_id,
            )
            response = await client.post(orchestrator_url, json=orchestrator_payload)

            if response.status_code != 200:
                logger.error(
                    "Orchestrator returned %d for tool %s: %s",
                    response.status_code,
                    tool_name,
                    response.text[:500],
                )
                return (
                    f"Error: The {target_agent} agent returned HTTP {response.status_code}. "
                    "The agent may be temporarily unavailable.",
                    [],
                    [],
                )

            orch_data = response.json()

            # Extract agent_response and suggested_actions from nested structure
            resp = orch_data.get("response", {})
            actions: list[dict] = []
            response_text = ""
            if isinstance(resp, dict):
                result = resp.get("result", {})
                if isinstance(result, dict):
                    actions = result.get("suggested_actions", [])
                    if not isinstance(actions, list):
                        actions = []
                    if "agent_response" in result:
                        response_text = result["agent_response"]
                    elif result:
                        response_text = json.dumps(result, indent=2)

            if not response_text:
                response_text = json.dumps(orch_data, indent=2)

            # Pre-extract authoritative artifacts from ```dashboard/```report
            # blocks in the orchestrator response.  These contain real SN URLs
            # that Claude might otherwise fabricate when it calls create_artifact.
            auth_artifacts = _extract_authoritative_artifacts(response_text)
            if auth_artifacts:
                logger.info(
                    "Pre-extracted %d authoritative artifact(s) from %s response",
                    len(auth_artifacts),
                    tool_name,
                )

            return response_text, actions, auth_artifacts

    except httpx.ConnectError:
        logger.error("Cannot connect to orchestrator for tool %s", tool_name)
        return (
            "Error: Cannot connect to the ITOM orchestrator. "
            "The orchestrator service may not be running.",
            [],
            [],
        )
    except httpx.ReadTimeout:
        logger.error("Orchestrator timeout for tool %s", tool_name)
        return "Error: The orchestrator took too long to respond. Please try again.", [], []
    except Exception:
        logger.exception("Unexpected error calling orchestrator for tool %s", tool_name)
        return "Error: An unexpected error occurred while contacting the agent.", [], []
