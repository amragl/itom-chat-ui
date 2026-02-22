'use client';

import type { SuggestedAction } from '@/types';

interface SuggestedActionsProps {
  /** The list of suggested follow-up actions to render as pills. */
  actions: SuggestedAction[];
  /** Called when a pill is clicked, with the action's message and optional agent target. */
  onActionClick: (message: string, agentTarget?: string) => void;
}

/**
 * SuggestedActions renders a row of pill-shaped buttons below an agent message.
 * Each pill sends a follow-up chat message when clicked.
 */
export default function SuggestedActions({ actions, onActionClick }: SuggestedActionsProps) {
  if (!actions.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onActionClick(action.message, action.agent_target)}
          className="rounded-full border border-primary-300 bg-white px-3 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50 hover:border-primary-400 active:bg-primary-100 dark:border-primary-600 dark:bg-neutral-800 dark:text-primary-300 dark:hover:bg-neutral-700"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
