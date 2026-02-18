# ITOM Chat Backend API Documentation

Base URL: `http://localhost:8001`

Interactive documentation is available at `/docs` (Swagger UI) and `/redoc` (ReDoc) when the backend is running.

## Authentication

The backend supports two authentication modes:

- **SSO mode** (`CHAT_AUTH_MODE=sso`): Validates ServiceNow OAuth Bearer tokens. Include `Authorization: Bearer <token>` in all requests.
- **Dev mode** (`CHAT_AUTH_MODE=dev`): Bypasses all token validation. A static dev user is injected automatically.

## Health

### GET /api/health

Check the backend health status.

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

## Agents

### GET /api/agents

List all available ITOM agents with their current operational status.

**Response:**
```json
[
  {
    "id": "discovery",
    "name": "Discovery Agent",
    "description": "Network and infrastructure discovery",
    "status": "online",
    "domain": "discovery",
    "icon": "search"
  }
]
```

### GET /api/agents/{agent_id}

Get details for a specific agent.

**Parameters:**
- `agent_id` (path): Agent identifier (e.g., "discovery", "asset", "auditor")

## Chat

### POST /api/chat

Send a message to an ITOM agent via the orchestrator.

**Request Body:**
```json
{
  "content": "What servers are in the CMDB?",
  "conversation_id": "uuid-optional",
  "agent_target": "discovery"
}
```

**Response:**
```json
{
  "message_id": "uuid",
  "conversation_id": "uuid",
  "content": "Found 42 servers in the CMDB...",
  "agent_id": "discovery",
  "agent_name": "Discovery Agent",
  "response_time_ms": 1234,
  "timestamp": "2026-01-01T00:00:00Z",
  "metadata": {}
}
```

### POST /api/chat/stream

Stream an agent's response via Server-Sent Events.

**Request Body:**
```json
{
  "content": "Run a compliance audit",
  "conversation_id": "uuid",
  "agent_target": null
}
```

**SSE Events:**
- `stream_start`: `{message_id, agent_id, conversation_id, timestamp}`
- `token`: `{token, message_id}`
- `stream_end`: `{message_id, full_content, agent_id, conversation_id, timestamp}`
- `error`: `{code, message}`

## Conversations

### GET /api/conversations

List all conversations ordered by most recently updated.

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Discovery Audit",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T01:00:00Z",
    "metadata": {},
    "message_count": 5,
    "last_message_preview": "Found 42 servers..."
  }
]
```

### POST /api/conversations

Create a new conversation.

**Request Body:**
```json
{
  "title": "Optional title",
  "initial_message": "Optional first message",
  "agent_id": "optional-agent"
}
```

**Response:** `201 Created` with the full conversation object.

### GET /api/conversations/{conv_id}

Get a conversation with its full message history.

**Response:**
```json
{
  "id": "uuid",
  "title": "Discovery Audit",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T01:00:00Z",
  "metadata": {},
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "role": "user",
      "content": "What servers are in the CMDB?",
      "created_at": "2026-01-01T00:00:00Z",
      "agent_id": null,
      "metadata": {}
    }
  ]
}
```

### DELETE /api/conversations/{conv_id}

Delete a conversation and all its messages.

**Response:** `204 No Content`

### GET /api/conversations/{conv_id}/messages

Get all messages for a conversation, ordered chronologically.

### POST /api/conversations/{conv_id}/messages

Add a message to a conversation.

**Request Body:**
```json
{
  "role": "user",
  "content": "Message text",
  "agent_id": "optional-agent",
  "metadata": {}
}
```

**Response:** `201 Created` with the message object.

### GET /api/conversations/search?q={query}

Search conversations by title and message content.

**Parameters:**
- `q` (query, required): Search query string (1-200 characters)

### GET /api/conversations/{conv_id}/export?format={format}

Export a conversation in the specified format.

**Parameters:**
- `format` (query): Export format -- `json` (default), `text`, or `markdown`

**Response:**
```json
{
  "conversation_id": "uuid",
  "format": "json",
  "content_type": "application/json",
  "content": "..."
}
```

### PUT /api/conversations/{conv_id}/context

Update the context/metadata for a conversation.

**Request Body:**
```json
{
  "context": {
    "agent_preference": "auditor",
    "mode": "detailed"
  }
}
```

## WebSocket

### /ws/{client_id}

Real-time bidirectional communication channel.

**Message Format:**
```json
{
  "type": "chat|status|heartbeat|error",
  "payload": {},
  "correlation_id": "optional"
}
```

**Message Types:**
- `heartbeat`: Keep-alive ping/pong
- `chat`: Chat message broadcast
- `status`: Agent status update
- `error`: Error notification

## Error Responses

All error responses follow this format:

```json
{
  "detail": "Human-readable error message"
}
```

Common status codes:
- `401`: Authentication required or token invalid
- `404`: Resource not found
- `422`: Invalid request payload
- `502`: Orchestrator unavailable
