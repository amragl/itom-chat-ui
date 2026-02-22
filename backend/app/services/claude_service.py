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

import httpx

from ..config import get_settings

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

PRESENTING TOOL RESULTS (CRITICAL — follow these rules exactly):
- When a tool returns data, you MUST include the actual data in your response. \
Do NOT summarize, paraphrase, or omit details. The user needs to see the specific \
CI names, statuses, and links — not a count or vague description.
- If the tool result contains a markdown table, include that table in your response. \
You may add a brief introduction sentence before it, but NEVER replace the table \
with a summary like "I found N items".
- If the tool result contains ServiceNow links (URLs), you MUST preserve every link \
in your response exactly as returned. Never drop or rewrite links.
- You may add a short conversational sentence before or after the data, but the data \
itself must be presented in full.
- When creating a remediation request after a CMDB query, FIRST show the user which \
CIs you found (with names and links), THEN proceed to create the request.

LINK RULES:
- When mentioning CIs or RITMs, ALWAYS include a clickable ServiceNow link for each (up to 5).
- If more than 5 items, show the first 5 with links and add "... and N more" with a \
link to the full list view (the "Show all listed in ServiceNow" link from the tool result).
- Preserve ALL ServiceNow URLs from tool results in your response. Never drop a link.

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
  get_request_details(req_sys_id) — full request tree

TOOL_HINT RULES:
- Set tool_hint to the exact MCP tool name (e.g. "find_stale_configuration_items") when the \
user's intent clearly maps to a specific tool.
- Set tool_args to the tool's parameters as a JSON object (e.g. {"ci_type": "linux_server", \
"days": 60, "limit": 10}).
- If unsure which tool to use, omit tool_hint — the orchestrator will use keyword matching.
- Common ci_type values: server, linux_server, win_server, database, application, network_gear, \
storage."""

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

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        messages = history.get(conversation_id)

        full_content = ""
        tool_use_blocks: list[dict] = []

        # First Claude call (may include tool_use)
        async with client.messages.stream(
            model=settings.claude_model,
            max_tokens=settings.claude_max_tokens,
            temperature=settings.claude_temperature,
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=TOOLS,
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

        # If Claude wants to call tools, execute them and get a follow-up response
        if tool_use_blocks:
            # Build the assistant message with tool_use blocks for history
            assistant_content: list[dict] = []
            if full_content:
                assistant_content.append({"type": "text", "text": full_content})
            for tool_block in tool_use_blocks:
                try:
                    tool_input = json.loads(tool_block["input_json"])
                except json.JSONDecodeError as e:
                    logger.warning(
                        "Malformed tool JSON from Claude: %s — raw: %s",
                        e,
                        tool_block["input_json"][:500],
                    )
                    tool_input = {"query": content, "_parse_error": str(e)}
                assistant_content.append({
                    "type": "tool_use",
                    "id": tool_block["id"],
                    "name": tool_block["name"],
                    "input": tool_input,
                })

            history.add(conversation_id, {"role": "assistant", "content": assistant_content})

            # Execute each tool call
            tool_results: list[dict] = []
            for tool_block in tool_use_blocks:
                try:
                    tool_input = json.loads(tool_block["input_json"])
                except json.JSONDecodeError as e:
                    logger.warning(
                        "Malformed tool JSON from Claude: %s — raw: %s",
                        e,
                        tool_block["input_json"][:500],
                    )
                    tool_input = {"query": content, "_parse_error": str(e)}

                result = await _call_orchestrator_tool(
                    tool_name=tool_block["name"],
                    tool_input=tool_input,
                    conversation_id=conversation_id,
                )
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_block["id"],
                    "content": result,
                })

            # Add tool results to history
            history.add(conversation_id, {"role": "user", "content": tool_results})

            # Second Claude call: interpret tool results
            messages_with_results = history.get(conversation_id)
            full_content = ""  # Reset for second response

            async with client.messages.stream(
                model=settings.claude_model,
                max_tokens=settings.claude_max_tokens,
                temperature=settings.claude_temperature,
                system=SYSTEM_PROMPT,
                messages=messages_with_results,
                tools=TOOLS,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            text = event.delta.text
                            full_content += text
                            yield _sse_event("token", {
                                "token": text,
                                "message_id": message_id,
                            })

        # Store assistant response in history
        if full_content:
            history.add(conversation_id, {"role": "assistant", "content": full_content})

        # Emit stream_end
        yield _sse_event("stream_end", {
            "message_id": message_id,
            "full_content": full_content,
            "agent_id": "claude",
            "agent_name": "ITOM Assistant",
            "conversation_id": conversation_id,
            "timestamp": datetime.now(UTC).isoformat(),
        })

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

    except anthropic.APIError as exc:
        logger.warning("Claude API error (%s) — falling back to legacy streaming", exc)
        from .streaming import stream_chat_response

        async for event in stream_chat_response(content, conversation_id, agent_target):
            yield event

    except Exception:
        logger.exception("Unexpected error in Claude streaming for conversation %s", conversation_id)
        yield _sse_event("error", {
            "code": "CLAUDE_INTERNAL_ERROR",
            "message": "An unexpected error occurred with the AI assistant.",
        })


# ---------------------------------------------------------------------------
# Orchestrator tool caller
# ---------------------------------------------------------------------------


async def _call_orchestrator_tool(
    tool_name: str,
    tool_input: dict,
    conversation_id: str,
) -> str:
    """Call the ITOM orchestrator with an explicit target_agent.

    This bypasses the orchestrator's keyword router entirely by setting
    target_agent directly (Step 1 of the router's 5-step cascade).

    Parameters:
        tool_name: The Claude tool name (e.g., "query_cmdb").
        tool_input: The tool input from Claude (contains "query" key).
        conversation_id: Current conversation ID for session continuity.

    Returns:
        The agent_response text, or an error description string.
    """
    settings = get_settings()
    target_agent = TOOL_TO_AGENT.get(tool_name)

    if not target_agent:
        return f"Unknown tool: {tool_name}"

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
                    "The agent may be temporarily unavailable."
                )

            orch_data = response.json()

            # Extract agent_response from nested structure
            resp = orch_data.get("response", {})
            if isinstance(resp, dict):
                result = resp.get("result", {})
                if isinstance(result, dict):
                    if "agent_response" in result:
                        return result["agent_response"]
                    if result:
                        return json.dumps(result, indent=2)

            # Fallback: return the whole response as JSON for Claude to interpret
            return json.dumps(orch_data, indent=2)

    except httpx.ConnectError:
        logger.error("Cannot connect to orchestrator for tool %s", tool_name)
        return (
            "Error: Cannot connect to the ITOM orchestrator. "
            "The orchestrator service may not be running."
        )
    except httpx.ReadTimeout:
        logger.error("Orchestrator timeout for tool %s", tool_name)
        return "Error: The orchestrator took too long to respond. Please try again."
    except Exception:
        logger.exception("Unexpected error calling orchestrator for tool %s", tool_name)
        return "Error: An unexpected error occurred while contacting the agent."
