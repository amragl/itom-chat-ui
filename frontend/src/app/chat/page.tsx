'use client';

import { ChatProvider, useChatActions, useChatState } from '@/contexts';
import { ChatErrorBoundary, ChatHeader, MessageInput, MessageList } from '@/components/chat';

// ---------------------------------------------------------------------------
// Inner chat view (consumes ChatProvider context)
// ---------------------------------------------------------------------------

/**
 * ChatView renders the main chat interface composed of:
 * - ChatHeader (agent selector, new chat, connection status)
 * - MessageList (scrollable messages with streaming bubble)
 * - MessageInput (auto-resizing textarea with send)
 *
 * This component lives inside the ChatProvider and accesses state/actions
 * through the context hooks.
 */
function ChatView() {
  const { messages, isLoading, isStreaming, error, streamingMessage, clarification } = useChatState();
  const { sendMessage, clearError, respondToClarification } = useChatActions();

  return (
    <div className="flex h-full flex-col">
      <ChatHeader />

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between border-b border-error-200 bg-error-50 px-4 py-2 dark:border-error-800 dark:bg-error-900/20">
          <p className="text-sm text-error-700 dark:text-error-300">{error}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="ml-4 shrink-0 rounded p-1 text-error-500 transition-colors hover:bg-error-100 dark:hover:bg-error-900/30"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      )}

      {/* Message area */}
      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          streamingMessage={streamingMessage}
          clarification={clarification}
          onClarificationRespond={respondToClarification}
        />
      </div>

      {/* Input area */}
      <MessageInput
        onSend={sendMessage}
        disabled={isLoading || isStreaming}
        placeholder={
          isStreaming
            ? 'Waiting for response...'
            : 'Type a message to an ITOM agent...'
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPage -- top-level page component
// ---------------------------------------------------------------------------

/**
 * The main Chat page at /chat.
 *
 * Wraps the chat view with:
 * - ChatProvider (state management, streaming, WebSocket)
 * - ChatErrorBoundary (catches rendering errors)
 *
 * This is the entry point for the chat feature. The ChatProvider is scoped
 * to this page so its WebSocket connection and streaming state are created
 * when the user navigates to /chat and cleaned up when they leave.
 */
export default function ChatPage() {
  return (
    <ChatProvider>
      <ChatErrorBoundary>
        <ChatView />
      </ChatErrorBoundary>
    </ChatProvider>
  );
}
