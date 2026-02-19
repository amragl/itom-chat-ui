#!/usr/bin/env bash
# start-system.sh — Launch the full ITOMIA system
#
# Starts nine services:
#   1. CMDB MCP Server       (port 8002)
#   2. CSA Agent             (port 8003)
#   3. Discovery Agent       (port 8004)
#   4. Asset Agent           (port 8005)
#   5. ITOM Auditor          (port 8006)
#   6. ITOM Documentator     (port 8007)
#   7. ITOM Orchestrator     (port 8000)
#   8. Chat Backend          (port 8001)
#   9. Chat Frontend         (port 3000)
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
PROJECTS_DIR="$(cd "$CHAT_UI_DIR/.." && pwd)"

resolve_dir() {
  local path="$PROJECTS_DIR/$1"
  [ -d "$path" ] && echo "$path" || echo ""
}

CMDB_MCP_DIR="$(resolve_dir servicenow-cmdb-mcp)"
CSA_AGENT_DIR="$(resolve_dir snow-csa-agent)"
DISCOVERY_AGENT_DIR="$(resolve_dir snow-discovery-agent)"
ASSET_AGENT_DIR="$(resolve_dir snow-asset-agent)"
AUDITOR_DIR="$(resolve_dir snow-itom-auditor)"
DOCUMENTATOR_DIR="$(resolve_dir snow-itom-documentator)"
ORCHESTRATOR_DIR="$(resolve_dir itom-orchestrator)"

# ---------------------------------------------------------------------------
# Port configuration
# ---------------------------------------------------------------------------
CMDB_MCP_PORT=8002
CSA_PORT=8003
DISCOVERY_PORT=8004
ASSET_PORT=8005
AUDITOR_PORT=8006
DOCUMENTATOR_PORT=8007
ORCHESTRATOR_PORT=8000
BACKEND_PORT=8001
FRONTEND_PORT=3000

ALL_PORTS=($CMDB_MCP_PORT $CSA_PORT $DISCOVERY_PORT $ASSET_PORT $AUDITOR_PORT $DOCUMENTATOR_PORT $ORCHESTRATOR_PORT $BACKEND_PORT $FRONTEND_PORT)

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
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BLUE}[system]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $*"; }
err()  { echo -e "${RED}[error ]${NC} $*"; }
skip() { echo -e "${YELLOW}[ skip ]${NC} $*"; }

kill_port() {
  local port=$1
  local pid
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    warn "Killing existing process on port $port (PID $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 0.5
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
      warn "$name did not start on port $port within ${max_wait}s"
      return 1
    fi
  done
  ok "$name ready on port $port (${elapsed}s)"
}

health_check() {
  local url=$1
  local name=$2
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    ok "$name health OK ($url)"
  else
    warn "$name health returned HTTP $status ($url)"
  fi
}

start_fastmcp_agent() {
  local dir=$1
  local module=$2
  local port=$3
  local name=$4

  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    skip "$name directory not found, skipping"
    return
  fi

  log "Starting $name on port $port..."
  cd "$dir"
  local python_bin=".venv/bin/python"
  [ -f "$python_bin" ] || python_bin="python"

  VALIDATE_ON_STARTUP=false "$python_bin" -c "
from $module import mcp
mcp.run(transport='streamable-http', host='0.0.0.0', port=$port)
" &
  PIDS+=($!)
  cd "$CHAT_UI_DIR"
}

# ---------------------------------------------------------------------------
# Cleanup trap
# ---------------------------------------------------------------------------
cleanup() {
  echo ""
  log "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for port in "${ALL_PORTS[@]}"; do
    kill_port "$port"
  done
  ok "All services stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║         ITOMIA System Startup          ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════╝${NC}"
echo ""

# ---------------------------------------------------------------------------
# Pre-flight: clear ports
# ---------------------------------------------------------------------------
log "Clearing ports..."
for port in "${ALL_PORTS[@]}"; do
  kill_port "$port"
done

# ---------------------------------------------------------------------------
# 1. CMDB MCP Server (port 8002)
# ---------------------------------------------------------------------------
if [ -n "$CMDB_MCP_DIR" ]; then
  log "Starting CMDB MCP Server on port $CMDB_MCP_PORT..."
  cd "$CMDB_MCP_DIR"
  local_python=".venv/bin/python"
  [ -f "$local_python" ] || local_python="python"
  VALIDATE_ON_STARTUP=false "$local_python" -c "
from src.server import mcp
from src.health import record_start_time
record_start_time()
mcp.run(transport='streamable-http', host='0.0.0.0', port=$CMDB_MCP_PORT)
" &
  PIDS+=($!)
  cd "$CHAT_UI_DIR"
else
  skip "servicenow-cmdb-mcp not found, skipping"
fi

# ---------------------------------------------------------------------------
# 2-6. Specialized MCP agents (ports 8003-8007)
# ---------------------------------------------------------------------------
start_fastmcp_agent "$CSA_AGENT_DIR"     "snow_csa_agent.server"         $CSA_PORT       "CSA Agent"
start_fastmcp_agent "$DISCOVERY_AGENT_DIR" "snow_discovery_agent.server"  $DISCOVERY_PORT "Discovery Agent"
start_fastmcp_agent "$ASSET_AGENT_DIR"   "snow_asset_agent.server"       $ASSET_PORT     "Asset Agent"
start_fastmcp_agent "$AUDITOR_DIR"       "snow_itom_auditor.server"      $AUDITOR_PORT   "ITOM Auditor"
start_fastmcp_agent "$DOCUMENTATOR_DIR"  "snow_itom_documentator.server" $DOCUMENTATOR_PORT "ITOM Documentator"

# ---------------------------------------------------------------------------
# 7. Orchestrator (port 8000) — after agents so URLs can be passed in
# ---------------------------------------------------------------------------
if [ -n "$ORCHESTRATOR_DIR" ]; then
  log "Starting ITOM Orchestrator on port $ORCHESTRATOR_PORT..."
  cd "$ORCHESTRATOR_DIR"
  export ORCH_CMDB_AGENT_URL="http://localhost:$CMDB_MCP_PORT/mcp"
  export ORCH_CSA_AGENT_URL="http://localhost:$CSA_PORT/mcp"
  export ORCH_DISCOVERY_AGENT_URL="http://localhost:$DISCOVERY_PORT/mcp"
  export ORCH_ASSET_AGENT_URL="http://localhost:$ASSET_PORT/mcp"
  export ORCH_AUDITOR_AGENT_URL="http://localhost:$AUDITOR_PORT/mcp"
  export ORCH_DOCUMENTATOR_AGENT_URL="http://localhost:$DOCUMENTATOR_PORT/mcp"

  local_python=".venv/bin/python"
  [ -f "$local_python" ] || local_python="python"
  "$local_python" -m itom_orchestrator.run_server --http --host 0.0.0.0 --port "$ORCHESTRATOR_PORT" &
  PIDS+=($!)
  cd "$CHAT_UI_DIR"
else
  skip "itom-orchestrator not found, skipping"
fi

# ---------------------------------------------------------------------------
# 8. Chat Backend (port 8001)
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
# 9. Chat Frontend (port 3000)
# ---------------------------------------------------------------------------
log "Starting Chat Frontend on port $FRONTEND_PORT..."
cd "$CHAT_UI_DIR/frontend"
npm run dev &
PIDS+=($!)
cd "$CHAT_UI_DIR"

# ---------------------------------------------------------------------------
# Wait and health checks
# ---------------------------------------------------------------------------
echo ""
log "Waiting for services to initialise..."
sleep 4

[ -n "$CMDB_MCP_DIR" ]      && wait_for_port $CMDB_MCP_PORT   "CMDB MCP Server"  20 || true
[ -n "$CSA_AGENT_DIR" ]      && wait_for_port $CSA_PORT         "CSA Agent"        20 || true
[ -n "$DISCOVERY_AGENT_DIR" ] && wait_for_port $DISCOVERY_PORT  "Discovery Agent"  20 || true
[ -n "$ASSET_AGENT_DIR" ]    && wait_for_port $ASSET_PORT       "Asset Agent"      20 || true
[ -n "$AUDITOR_DIR" ]        && wait_for_port $AUDITOR_PORT     "ITOM Auditor"     20 || true
[ -n "$DOCUMENTATOR_DIR" ]   && wait_for_port $DOCUMENTATOR_PORT "ITOM Documentator" 20 || true
[ -n "$ORCHESTRATOR_DIR" ]   && wait_for_port $ORCHESTRATOR_PORT "Orchestrator"    30 || true
[ -n "$ORCHESTRATOR_DIR" ]   && health_check "http://localhost:$ORCHESTRATOR_PORT/api/health" "Orchestrator" || true
wait_for_port $BACKEND_PORT "Chat Backend" 30 || true
health_check "http://localhost:$BACKEND_PORT/api/health" "Chat Backend" || true
wait_for_port $FRONTEND_PORT "Chat Frontend" 30 || true

# ---------------------------------------------------------------------------
# Status table
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║                    ITOMIA System Ready                    ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
printf "  ${BOLD}%-22s %-6s %-35s${NC}\n" "SERVICE" "PORT" "URL"
printf "  %-22s %-6s %-35s\n"             "─────────────────────" "──────" "──────────────────────────────────"

print_row() {
  local name=$1 port=$2 url=$3 available=$4
  if [ "$available" = "1" ]; then
    printf "  ${GREEN}%-22s${NC} %-6s ${CYAN}%-35s${NC}\n" "$name" "$port" "$url"
  else
    printf "  ${YELLOW}%-22s${NC} %-6s ${YELLOW}%-35s${NC}\n" "$name" "$port" "(not started)"
  fi
}

print_row "CMDB MCP Server"     $CMDB_MCP_PORT   "http://localhost:$CMDB_MCP_PORT"    "$([ -n "$CMDB_MCP_DIR" ] && echo 1 || echo 0)"
print_row "CSA Agent"           $CSA_PORT         "http://localhost:$CSA_PORT"          "$([ -n "$CSA_AGENT_DIR" ] && echo 1 || echo 0)"
print_row "Discovery Agent"     $DISCOVERY_PORT   "http://localhost:$DISCOVERY_PORT"    "$([ -n "$DISCOVERY_AGENT_DIR" ] && echo 1 || echo 0)"
print_row "Asset Agent"         $ASSET_PORT       "http://localhost:$ASSET_PORT"        "$([ -n "$ASSET_AGENT_DIR" ] && echo 1 || echo 0)"
print_row "ITOM Auditor"        $AUDITOR_PORT     "http://localhost:$AUDITOR_PORT"      "$([ -n "$AUDITOR_DIR" ] && echo 1 || echo 0)"
print_row "ITOM Documentator"   $DOCUMENTATOR_PORT "http://localhost:$DOCUMENTATOR_PORT" "$([ -n "$DOCUMENTATOR_DIR" ] && echo 1 || echo 0)"
print_row "Orchestrator"        $ORCHESTRATOR_PORT "http://localhost:$ORCHESTRATOR_PORT" "$([ -n "$ORCHESTRATOR_DIR" ] && echo 1 || echo 0)"
print_row "Chat Backend"        $BACKEND_PORT     "http://localhost:$BACKEND_PORT"     "1"
print_row "Chat Frontend"       $FRONTEND_PORT    "http://localhost:$FRONTEND_PORT"    "1"

echo ""
printf "  PIDs: %s\n" "${PIDS[*]}"
echo ""
echo -e "  ${GREEN}${BOLD}Press Ctrl+C to stop all services${NC}"
echo ""

# ---------------------------------------------------------------------------
# Wait for all background processes
# ---------------------------------------------------------------------------
wait
