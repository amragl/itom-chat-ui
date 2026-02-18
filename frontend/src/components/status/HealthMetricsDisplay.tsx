'use client';

import type { HealthStatus } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HealthMetricsDisplayProps {
  /** Current health metrics snapshot. */
  metrics: HealthStatus;
  /** Optional historical snapshots for trend display. */
  history?: HealthStatus[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays health metrics with the current status and optional historical
 * trend information.
 *
 * Shows:
 * - Overall system status with color coding
 * - Backend version
 * - Uptime (if available)
 * - Timestamp of last check
 * - History trend (if provided)
 */
export default function HealthMetricsDisplay({ metrics, history }: HealthMetricsDisplayProps) {
  return (
    <div
      className="rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-700"
      role="region"
      aria-label="Health metrics"
    >
      {/* Header with status */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          System Health
        </h3>
        <StatusBadge status={metrics.status} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricItem label="Status" value={metrics.status} />
        <MetricItem label="Version" value={metrics.version} />
        {metrics.uptime_seconds !== undefined && (
          <MetricItem label="Uptime" value={formatUptime(metrics.uptime_seconds)} />
        )}
        <MetricItem
          label="Last Check"
          value={formatTimestamp(metrics.timestamp)}
        />
      </div>

      {/* History trend */}
      {history && history.length > 1 && (
        <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700">
          <h4 className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            Recent History
          </h4>
          <div className="flex items-end gap-1" role="list" aria-label="Health history">
            {history.slice(-12).map((snapshot, i) => (
              <HistoryBar key={i} status={snapshot.status} timestamp={snapshot.timestamp} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  let colorClass = 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
  const lower = status.toLowerCase();

  if (lower === 'healthy' || lower === 'ok') {
    colorClass = 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400';
  } else if (lower === 'degraded' || lower === 'warning') {
    colorClass = 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';
  } else if (lower === 'unhealthy' || lower === 'error') {
    colorClass = 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';
  }

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`} role="status">
      {status}
    </span>
  );
}

function HistoryBar({ status, timestamp }: { status: string; timestamp: string }) {
  const lower = status.toLowerCase();
  let colorClass = 'bg-neutral-300 dark:bg-neutral-600';

  if (lower === 'healthy' || lower === 'ok') {
    colorClass = 'bg-success-500';
  } else if (lower === 'degraded') {
    colorClass = 'bg-warning-500';
  } else if (lower === 'unhealthy') {
    colorClass = 'bg-error-500';
  }

  return (
    <div
      role="listitem"
      className={`h-6 w-2 rounded-sm ${colorClass}`}
      title={`${status} at ${formatTimestamp(timestamp)}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}
