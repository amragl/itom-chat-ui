Start ITOM services. Accepts an optional flag to select what to start.

## Arguments: $ARGUMENTS

## Modes

Parse `$ARGUMENTS` to determine the mode:

### `--itomator` (full system)

Run the startup script that launches all three services:

```bash
bash "/Users/amragl/Python Projects/itom-chat-ui/scripts/start-system.sh"
```

This starts:
- ITOM Orchestrator on port 8000
- Chat Backend on port 8001
- Chat Frontend on port 3000

The script runs in the foreground and handles cleanup on Ctrl+C.

### No arguments (default — chat UI only)

Start just the chat backend + frontend (no orchestrator):

```bash
cd "/Users/amragl/Python Projects/itom-chat-ui" && npm run dev
```

This starts:
- Chat Backend on port 8001
- Chat Frontend on port 3000

## After starting

Verify health:

1. If orchestrator was started: `curl -s http://localhost:8000/api/health`
2. Chat Backend: `curl -s http://localhost:8001/api/health`
3. Chat Frontend: http://localhost:3000

Report the status of each service. If any service failed to start, investigate the logs and report the issue.
