'use client';

import { useCallback, useEffect } from 'react';

/**
 * A keyboard shortcut definition.
 */
export interface KeyboardShortcut {
  /** The keyboard key (e.g., 'k', 'n', '/'). */
  key: string;
  /** Whether Ctrl (or Cmd on Mac) must be held. */
  ctrlKey?: boolean;
  /** Whether Shift must be held. */
  shiftKey?: boolean;
  /** Whether Alt must be held. */
  altKey?: boolean;
  /** Callback to execute when the shortcut is triggered. */
  handler: () => void;
  /** Human-readable description of the shortcut. */
  description: string;
}

/**
 * Default keyboard shortcuts for the ITOM Chat UI.
 *
 * These shortcuts are active globally when the hook is mounted.
 *
 * @param actions - Object with handler functions for each shortcut.
 */
export function getDefaultShortcuts(actions: {
  onNewConversation?: () => void;
  onFocusInput?: () => void;
  onShowShortcuts?: () => void;
  onEscape?: () => void;
}): KeyboardShortcut[] {
  const shortcuts: KeyboardShortcut[] = [];

  if (actions.onNewConversation) {
    shortcuts.push({
      key: 'n',
      ctrlKey: true,
      handler: actions.onNewConversation,
      description: 'New conversation',
    });
  }

  if (actions.onFocusInput) {
    shortcuts.push({
      key: '/',
      ctrlKey: true,
      handler: actions.onFocusInput,
      description: 'Focus message input',
    });
  }

  if (actions.onShowShortcuts) {
    shortcuts.push({
      key: '?',
      ctrlKey: true,
      handler: actions.onShowShortcuts,
      description: 'Show keyboard shortcuts',
    });
  }

  if (actions.onEscape) {
    shortcuts.push({
      key: 'Escape',
      handler: actions.onEscape,
      description: 'Close dialog / Clear selection',
    });
  }

  return shortcuts;
}

/**
 * Hook that registers global keyboard shortcuts.
 *
 * Shortcuts are active for the lifetime of the component that uses this hook.
 * When the component unmounts, all listeners are cleaned up.
 *
 * Shortcuts are suppressed when the user is typing in a text input or
 * textarea, unless the shortcut includes a modifier key (Ctrl/Cmd).
 *
 * @param shortcuts - Array of keyboard shortcut definitions.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check if the user is typing in an input field
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrlKey
          ? event.ctrlKey || event.metaKey
          : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shiftKey ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.altKey ? event.altKey : !event.altKey;
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          // Allow Escape even in input fields; suppress non-modifier shortcuts in inputs
          if (isTyping && !shortcut.ctrlKey && shortcut.key !== 'Escape') {
            continue;
          }

          event.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
