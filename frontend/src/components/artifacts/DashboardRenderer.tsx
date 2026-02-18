'use client';

/**
 * Renders DASHBOARD artifacts with metric cards and status indicators.
 *
 * Accepts either a JSON object with structured dashboard data or a plain
 * text string for raw rendering.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardData {
  title?: string;
  metrics?: Record<string, number | string>;
  status?: string;
  agents?: AgentStatusEntry[];
  [key: string]: unknown;
}

interface AgentStatusEntry {
  id?: string;
  name?: string;
  status?: string;
  response_time_ms?: number;
}

interface DashboardRendererProps {
  content: string | DashboardData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardRenderer({ content }: DashboardRendererProps) {
  if (typeof content === 'string') {
    return (
      <div className="prose prose-sm max-w-none whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
        {content}
      </div>
    );
  }

  const dashboard = content as DashboardData;

  return (
    <div className="space-y-3" role="region" aria-label="Dashboard">
      {/* Overall status */}
      {dashboard.status && (
        <div className="flex items-center gap-2">
          <StatusDot status={dashboard.status} />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            System: {dashboard.status}
          </span>
        </div>
      )}

      {/* Metric cards */}
      {dashboard.metrics && Object.keys(dashboard.metrics).length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(dashboard.metrics).map(([key, value]) => (
            <MetricCard key={key} label={key} value={value} />
          ))}
        </div>
      )}

      {/* Agent status list */}
      {dashboard.agents && dashboard.agents.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Agent Status
          </h4>
          {dashboard.agents.map((agent, i) => (
            <div
              key={agent.id || i}
              className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5 dark:bg-neutral-800/50"
            >
              <div className="flex items-center gap-2">
                <StatusDot status={agent.status || 'offline'} />
                <span className="text-xs text-neutral-700 dark:text-neutral-300">
                  {agent.name || agent.id || 'Unknown'}
                </span>
              </div>
              {agent.response_time_ms !== undefined && (
                <span className="text-xs text-neutral-400">{agent.response_time_ms}ms</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback for unknown structure */}
      {!dashboard.metrics && !dashboard.agents && (
        <pre className="overflow-x-auto text-xs text-neutral-600 dark:text-neutral-400">
          {JSON.stringify(dashboard, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({ label, value }: { label: string; value: number | string }) {
  const displayLabel = label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  const isPercent = typeof value === 'string' && value.includes('%');

  let valueColor = 'text-neutral-800 dark:text-neutral-200';
  if (!isNaN(numValue)) {
    if (numValue >= 90 || (isPercent && numValue >= 90)) valueColor = 'text-success-600';
    else if (numValue >= 70) valueColor = 'text-warning-600';
    else if (numValue < 50) valueColor = 'text-error-600';
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-3 dark:border-neutral-700">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{displayLabel}</p>
      <p className={`mt-0.5 text-lg font-bold ${valueColor}`}>
        {typeof value === 'number' ? (value % 1 === 0 ? value : value.toFixed(1)) : value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  const lower = status.toLowerCase();
  let colorClass = 'bg-neutral-400';

  if (lower === 'online' || lower === 'healthy' || lower === 'ok') {
    colorClass = 'bg-success-500';
  } else if (lower === 'degraded' || lower === 'warning' || lower === 'busy') {
    colorClass = 'bg-warning-500';
  } else if (lower === 'offline' || lower === 'error' || lower === 'critical') {
    colorClass = 'bg-error-500';
  }

  return <span className={`h-2 w-2 shrink-0 rounded-full ${colorClass}`} aria-hidden="true" />;
}
