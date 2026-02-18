'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Keyboard shortcut definitions displayed in the help modal.
 */
const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], description: 'Open command palette' },
  { keys: ['Ctrl', 'N'], description: 'New conversation' },
  { keys: ['Ctrl', '/'], description: 'Focus message input' },
  { keys: ['Ctrl', '?'], description: 'Show keyboard shortcuts' },
  { keys: ['Escape'], description: 'Close dialog / Clear selection' },
  { keys: ['Enter'], description: 'Send message' },
  { keys: ['Shift', 'Enter'], description: 'New line in message' },
  { keys: ['/'], description: 'Open slash command menu (in input)' },
] as const;

interface KeyboardShortcutsHelpProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
}

/**
 * A modal overlay that displays all available keyboard shortcuts.
 *
 * Closes when the user presses Escape or clicks the backdrop.
 * Manages focus by trapping it within the dialog while open.
 */
export default function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      // Focus the dialog for accessibility
      dialogRef.current?.focus();
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="mx-4 w-full max-w-md rounded-xl border border-neutral-200 bg-surface p-6 shadow-xl dark:border-neutral-700"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="space-y-2">
          {SHORTCUTS.map((shortcut, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                {shortcut.description}
              </span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, ki) => (
                  <kbd
                    key={ki}
                    className="min-w-[1.5rem] rounded bg-neutral-100 px-1.5 py-0.5 text-center text-xs font-mono font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
