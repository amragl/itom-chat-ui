'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import type { Agent, ConversationSummary, HealthStatus } from '@/types';
import { AgentStatusPanel, HealthMetricsDisplay } from '@/components/status';
import { LoadingSpinner, EmptyState } from '@/components/ui';

/**
 * Dashboard page at /dashboard.
 *
 * Provides an overview of the ITOM Chat system including:
 * - System health metrics
 * - Agent status panel
 * - Recent conversations
 * - Quick action buttons
 */
export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [agentData, healthData, convData] = await Promise.allSettled([
        apiClient.listAgents(),
        apiClient.getHealth(),
        apiClient.listConversations(),
      ]);

      if (agentData.status === 'fulfilled') setAgents(agentData.value);
      if (healthData.status === 'fulfilled') setHealth(healthData.value);
      if (convData.status === 'fulfilled') setConversations(convData.value.slice(0, 5));
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
        <LoadingSpinner size="lg" label="Loading dashboard..." />
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
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Overview of your ITOM Chat system.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            aria-label="Refresh dashboard"
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

        {/* Quick actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/chat"
            className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-surface p-4 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-hidden="true">
                <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 0 0 1.33 0l1.713-3.293c.121-.233.362-.393.642-.414 1.198-.087 2.383-.226 3.55-.414 1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.803 41.803 0 0 0 10 2Z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">New Chat</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Start a conversation</p>
            </div>
          </Link>

          <Link
            href="/chat"
            className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-surface p-4 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary-100 dark:bg-secondary-900/30">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-secondary-600 dark:text-secondary-400" aria-hidden="true">
                <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v11.75a.75.75 0 0 1-1.5 0V3.5h-9v11.75a.75.75 0 0 1-1.5 0V3.5Z" clipRule="evenodd" />
                <path d="M16.5 2A1.5 1.5 0 0 1 18 3.5v13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5v-13A1.5 1.5 0 0 1 7.5 2h9Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">History</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Browse conversations</p>
            </div>
          </Link>

          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-surface p-4 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-100 dark:bg-accent-900/30">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-accent-600 dark:text-accent-400" aria-hidden="true">
                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">API Docs</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">OpenAPI reference</p>
            </div>
          </a>
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

        {/* Recent conversations */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Recent Conversations
            </h2>
            <Link
              href="/chat"
              className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              View all
            </Link>
          </div>

          {conversations.length > 0 ? (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <Link
                  key={conv.id}
                  href="/chat"
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-surface px-4 py-3 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {conv.title || 'Untitled'}
                    </p>
                    {conv.lastMessagePreview && (
                      <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {conv.lastMessagePreview}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
                      {conv.messageCount} msg{conv.messageCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No conversations yet"
              description="Start chatting with an ITOM agent to see your conversations here."
              action={{ label: 'Start a Chat', onClick: () => window.location.href = '/chat' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
