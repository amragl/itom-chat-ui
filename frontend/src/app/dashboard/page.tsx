'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import type { WorklogFilters } from '@/lib/api';
import type { WorkItem } from '@/types';
import { LoadingSpinner, EmptyState } from '@/components/ui';

// ---------------------------------------------------------------------------
// Priority badge colors
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-300',
  2: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300',
  3: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  4: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  5: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'P1 - Critical',
  2: 'P2 - High',
  3: 'P3 - Moderate',
  4: 'P4 - Low',
  5: 'P5 - Planning',
};

const TYPE_LABELS: Record<string, string> = {
  incident: 'INC',
  change: 'CHG',
  task: 'TASK',
  ritm: 'RITM',
  problem: 'PRB',
};

// ---------------------------------------------------------------------------
// Filter pill component
// ---------------------------------------------------------------------------

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/30 dark:text-primary-300'
          : 'border-neutral-300 bg-surface text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

/**
 * Dashboard page at /dashboard.
 *
 * Displays the user's prioritized ServiceNow work items (incidents, changes,
 * tasks, RITMs). Items are sorted by priority then due date then opened date.
 * Clicking an item navigates to chat with a pre-filled query.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [activePriorities, setActivePriorities] = useState<Set<number>>(new Set());

  const toggleType = (t: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const togglePriority = (p: number) => {
    setActivePriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const fetchWorklog = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: WorklogFilters = {};
      if (activeTypes.size > 0) {
        filters.type = Array.from(activeTypes).join(',');
      }
      if (activePriorities.size > 0) {
        filters.priority = Array.from(activePriorities).join(',');
      }
      const data = await apiClient.getWorklog(filters);
      // Sort: priority ASC, due date ASC (nulls last), opened date ASC
      const sorted = [...data.items].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
        return a.openedAt.localeCompare(b.openedAt);
      });
      setItems(sorted);
      setStatusMessage(data.status !== 'ok' ? data.status : '');
    } catch {
      setStatusMessage('Failed to fetch work items.');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTypes, activePriorities]);

  useEffect(() => {
    fetchWorklog();
  }, [fetchWorklog]);

  const handleItemClick = (item: WorkItem) => {
    const query = encodeURIComponent(`Tell me about ${item.number}`);
    router.push(`/chat?prefill=${query}`);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" label="Loading work items..." />
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
              My Work
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Your open ServiceNow work items, prioritized.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchWorklog}
            aria-label="Refresh work items"
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

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Type:</span>
            <FilterPill label="INC" active={activeTypes.has('incident')} onClick={() => toggleType('incident')} />
            <FilterPill label="CHG" active={activeTypes.has('change')} onClick={() => toggleType('change')} />
            <FilterPill label="RITM" active={activeTypes.has('ritm')} onClick={() => toggleType('ritm')} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Priority:</span>
            <FilterPill label="P1" active={activePriorities.has(1)} onClick={() => togglePriority(1)} />
            <FilterPill label="P2" active={activePriorities.has(2)} onClick={() => togglePriority(2)} />
            <FilterPill label="P3" active={activePriorities.has(3)} onClick={() => togglePriority(3)} />
            <FilterPill label="P4" active={activePriorities.has(4)} onClick={() => togglePriority(4)} />
          </div>
          {(activeTypes.size > 0 || activePriorities.size > 0) && (
            <button
              type="button"
              onClick={() => {
                setActiveTypes(new Set());
                setActivePriorities(new Set());
              }}
              className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Status message (e.g. orchestrator unavailable) */}
        {statusMessage && (
          <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-900/20 dark:text-warning-300">
            {statusMessage}
          </div>
        )}

        {/* Work items list */}
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.sysId}
                type="button"
                onClick={() => handleItemClick(item)}
                className="flex w-full items-center gap-4 rounded-lg border border-neutral-200 bg-surface px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {/* Type badge */}
                <span className="shrink-0 rounded bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                  {TYPE_LABELS[item.type] ?? item.type.toUpperCase()}
                </span>

                {/* Priority badge */}
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS[3]}`}>
                  {PRIORITY_LABELS[item.priority] ?? `P${item.priority}`}
                </span>

                {/* Number + description */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {item.number}
                    </span>
                    <span className="truncate text-sm text-neutral-600 dark:text-neutral-400">
                      {item.shortDescription}
                    </span>
                  </div>
                </div>

                {/* State pill */}
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {item.state}
                </span>

                {/* Due date */}
                {item.dueDate && (
                  <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-500">
                    Due {new Date(item.dueDate).toLocaleDateString()}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : statusMessage ? null : (
          <EmptyState
            title="No open work items"
            description="You have no open incidents, changes, tasks, or RITMs assigned to you."
          />
        )}
      </div>
    </div>
  );
}
