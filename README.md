# ITOM Chat UI

Conversational interface for human interaction with ITOM agents -- chat history, artifact viewer, conversation memory, agent selection, status monitoring.

## Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4
- **Backend:** FastAPI, Python 3.11+, SQLite, WebSocket
- **Communication:** REST API, WebSocket, Server-Sent Events

## Architecture

```
                    +-----------+
                    |  Browser  |
                    +-----+-----+
                          |
              +-----------+-----------+
              |                       |
        HTTP REST/SSE           WebSocket
              |                       |
        +-----v-----------------------v-----+
        |          FastAPI Backend           |
        |                                   |
        |  /api/conversations  (CRUD)       |
        |  /api/chat           (proxy)      |
        |  /api/chat/stream    (SSE)        |
        |  /api/agents         (status)     |
        |  /api/health         (health)     |
        |  /ws/{client_id}     (real-time)  |
        |                                   |
        |  SQLite: conversations + messages  |
        +-----+-----------------------------+
              |
              | HTTP
              v
        +-----+-------+
        |  ITOM        |
        |  Orchestrator|
        +--------------+
```

## Project Structure

```
itom-chat-ui/
├── frontend/                    # Next.js application
│   ├── src/
│   │   ├── app/                 # App router pages
│   │   │   ├── chat/            # Chat page
│   │   │   ├── dashboard/       # Dashboard page
│   │   │   └── login/           # Login page
│   │   ├── components/
│   │   │   ├── artifacts/       # Artifact viewers (report, dashboard, document)
│   │   │   ├── auth/            # Auth components (UserMenu, DevModeBanner)
│   │   │   ├── chat/            # Chat components (MessageList, MessageInput, Sidebar)
│   │   │   ├── layout/          # Layout components (AppLayout, Sidebar, MobileNav)
│   │   │   ├── status/          # Status components (AgentStatus, Workflow, Health)
│   │   │   └── ui/              # Shared UI (LoadingSpinner, EmptyState, ThemeToggle)
│   │   ├── contexts/            # React contexts (ChatContext, ThemeContext)
│   │   ├── hooks/               # Custom hooks (WebSocket, Streaming, Shortcuts)
│   │   ├── lib/                 # API client, auth, commands
│   │   └── types/               # TypeScript type definitions
│   └── package.json
├── backend/                     # FastAPI application
│   ├── app/
│   │   ├── config.py            # Settings (env-based configuration)
│   │   ├── main.py              # App entry point + router setup
│   │   ├── auth.py              # ServiceNow SSO / dev auth
│   │   ├── database.py          # SQLite persistence layer
│   │   ├── artifact_detector.py # Structured content detection
│   │   ├── routers/
│   │   │   ├── chat.py          # POST /api/chat
│   │   │   ├── chat_stream.py   # POST /api/chat/stream (SSE)
│   │   │   ├── conversations.py # CRUD for conversations + messages
│   │   │   ├── agents.py        # GET /api/agents
│   │   │   ├── health.py        # GET /api/health
│   │   │   └── websocket.py     # WebSocket /ws/{client_id}
│   │   ├── services/
│   │   │   ├── orchestrator.py         # HTTP proxy to itom-orchestrator
│   │   │   ├── conversation_service.py # Business logic layer
│   │   │   ├── connection_manager.py   # WebSocket management
│   │   │   └── streaming.py           # SSE streaming logic
│   │   └── models/              # Pydantic request/response models
│   ├── tests/
│   │   ├── conftest.py          # Test fixtures
│   │   ├── test_health.py       # Health endpoint tests
│   │   ├── test_websocket.py    # WebSocket tests
│   │   ├── test_database.py     # SQLite database tests
│   │   ├── test_conversations.py # Conversation API tests
│   │   └── test_artifact_detector.py # Artifact detection tests
│   └── pyproject.toml
├── docs/
│   └── api.md                   # API documentation
├── .agent-forge/                # Agent Forge configuration
└── CLAUDE.md
```

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- Python 3.11+

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"

# Start in dev mode (no ServiceNow auth required)
CHAT_AUTH_MODE=dev uvicorn app.main:app --port 8001 --reload
```

The API server starts at [http://localhost:8001](http://localhost:8001).

- OpenAPI docs: [http://localhost:8001/docs](http://localhost:8001/docs)
- ReDoc: [http://localhost:8001/redoc](http://localhost:8001/redoc)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The development server starts at [http://localhost:3000](http://localhost:3000).

### Running Tests

```bash
# Backend tests (85 tests)
cd backend
CHAT_AUTH_MODE=dev .venv/bin/python -m pytest tests/ -v

# Frontend type check
cd frontend
npx tsc --noEmit
```

### Available Scripts

| Command | Description |
|---------|-------------|
| **Frontend** | |
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| **Backend** | |
| `uvicorn app.main:app --reload` | Start API server with hot reload |
| `pytest tests/ -v` | Run test suite |
| `ruff check app/` | Run linter |

## Configuration

All backend settings are configured via environment variables with the `CHAT_` prefix:

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAT_AUTH_MODE` | `sso` | Authentication mode: `sso` (ServiceNow) or `dev` (bypass) |
| `CHAT_DATABASE_URL` | `sqlite:///./chat.db` | SQLite database URL |
| `CHAT_ORCHESTRATOR_URL` | `http://localhost:8000` | ITOM orchestrator URL |
| `CHAT_CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |
| `CHAT_HTTP_PORT` | `8001` | API server port |
| `CHAT_DEBUG` | `false` | Enable debug mode |

## API Endpoints

See [docs/api.md](docs/api.md) for detailed API documentation.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/agents` | GET | List ITOM agents |
| `/api/agents/{id}` | GET | Get agent details |
| `/api/chat` | POST | Send message to agent |
| `/api/chat/stream` | POST | Stream agent response (SSE) |
| `/api/conversations` | GET | List conversations |
| `/api/conversations` | POST | Create conversation |
| `/api/conversations/{id}` | GET | Get conversation with messages |
| `/api/conversations/{id}` | DELETE | Delete conversation |
| `/api/conversations/{id}/messages` | GET | Get messages |
| `/api/conversations/{id}/messages` | POST | Add message |
| `/api/conversations/{id}/export` | GET | Export conversation |
| `/api/conversations/{id}/context` | PUT | Update context |
| `/api/conversations/search` | GET | Search conversations |
| `/ws/{client_id}` | WebSocket | Real-time communication |

## Part of: ServiceNow Suite

This project is part of the **servicenow-suite** program -- a full ITOM ServiceNow automation stack.

A project managed by [Agent Forge](https://github.com/amragl/agent-forge).
