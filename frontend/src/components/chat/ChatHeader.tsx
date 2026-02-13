'use client';

import { useChatActions, useChatState } from '@/contexts';
import AgentSelector from './AgentSelector';
import type { ConnectionStatus } from '@/hooks/useWebSocket';

// ---------------------------------------------------------------------------
// Connection status indicator
// ---------------------------------------------------------------------------

/** Maps connection status to a visual indicator. */
function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  let colorClass: string;
  let label: string;

  switch (status) {
    case 'connected':
      colorClass = 'bg-success-500';
      label = 'Connected';
      break;
    case 'connecting':
      colorClass = 'bg-warning-500 animate-pulse';
      label = 'Connecting...';
      break;
    case 'reconnecting':
      colorClass = 'bg-warning-500 animate-pulse';
      label = 'Reconnecting...';
      break;
    case 'disconnected':
    default:
      colorClass = 'bg-neutral-400';
      label = 'Disconnected';
      break;
  }

  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className={`h-2 w-2 rounded-full ${colorClass}`} aria-hidden="true" />
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatHeader component
// ---------------------------------------------------------------------------

/**
 * Header bar for the chat page.
 *
 * Contains the agent selector dropdown, a "New Chat" button, and the
 * WebSocket connection status indicator.
 */
export default function ChatHeader() {
  const { selectedAgentId, connectionStatus } = useChatState();
  const { selectAgent, startNewConversation } = useChatActions();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-surface px-4 dark:border-neutral-700">
      <div className="flex items-center gap-3">
        <AgentSelector
          selectedAgentId={selectedAgentId}
          onSelectAgent={selectAgent}
        />
      </div>

      <div className="flex items-center gap-4">
        <ConnectionIndicator status={connectionStatus} />

        <button
          type="button"
          onClick={startNewConversation}
          aria-label="Start new conversation"
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-surface px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          New Chat
        </button>
      </div>
    </header>
  );
}
