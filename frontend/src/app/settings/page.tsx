'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import type { Agent, HealthStatus } from '@/types';
import { AgentStatusPanel, HealthMetricsDisplay } from '@/components/status';
import { LoadingSpinner } from '@/components/ui';

/**
 * Settings page at /settings.
 *
 * Displays system health metrics and agent status information.
 * Previously this content lived on the dashboard page.
 */
export default function SettingsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [agentData, healthData] = await Promise.allSettled([
        apiClient.listAgents(),
        apiClient.getHealth(),
      ]);

      if (agentData.status === 'fulfilled') setAgents(agentData.value);
      if (healthData.status === 'fulfilled') setHealth(healthData.value);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" label="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Settings
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              System status and configuration.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            aria-label="Refresh settings"
            className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-surface px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.636a.75.75 0 0 0-.75.75v3.596a.75.75 0 0 0 1.5 0v-2.234a7 7 0 0 0 12.326-3.9.75.75 0 0 0-1.4-.533ZM4.688 8.576a5.5 5.5 0 0 1 9.201-2.466l.312.311H11.77a.75.75 0 0 0 0 1.5h3.596a.75.75 0 0 0 .75-.75V3.575a.75.75 0 0 0-1.5 0v2.234A7 7 0 0 0 2.288 9.11a.75.75 0 0 0 1.4.533v-.067Z" clipRule="evenodd" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Health metrics */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              System Health
            </h2>
            {health ? (
              <HealthMetricsDisplay metrics={health} />
            ) : (
              <div className="rounded-lg border border-neutral-200 p-4 text-center dark:border-neutral-700">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Unable to fetch health metrics.
                </p>
              </div>
            )}
          </div>

          {/* Agent status */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Agent Status
            </h2>
            <AgentStatusPanel agents={agents} />
          </div>
        </div>
      </div>
    </div>
  );
}
