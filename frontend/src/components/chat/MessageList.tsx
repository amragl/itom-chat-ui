'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '@/types';
import ChatBubble from './ChatBubble';
import ClarificationBubble from './ClarificationBubble';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageListProps {
  /** The array of messages to display. */
  messages: Message[];
  /** A partial message being streamed in real time (token-by-token). */
  streamingMessage?: Partial<Message> | null;
  /** Active clarification request from the orchestrator, if any. */
  clarification?: {
    question: string;
    options: string[];
    pendingToken: string;
  } | null;
  /** Called when the user responds to a clarification prompt. */
  onClarificationRespond?: (answer: string) => void;
}

/**
 * Threshold in pixels from the bottom of the scroll container.
 * If the user is within this distance of the bottom, auto-scroll
 * will keep them at the bottom as new messages arrive.
 */
const AUTO_SCROLL_THRESHOLD = 150;

// ---------------------------------------------------------------------------
// MessageList component
// ---------------------------------------------------------------------------

/**
 * MessageList renders a scrollable, chronologically ordered list of chat messages.
 *
 * Features:
 * - Auto-scrolls to the bottom when new messages arrive, as long as the user
 *   has not scrolled up beyond the threshold.
 * - Shows a "scroll to bottom" button when the user has scrolled up, allowing
 *   them to quickly jump back to the latest messages.
 * - Renders a streaming message with a typing indicator when present.
 * - Displays an empty state when there are no messages.
 */
export default function MessageList({
  messages,
  streamingMessage,
  clarification,
  onClarificationRespond,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  /**
   * Determines whether the scroll container is near the bottom.
   */
  const checkScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceFromBottom <= AUTO_SCROLL_THRESHOLD;

    setIsNearBottom(nearBottom);
    setShowScrollButton(!nearBottom);
  }, []);

  /**
   * Scrolls to the bottom of the message list with the given animation behavior.
   */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll to bottom when messages change, but only if the user is already near the bottom
  useEffect(() => {
    if (isNearBottom) {
      // Use instant scroll for new messages to avoid laggy feeling
      scrollToBottom('instant');
    }
  }, [messages, streamingMessage?.content, isNearBottom, scrollToBottom]);

  // On initial mount, scroll to bottom instantly
  useEffect(() => {
    scrollToBottom('instant');
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', checkScrollPosition, { passive: true });
    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
    };
  }, [checkScrollPosition]);

  // Build the streaming message as a full Message for ChatBubble rendering
  const streamingAsMessage: Message | null =
    streamingMessage && streamingMessage.content
      ? {
          id: streamingMessage.id ?? '__streaming__',
          role: streamingMessage.role ?? 'assistant',
          content: streamingMessage.content,
          timestamp: streamingMessage.timestamp ?? new Date().toISOString(),
          agentId: streamingMessage.agentId,
        }
      : null;

  const hasMessages =
    messages.length > 0 || streamingAsMessage !== null || clarification !== null;

  return (
    <div className="relative flex h-full flex-col">
      {/* Scrollable message area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {!hasMessages ? (
          // Empty state
          <div className="flex h-full flex-col items-center justify-center px-6 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-7 w-7 text-neutral-400 dark:text-neutral-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                />
              </svg>
            </div>
            <p className="mt-4 text-sm font-medium text-neutral-600 dark:text-neutral-400">
              No messages yet
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              Send a message to start a conversation with an ITOM agent.
            </p>
          </div>
        ) : (
          <div className="space-y-1 py-4">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}

            {/* Streaming message with typing indicator */}
            {streamingAsMessage && (
              <ChatBubble message={streamingAsMessage} isStreaming />
            )}

            {/* Clarification bubble — shown when orchestrator needs disambiguation */}
            {clarification && onClarificationRespond && (
              <ClarificationBubble
                question={clarification.question}
                options={clarification.options}
                onRespond={onClarificationRespond}
              />
            )}

            {/* Invisible scroll anchor */}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            aria-label="Scroll to latest messages"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-md transition-all hover:bg-neutral-50 hover:shadow-lg active:scale-95 dark:border-neutral-600 dark:bg-neutral-700 dark:hover:bg-neutral-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4 text-neutral-600 dark:text-neutral-300"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
