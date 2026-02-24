# ITOM Chat UI - Conversational Interface for ITOM Agents

## Overview
Full-stack web chat interface for interacting with ITOM agents. Next.js 15 frontend + FastAPI backend with SSE streaming, conversation persistence, agent selection, and artifact viewing.

## Core Principles (NON-NEGOTIABLE)
1. **ZERO MOCKS** — Every API call, data point, and integration must be real. No mock data, no hardcoded values, no stub implementations. If the orchestrator isn't available, STOP and report the blocker.
2. **FAIL-STOP** — If any component encounters an error, the pipeline halts. No silent failures. No workarounds. Fix the issue, then resume.
3. **DEV MODE** — Set `CHAT_AUTH_MODE=dev` for tests and local development to bypass SSO authentication.

## Architecture
```
Browser (React 19 + TypeScript + Tailwind 4)
  |
  +-- Next.js 15 Frontend
  |     +-- src/app/ (pages)
  |     +-- src/components/chat/ (chat UI components)
  |     +-- src/components/artifacts/ (artifact viewers)
  |     +-- src/components/status/ (agent status displays)
  |     +-- src/contexts/ (React contexts)
  |     +-- src/hooks/ (custom hooks)
  |
  +-- FastAPI Backend (REST + WebSocket + SSE)
        +-- app/main.py (FastAPI app)
        +-- app/config.py (Settings, env-based config)
        +-- app/auth.py (SSO / dev auth)
        +-- app/database.py (SQLite persistence)
        +-- app/artifact_detector.py (content detection)
        +-- app/routers/ (API route handlers)
        +-- app/services/
        |     +-- claude_service.py (Claude API + tool-use routing)
        |     +-- orchestrator.py (HTTP proxy to ITOM orchestrator)
        |     +-- conversation_service.py (conversation CRUD logic)
        |     +-- streaming.py (legacy SSE streaming fallback)
        |     +-- connection_manager.py (WebSocket management)
        |
        +-- SQLite (conversation persistence)
        +-- ITOM Orchestrator (agent routing)
```

## API Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Backend health check |
| `GET /api/agents` | List available agents |
| `GET /api/agents/{agent_id}` | Get single agent details |
| `POST /api/chat` | Send chat message (proxies to orchestrator) |
| `POST /api/chat/stream` | SSE streaming responses |
| `POST /api/chat/clarify` | Resolve clarification tokens |
| `GET /api/conversations` | List conversations |
| `POST /api/conversations` | Create conversation |
| `GET /api/conversations/search?q=` | Search by title/content |
| `GET /api/conversations/{id}` | Get conversation + messages |
| `DELETE /api/conversations/{id}` | Delete conversation |
| `GET /api/conversations/{id}/messages` | Get messages |
| `POST /api/conversations/{id}/messages` | Add message |
| `GET /api/conversations/{id}/export` | Export (json/text/markdown) |
| `PATCH /api/conversations/{id}/title` | Update conversation title |
| `PUT /api/conversations/{id}/context` | Update metadata |
| `GET /api/worklog` | User's open ServiceNow work items |
| `WS /ws/{client_id}` | WebSocket connection |

## Configuration
- **Env prefix:** `CHAT_*`
- **Key variables:** `CHAT_AUTH_MODE` (dev/sso), `CHAT_DATABASE_URL`, `CHAT_ORCHESTRATOR_URL`, `CHAT_CORS_ORIGINS`

## Testing
- **Backend:** `backend/.venv/bin/python -m pytest backend/tests/`
- **IMPORTANT:** Set `CHAT_AUTH_MODE=dev` in conftest BEFORE importing app to bypass SSO auth in tests

## Key Files
- `backend/app/main.py` — FastAPI application entry point
- `backend/app/config.py` — Settings singleton (CHAT_* env vars)
- `backend/app/services/claude_service.py` — Claude API + tool-use routing (primary)
- `backend/app/services/orchestrator.py` — HTTP proxy to ITOM orchestrator
- `backend/app/services/streaming.py` — Legacy SSE streaming (fallback)
- `backend/app/services/conversation_service.py` — Conversation business logic
- `backend/tests/conftest.py` — Test setup (MUST set env BEFORE import)
- `frontend/src/components/chat/` — Chat UI components
- `frontend/src/app/` — Next.js pages

## Git Workflow
- All agent work happens on feature branches
- PRs for human review before merging
- Never push directly to main

