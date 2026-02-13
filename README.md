# ITOM Chat UI

Conversational interface for human interaction with ITOM agents -- chat history, artifact viewer, conversation memory, agent selection, status monitoring.

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend:** FastAPI, Python 3.11+, WebSocket
- **Communication:** REST API, WebSocket, MCP Protocol

## Project Structure

```
itom-chat-ui/
├── frontend/            # Next.js application
│   ├── src/
│   │   ├── app/         # App router pages
│   │   ├── components/  # Reusable React components
│   │   ├── lib/         # Utility functions, API client
│   │   ├── types/       # TypeScript type definitions
│   │   └── hooks/       # Custom React hooks
│   ├── public/          # Static assets
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.ts
├── backend/             # FastAPI application (coming soon)
├── .agent-forge/        # Agent Forge configuration
└── CLAUDE.md
```

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- Python 3.11+ (for backend, coming soon)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The development server starts at [http://localhost:3000](http://localhost:3000).

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Part of: ServiceNow Suite

This project is part of the **servicenow-suite** program -- a full ITOM ServiceNow automation stack.

A project managed by [Agent Forge](https://github.com/amragl/agent-forge).
