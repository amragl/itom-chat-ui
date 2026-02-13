'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, AgentStatus } from '@/types';
import { apiClient } from '@/lib/api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentSelectorProps {
  /** The currently selected agent ID, or null if no agent is selected. */
  selectedAgentId: string | null;
  /** Callback fired when the user selects a different agent. */
  onSelectAgent: (agentId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Agent icon SVGs
// ---------------------------------------------------------------------------

/**
 * Renders an inline SVG icon for the given icon identifier.
 * Uses Heroicon-style paths sized to 20x20.
 */
function AgentIcon({ icon, className }: { icon: string | undefined; className?: string }) {
  const cls = className ?? 'h-5 w-5';
  switch (icon) {
    case 'search':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={cls}>
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
      );
    case 'server':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={cls}>
          <path d="M4.632 3.533A2 2 0 0 1 6.577 2h6.846a2 2 0 0 1 1.945 1.533l1.976 8.234A3.489 3.489 0 0 0 16 11.5H4c-.476 0-.93.095-1.344.267l1.976-8.234Z" />
          <path
            fillRule="evenodd"
            d="M4 13a2 2 0 1 0 0 4h12a2 2 0 1 0 0-4H4Zm11.24 2a.75.75 0 0 1 .75-.75H16a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1-.75-.75Zm-2.5 0a.75.75 0 0 1 .75-.75H13.5a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1-.75-.75Z"
            clipRule="evenodd"
          />
        </svg>
      );
    case 'shield-check':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={cls}>
          <path
            fillRule="evenodd"
            d="M9.661 2.237a.531.531 0 0 1 .678 0 11.947 11.947 0 0 0 7.078 2.749.5.5 0 0 1 .479.425c.069.52.104 1.05.104 1.59 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 0 1-.332 0C5.26 16.564 2 12.163 2 7c0-.538.035-1.069.104-1.589a.5.5 0 0 1 .48-.425 11.947 11.947 0 0 0 7.077-2.75Zm4.196 5.954a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
            clipRule="evenodd"
          />
        </svg>
      );
    case 'file-text':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={cls}>
          <path
            fillRule="evenodd"
            d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
            clipRule="evenodd"
          />
        </svg>
      );
    case 'zap':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={cls}>
          <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
        </svg>
      );
    default:
      // Fallback: a generic circle
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={cls}>
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.536-4.464a.75.75 0 1 0-1.061-1.061 3.5 3.5 0 0 1-4.95 0 .75.75 0 0 0-1.06 1.06 5 5 0 0 0 7.07 0ZM9 8.5c0 .828-.448 1.5-1 1.5s-1-.672-1-1.5S7.448 7 8 7s1 .672 1 1.5Zm3 1.5c.552 0 1-.672 1-1.5S12.552 7 12 7s-1 .672-1 1.5.448 1.5 1 1.5Z"
            clipRule="evenodd"
          />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

/** Small coloured dot indicating agent status. */
function StatusDot({ status }: { status: AgentStatus }) {
  let colorClass: string;
  let label: string;

  switch (status) {
    case 'online':
      colorClass = 'bg-success-500';
      label = 'Online';
      break;
    case 'busy':
      colorClass = 'bg-warning-500';
      label = 'Busy';
      break;
    case 'offline':
    default:
      colorClass = 'bg-neutral-400';
      label = 'Offline';
      break;
  }

  return (
    <span className="relative flex h-2.5 w-2.5" aria-label={label} title={label}>
      {status === 'online' && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorClass} opacity-75`}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colorClass}`} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// AgentSelector component
// ---------------------------------------------------------------------------

/**
 * Dropdown selector for choosing which ITOM agent to route messages to.
 *
 * Displays the currently selected agent as a pill/button in the chat header.
 * Clicking opens a dropdown listing all available agents with their status.
 * Agent data is fetched from the GET /api/agents endpoint on mount.
 */
export default function AgentSelector({ selectedAgentId, onSelectAgent }: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch agents from the backend on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchAgents() {
      setIsLoading(true);
      setError(null);
      try {
        const agentList = await apiClient.listAgents();
        if (!cancelled) {
          setAgents(agentList);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load agents';
          setError(message);
          // Fall back to showing agent definitions with offline status
          // so the user can still see and select agents even when the
          // backend is unreachable.
          setAgents([
            { id: 'discovery', name: 'Discovery Agent', description: 'Network and infrastructure discovery', status: 'offline', domain: 'discovery' },
            { id: 'asset', name: 'Asset Agent', description: 'IT asset management and tracking', status: 'offline', domain: 'asset' },
            { id: 'auditor', name: 'Auditor Agent', description: 'IT compliance auditing and reporting', status: 'offline', domain: 'audit' },
            { id: 'documentator', name: 'Documentator Agent', description: 'ITOM documentation generation', status: 'offline', domain: 'documentation' },
            { id: 'auto', name: 'Auto (Orchestrator)', description: 'Let the orchestrator decide routing', status: 'offline', domain: 'orchestrator' },
          ]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchAgents();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (agentId: string) => {
      onSelectAgent(agentId === selectedAgentId ? null : agentId);
      setIsOpen(false);
    },
    [onSelectAgent, selectedAgentId],
  );

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  // Display label for the trigger button
  const triggerLabel = selectedAgent ? selectedAgent.name : 'Select Agent';
  const triggerIcon = selectedAgent?.icon;

  return (
    <div ref={dropdownRef} className="relative inline-block">
      {/* Trigger button (pill style) */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Agent selector: ${triggerLabel}`}
        className={[
          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          selectedAgent
            ? 'border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100'
            : 'border-neutral-300 bg-surface text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800',
          isLoading ? 'cursor-wait opacity-60' : 'cursor-pointer',
        ].join(' ')}
      >
        {isLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-primary-500" />
        ) : (
          selectedAgent && <AgentIcon icon={triggerIcon} className="h-4 w-4" />
        )}
        <span>{isLoading ? 'Loading...' : triggerLabel}</span>
        {selectedAgent && (
          <StatusDot status={selectedAgent.status} />
        )}
        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Available agents"
          className={[
            'absolute left-0 z-50 mt-2 w-72 origin-top-left',
            'rounded-xl border border-neutral-200 bg-surface shadow-lg',
          ].join(' ')}
        >
          {error && (
            <div className="border-b border-neutral-200 px-3 py-2 text-xs text-warning-600">
              Could not reach backend. Showing agents as offline.
            </div>
          )}
          <ul className="py-1">
            {agents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;
              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(agent.id)}
                    className={[
                      'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                      'hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none',
                      isSelected ? 'bg-primary-50' : '',
                    ].join(' ')}
                  >
                    {/* Icon */}
                    <span
                      className={[
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        isSelected
                          ? 'bg-primary-100 text-primary-600'
                          : 'bg-neutral-100 text-neutral-500',
                      ].join(' ')}
                    >
                      <AgentIcon icon={agent.icon} className="h-4 w-4" />
                    </span>

                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            'text-sm font-medium',
                            isSelected ? 'text-primary-700' : 'text-neutral-800',
                          ].join(' ')}
                        >
                          {agent.name}
                        </span>
                        <StatusDot status={agent.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500 leading-snug">
                        {agent.description}
                      </p>
                    </div>

                    {/* Check mark for selected */}
                    {isSelected && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="mt-1 h-4 w-4 shrink-0 text-primary-600"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
