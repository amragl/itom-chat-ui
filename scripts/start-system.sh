#!/usr/bin/env bash
# start-system.sh — Launch the full ITOM Chat system
#
# Starts four services:
#   1. CMDB MCP Server   (port 8002)
#   2. ITOM Orchestrator  (port 8000)
#   3. Chat Backend       (port 8001)
#   4. Chat Frontend      (port 3000)
#
# Usage:
#   bash scripts/start-system.sh
#   npm run start:system

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAT_UI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ORCHESTRATOR_DIR="$(cd "$CHAT_UI_DIR/../itom-orchestrator" && pwd 2>/dev/null || true)"
CMDB_MCP_DIR="$(cd "$CHAT_UI_DIR/../servicenow-cmdb-mcp" && pwd 2>/dev/null || true)"

# ---------------------------------------------------------------------------
# Port configuration
# ---------------------------------------------------------------------------
CMDB_MCP_PORT=8002
ORCHESTRATOR_PORT=8000
BACKEND_PORT=8001
FRONTEND_PORT=3000

# PID tracking
PIDS=()

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()   { echo -e "${BLUE}[system]${NC} $*"; }
ok()    { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ warn ]${NC} $*"; }
err()   { echo -e "${RED}[error ]${NC} $*"; }

kill_port() {
  local port=$1
  local pid
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    warn "Killing existing process on port $port (PID $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
}

wait_for_port() {
  local port=$1
  local name=$2
  local max_wait=${3:-30}
  local elapsed=0

  while ! curl -s "http://localhost:$port" >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$max_wait" ]; then
      err "$name did not start on port $port within ${max_wait}s"
      return 1
    fi
  done
  ok "$name is ready on port $port (${elapsed}s)"
}

health_check() {
  local url=$1
  local name=$2
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    ok "$name health check passed ($url)"
  else
    warn "$name health check returned HTTP $status ($url)"
  fi
}

# ---------------------------------------------------------------------------
# Cleanup trap — kill all child processes on exit
# ---------------------------------------------------------------------------
cleanup() {
  echo ""
  log "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  # Also clean up any remaining processes on our ports
  kill_port "$CMDB_MCP_PORT"
  kill_port "$ORCHESTRATOR_PORT"
  kill_port "$BACKEND_PORT"
  kill_port "$FRONTEND_PORT"
  ok "All services stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

# ---------------------------------------------------------------------------
# Pre-flight: kill any existing processes on our ports
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  ITOM Chat System Startup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

log "Clearing ports $CMDB_MCP_PORT, $ORCHESTRATOR_PORT, $BACKEND_PORT, $FRONTEND_PORT..."
kill_port "$CMDB_MCP_PORT"
kill_port "$FRONTEND_PORT"
kill_port "$ORCHESTRATOR_PORT"
kill_port "$BACKEND_PORT"

# ---------------------------------------------------------------------------
# 1. Start CMDB MCP Server (port 8002)
# ---------------------------------------------------------------------------
if [ -z "$CMDB_MCP_DIR" ] || [ ! -d "$CMDB_MCP_DIR" ]; then
  warn "CMDB MCP directory not found at ../servicenow-cmdb-mcp"
  warn "Skipping CMDB MCP server — CMDB commands will return stub responses"
else
  log "Starting CMDB MCP Server on port $CMDB_MCP_PORT..."
  cd "$CMDB_MCP_DIR"
  if [ -f ".venv/bin/python" ]; then
    VALIDATE_ON_STARTUP=false .venv/bin/python -c "
from src.server import mcp
from src.health import record_start_time
record_start_time()
mcp.run(transport='streamable-http', host='0.0.0.0', port=$CMDB_MCP_PORT)
" &
  else
    VALIDATE_ON_STARTUP=false python -c "
from src.server import mcp
from src.health import record_start_time
record_start_time()
mcp.run(transport='streamable-http', host='0.0.0.0', port=$CMDB_MCP_PORT)
" &
  fi
  PIDS+=($!)
  cd "$CHAT_UI_DIR"
fi

# ---------------------------------------------------------------------------
# 2. Start Orchestrator (port 8000)
# ---------------------------------------------------------------------------
if [ -z "$ORCHESTRATOR_DIR" ] || [ ! -d "$ORCHESTRATOR_DIR" ]; then
  warn "Orchestrator directory not found at ../itom-orchestrator"
  warn "Skipping orchestrator — start it manually if needed"
else
  log "Starting ITOM Orchestrator on port $ORCHESTRATOR_PORT..."
  cd "$ORCHESTRATOR_DIR"

  # Tell the orchestrator where to find the CMDB MCP server
  ORCH_CMDB_AGENT_URL="http://localhost:$CMDB_MCP_PORT/mcp"
  export ORCH_CMDB_AGENT_URL

  if [ -f ".venv/bin/python" ]; then
    .venv/bin/python -m itom_orchestrator.run_server --http --host 0.0.0.0 --port "$ORCHESTRATOR_PORT" &
  else
    python -m itom_orchestrator.run_server --http --host 0.0.0.0 --port "$ORCHESTRATOR_PORT" &
  fi
  PIDS+=($!)
  cd "$CHAT_UI_DIR"
fi

# ---------------------------------------------------------------------------
# 3. Start Chat Backend (port 8001)
# ---------------------------------------------------------------------------
log "Starting Chat Backend on port $BACKEND_PORT..."
cd "$CHAT_UI_DIR/backend"
if [ -f ".venv/bin/uvicorn" ]; then
  .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" &
else
  uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" &
fi
PIDS+=($!)
cd "$CHAT_UI_DIR"

# ---------------------------------------------------------------------------
# 4. Start Chat Frontend (port 3000)
# ---------------------------------------------------------------------------
log "Starting Chat Frontend on port $FRONTEND_PORT..."
cd "$CHAT_UI_DIR/frontend"
npm run dev &
PIDS+=($!)
cd "$CHAT_UI_DIR"

# ---------------------------------------------------------------------------
# 5. Wait for services and run health checks
# ---------------------------------------------------------------------------
echo ""
log "Waiting for services to start..."
sleep 3

if [ -n "$CMDB_MCP_DIR" ] && [ -d "$CMDB_MCP_DIR" ]; then
  wait_for_port "$CMDB_MCP_PORT" "CMDB MCP Server" 30 || true
fi

if [ -n "$ORCHESTRATOR_DIR" ] && [ -d "$ORCHESTRATOR_DIR" ]; then
  wait_for_port "$ORCHESTRATOR_PORT" "Orchestrator" 30 || true
  health_check "http://localhost:$ORCHESTRATOR_PORT/api/health" "Orchestrator"
fi

wait_for_port "$BACKEND_PORT" "Chat Backend" 30 || true
health_check "http://localhost:$BACKEND_PORT/api/health" "Chat Backend"

wait_for_port "$FRONTEND_PORT" "Chat Frontend" 30 || true

# ---------------------------------------------------------------------------
# 6. Print status table
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  System Status${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
printf "  %-20s %-8s %-30s\n" "SERVICE" "PORT" "URL"
printf "  %-20s %-8s %-30s\n" "-------------------" "------" "----------------------------"

if [ -n "$CMDB_MCP_DIR" ] && [ -d "$CMDB_MCP_DIR" ]; then
  printf "  %-20s %-8s %-30s\n" "CMDB MCP Server" "$CMDB_MCP_PORT" "http://localhost:$CMDB_MCP_PORT"
fi
if [ -n "$ORCHESTRATOR_DIR" ] && [ -d "$ORCHESTRATOR_DIR" ]; then
  printf "  %-20s %-8s %-30s\n" "Orchestrator" "$ORCHESTRATOR_PORT" "http://localhost:$ORCHESTRATOR_PORT"
fi
printf "  %-20s %-8s %-30s\n" "Chat Backend" "$BACKEND_PORT" "http://localhost:$BACKEND_PORT"
printf "  %-20s %-8s %-30s\n" "Chat Frontend" "$FRONTEND_PORT" "http://localhost:$FRONTEND_PORT"
echo ""
printf "  PIDs: %s\n" "${PIDS[*]}"
echo ""
echo -e "  ${GREEN}Press Ctrl+C to stop all services${NC}"
echo ""

# ---------------------------------------------------------------------------
# 7. Wait for all background processes
# ---------------------------------------------------------------------------
wait
