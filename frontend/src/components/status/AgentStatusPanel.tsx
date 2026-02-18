'use client';

import type { Agent, AgentStatus } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentStatusPanelProps {
  /** List of agents with their current status. */
  agents: Agent[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays the connection status for all registered ITOM agents.
 *
 * Each agent is shown as a card with a color-coded status indicator:
 * - Green: online
 * - Yellow: busy / degraded
 * - Red: offline
 */
export default function AgentStatusPanel({ agents }: AgentStatusPanelProps) {
  if (!agents || agents.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 p-4 text-center dark:border-neutral-700">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No agents registered.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Agent status">
      {agents.map((agent) => (
        <div
          key={agent.id}
          role="listitem"
          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-surface px-4 py-3 dark:border-neutral-700"
        >
          <div className="flex items-center gap-3">
            <StatusIndicator status={agent.status} />
            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {agent.name}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {agent.description}
              </p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeColor(agent.status)}`}>
            {agent.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusIndicator({ status }: { status: AgentStatus }) {
  let colorClass = 'bg-neutral-400';

  switch (status) {
    case 'online':
      colorClass = 'bg-success-500';
      break;
    case 'busy':
      colorClass = 'bg-warning-500 animate-pulse';
      break;
    case 'offline':
      colorClass = 'bg-error-500';
      break;
  }

  return (
    <span
      className={`h-3 w-3 shrink-0 rounded-full ${colorClass}`}
      aria-label={`Status: ${status}`}
      role="status"
    />
  );
}

function getStatusBadgeColor(status: AgentStatus): string {
  switch (status) {
    case 'online':
      return 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400';
    case 'busy':
      return 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';
    case 'offline':
      return 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';
    default:
      return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
  }
}
