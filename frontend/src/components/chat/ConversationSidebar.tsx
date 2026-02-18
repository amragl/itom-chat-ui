'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import type { ConversationSummary } from '@/types';

/**
 * Formats an ISO 8601 timestamp to a relative or short date string.
 */
function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConversationSidebarProps {
  /** The currently active conversation ID. */
  currentConvId?: string | null;
  /** Callback when a conversation is selected from the list. */
  onSelect: (id: string) => void;
  /** Callback when the "New Conversation" button is clicked. */
  onNew: () => void;
}

// ---------------------------------------------------------------------------
// ConversationSidebar
// ---------------------------------------------------------------------------

/**
 * Sidebar listing all conversations with search, new conversation button,
 * and delete functionality. Designed to fit within the main layout Sidebar.
 *
 * Features:
 * - Lists conversations ordered by most recently updated
 * - Shows message count and last message preview
 * - Search input to filter conversations
 * - Active conversation highlight
 * - Delete button on hover
 * - Automatic refresh when conversations are created/deleted
 */
export default function ConversationSidebar({
  currentConvId,
  onSelect,
  onNew,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch conversations from the backend
  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.listConversations();
      setConversations(data);
    } catch {
      // Non-fatal: sidebar will show empty state
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Handle search
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      fetchConversations();
      return;
    }
    try {
      // Use the search API for non-empty queries
      const results = await apiClient.listConversations();
      const filtered = results.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          (c.lastMessagePreview && c.lastMessagePreview.toLowerCase().includes(query.toLowerCase())),
      );
      setConversations(filtered);
    } catch {
      // Keep existing list on error
    }
  }, [fetchConversations]);

  // Handle delete
  const handleDelete = useCallback(
    async (e: React.MouseEvent, convId: string) => {
      e.stopPropagation();
      try {
        await apiClient.deleteConversation(convId);
        setConversations((prev) => prev.filter((c) => c.id !== convId));
      } catch {
        // Deletion failed silently; conversation stays in list
      }
    },
    [],
  );

  return (
    <div className="flex h-full flex-col" role="complementary" aria-label="Conversation list">
      {/* New Conversation button */}
      <div className="shrink-0 px-2 pb-2">
        <button
          type="button"
          onClick={onNew}
          aria-label="Start new conversation"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-surface px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          New Conversation
        </button>
      </div>

      {/* Search input */}
      <div className="shrink-0 px-2 pb-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search conversations..."
          aria-label="Search conversations"
          className="w-full rounded-lg border border-neutral-300 bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-600 dark:placeholder:text-neutral-500"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Conversations">
        {isLoading && conversations.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-neutral-400">
            Loading...
          </div>
        )}

        {!isLoading && conversations.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
            {searchQuery ? 'No conversations found.' : 'No conversations yet.'}
          </div>
        )}

        {conversations.map((conv) => {
          const isActive = conv.id === currentConvId;
          return (
            <button
              key={conv.id}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => onSelect(conv.id)}
              className={`group flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors ${
                isActive
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">
                  {conv.title || 'Untitled'}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, conv.id)}
                  aria-label={`Delete conversation: ${conv.title || 'Untitled'}`}
                  className="hidden shrink-0 rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600 group-hover:block dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="h-3 w-3"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                  {conv.lastMessagePreview || 'No messages yet'}
                </span>
                <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                  {formatRelativeDate(conv.updatedAt)}
                </span>
              </div>
              {conv.messageCount > 0 && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {conv.messageCount} message{conv.messageCount !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
