# Project Brief: itom-chat-ui

## Overview
A conversational web interface for human interaction with ITOM agents, combining a Next.js frontend with a FastAPI backend. It provides a chat interface with agent selection, streaming responses, artifact viewing (audit reports, dashboards, documents), persistent conversation management, a real-time status dashboard, and ServiceNow OAuth SSO authentication -- serving as the primary human-facing portal for the ITOM automation suite.

## Objectives
1. Provide a polished chat interface for sending messages to ITOM agents and viewing streaming responses
2. Support agent selection (Discovery, Asset, Auditor, Documentator, auto-route via Orchestrator)
3. Render agent-produced artifacts inline (audit reports, health dashboards, compliance documents)
4. Manage persistent conversations with search, export, and context memory
5. Display a real-time status dashboard showing agent health, workflow progress, and system metrics

## Target Users
- ITOM operators interacting with agents through natural language
- IT managers monitoring agent status and workflow progress
- Compliance teams reviewing audit artifacts and reports
- On-call engineers needing quick access to agent capabilities

## Tech Stack
- **Languages:** Python 3.11+, TypeScript
- **Frameworks:** FastAPI, React, Next.js 14+, TailwindCSS
- **Databases:** SQLite (via aiosqlite) for conversations and messages
- **APIs/Services:** WebSocket, MCP Protocol, ServiceNow OAuth 2.0 SSO
- **Infrastructure:** Claude Code CLI

## Requirements

### Must Have (P0)
1. Next.js frontend with app router and TailwindCSS design system
2. FastAPI backend with health check, chat proxy, and agent endpoints
3. WebSocket infrastructure for real-time communication
4. Chat message input with auto-resize, send button, and keyboard shortcuts
5. Agent selector component with status indicators
6. ServiceNow OAuth SSO authentication (Auth.js/NextAuth v5)

### Should Have (P1)
1. Streaming response display with typing indicator
2. Message display with chat bubbles, agent avatars, and markdown rendering
3. Conversation persistence with SQLite backend
4. Conversation list sidebar with search and export
5. Inline artifact viewers (reports, dashboards, documents)

### Nice to Have (P2)
1. Real-time status dashboard with agent health and workflow tracking
2. Responsive design for mobile and tablet
3. Theme system with light/dark modes
4. Keyboard shortcuts system
5. Playwright E2E tests

## Constraints
- Depends on itom-orchestrator for agent routing and task dispatch
- ServiceNow OAuth requires application registration on the ServiceNow instance
- Frontend and backend must run as separate processes (concurrent dev servers)
- WebSocket connections require proper reconnection handling

## Existing Codebase
- **Starting from scratch:** No -- Phase 1 and 1b complete
- **Existing repo:** https://github.com/amragl/itom-chat-ui.git
- **Current state:** Active development. 15/43 tickets complete (35%). Phase 1 (Foundation) and Phase 1b (Authentication) complete. Phase 2 partially done.
- **Technical debt:** None identified yet

## Dependencies
- itom-orchestrator (execution order #6 -- routes tasks to agents)
- ServiceNow instance for OAuth SSO authentication
- Node.js 18+ and Python 3.11+ runtimes
- pnpm for frontend package management

## Success Criteria
1. Users can send messages and receive agent responses through the chat interface
2. Agent selection correctly routes messages through the orchestrator
3. Artifacts render inline with export and download options
4. Conversations persist across sessions with search and management
5. Real-time dashboard shows accurate agent status and workflow progress

## Notes
- Execution order #7 in the ServiceNow Suite -- depends on itom-orchestrator
- Phase 1 (8 tickets): Next.js setup, FastAPI backend, layout, WebSocket, tooling, types
- Phase 1b (4 tickets): ServiceNow OAuth SSO with Auth.js
- Phase 2 in progress (3/6 done): MessageInput, AgentSelector, FastAPI chat endpoint
- Uses CHAT-xxx ticket prefix in the backlog
- 43 tickets across 8 phases (including phase-1b)
