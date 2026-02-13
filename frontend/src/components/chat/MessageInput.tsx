'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
 * - Send button enabled only when the textarea contains non-whitespace content
 * - Keyboard shortcut: Enter to send, Shift+Enter for newline
 * - Loading/disabled state that prevents input while waiting for a response
 * - Accessible with proper ARIA labels and keyboard navigation
 *
 * The component manages its own local state for the input value and delegates
 * message submission to the parent via the onSend callback.
 */
export default function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Whether the current input value contains non-whitespace characters. */
  const hasContent = value.trim().length > 0;

  /**
   * Resize the textarea to fit its content, up to the maximum number of lines.
   * After reaching the max height, the textarea becomes scrollable.
   */
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto so scrollHeight reflects the actual content height.
    textarea.style.height = 'auto';

    // Compute the maximum allowed height based on the line-height and max lines.
    // We read the computed line-height to stay in sync with the CSS/design tokens.
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
    const maxHeight = lineHeight * MAX_VISIBLE_LINES + paddingTop + paddingBottom;

    // Set the height to the smaller of scrollHeight or maxHeight.
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;

    // Enable or disable scrolling based on whether content exceeds max height.
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  /**
   * Re-adjust the textarea height whenever the value changes.
   */
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  /**
   * Submit the current message if it has content and the input is not disabled.
   * Clears the textarea and resets its height after sending.
   */
  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setValue('');

    // After clearing, reset the textarea height on the next frame
    // so the DOM has time to update the value.
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
   * - Enter (without Shift): sends the message
   * - Shift+Enter: inserts a newline (default textarea behavior)
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  return (
    <div className="border-t border-neutral-200 bg-surface px-4 py-3 dark:border-neutral-700">
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
            /* Loading spinner shown while waiting for a response */
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
            /* Send arrow icon */
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

      <p className="mt-1.5 text-center text-xs text-neutral-400 dark:text-neutral-500">
        Press <kbd className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">Enter</kbd> to send, <kbd className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">Shift+Enter</kbd> for a new line
      </p>
    </div>
  );
}
