'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SlashCommand } from '@/lib/commands';
import { matchCommands } from '@/lib/commands';
import CommandPalette from './CommandPalette';
import type { CommandPaletteHandle } from './CommandPalette';

/**
 * Props for the MessageInput component.
 */
interface MessageInputProps {
  /** Callback invoked with the trimmed message content when the user sends a message. */
  onSend: (content: string) => void;
  /** When true, the input and send button are disabled (e.g., while waiting for a response). */
  disabled?: boolean;
  /** Placeholder text shown in the textarea when empty. */
  placeholder?: string;
}

/**
 * The maximum number of visible text lines before the textarea stops growing
 * and becomes scrollable.
 */
const MAX_VISIBLE_LINES = 6;

/**
 * A chat message input component with an auto-resizing textarea and send button.
 *
 * Features:
 * - Auto-resizing textarea that grows with content up to MAX_VISIBLE_LINES
 * - Slash command autocomplete palette when input starts with "/"
 * - Send button enabled only when the textarea contains non-whitespace content
 * - Keyboard shortcut: Enter to send, Shift+Enter for newline
 * - Loading/disabled state that prevents input while waiting for a response
 * - Accessible with proper ARIA labels and keyboard navigation
 */
export default function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const [paletteDismissed, setPaletteDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const paletteRef = useRef<CommandPaletteHandle>(null);

  /** Whether the current input value contains non-whitespace characters. */
  const hasContent = value.trim().length > 0;

  // Derive palette visibility from value — no effect needed
  const showPalette = useMemo(() => {
    if (paletteDismissed) return false;
    if (!value.startsWith('/')) return false;
    if (value.includes(' ')) return false;
    return matchCommands(value.split(' ')[0]).length > 0;
  }, [value, paletteDismissed]);

  /**
   * Resize the textarea to fit its content, up to the maximum number of lines.
   */
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
    const maxHeight = lineHeight * MAX_VISIBLE_LINES + paddingTop + paddingBottom;

    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  /**
   * Handle selection of a command from the CommandPalette.
   * Fills the input with the command name followed by a space (if it takes params).
   */
  const handleCommandSelect = useCallback((command: SlashCommand) => {
    if (command.paramHint) {
      setValue(command.name + ' ');
    } else {
      setValue(command.name);
    }
    setPaletteDismissed(true);
    textareaRef.current?.focus();
  }, []);

  /**
   * Submit the current message if it has content and the input is not disabled.
   */
  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setValue('');
    setPaletteDismissed(false);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.overflowY = 'hidden';
        textarea.focus();
      }
    });
  }, [value, disabled, onSend]);

  /**
   * Handle keyboard events on the textarea.
   * When the command palette is open, navigation keys are forwarded to it.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Forward to palette first — if it consumes the event, stop here
      if (showPalette && paletteRef.current?.handleKeyDown(e)) {
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, showPalette],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    setPaletteDismissed(false);
  }, []);

  return (
    <div className="border-t border-neutral-200 bg-surface px-4 py-3 dark:border-neutral-700">
      <div className="relative">
        <CommandPalette
          ref={paletteRef}
          input={value.split(' ')[0]}
          visible={showPalette}
          onSelect={handleCommandSelect}
          onClose={() => setPaletteDismissed(true)}
        />

        <div
          className={`flex items-end gap-2 rounded-xl border bg-surface-raised px-3 py-2 transition-colors ${
            disabled
              ? 'border-neutral-200 opacity-60 dark:border-neutral-700'
              : 'border-neutral-300 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 dark:border-neutral-600'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            aria-label="Message input"
            className="max-h-[calc(var(--text-base--line-height)*6+1rem)] min-h-[2.5rem] flex-1 resize-none bg-transparent text-base leading-relaxed text-foreground placeholder:text-neutral-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-neutral-500"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || !hasContent}
            aria-label="Send message"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              disabled || !hasContent
                ? 'cursor-not-allowed bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600'
                : 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800'
            }`}
          >
            {disabled ? (
              <svg
                className="h-5 w-5 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-center text-xs text-neutral-400 dark:text-neutral-500">
        Press <kbd className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">Enter</kbd> to send, <kbd className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">Shift+Enter</kbd> for a new line, <kbd className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">/</kbd> for commands
      </p>
    </div>
  );
}
