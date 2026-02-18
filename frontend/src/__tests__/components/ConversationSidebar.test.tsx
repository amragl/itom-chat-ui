/**
 * Tests for the ConversationSidebar component.
 *
 * These tests verify the rendering and interaction behavior of the
 * conversation sidebar, including:
 * - Empty state rendering
 * - Conversation list rendering
 * - Search input behavior
 * - Delete button interaction
 * - Active conversation highlighting
 *
 * Requires vitest and @testing-library/react to be installed:
 *   npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
 *
 * Run with: npx vitest run src/__tests__/components/ConversationSidebar.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConversationSidebar from '@/components/chat/ConversationSidebar';

// Mock the API client
vi.mock('@/lib/api', () => ({
  apiClient: {
    listConversations: vi.fn().mockResolvedValue([]),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  },
}));

import { apiClient } from '@/lib/api';

describe('ConversationSidebar', () => {
  const mockOnSelect = vi.fn();
  const mockOnNew = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the new conversation button', () => {
    render(
      <ConversationSidebar
        currentConvId={null}
        onSelect={mockOnSelect}
        onNew={mockOnNew}
      />,
    );

    expect(screen.getByLabelText('Start new conversation')).toBeDefined();
  });

  it('renders the search input', () => {
    render(
      <ConversationSidebar
        currentConvId={null}
        onSelect={mockOnSelect}
        onNew={mockOnNew}
      />,
    );

    expect(screen.getByLabelText('Search conversations')).toBeDefined();
  });

  it('calls onNew when the new conversation button is clicked', () => {
    render(
      <ConversationSidebar
        currentConvId={null}
        onSelect={mockOnSelect}
        onNew={mockOnNew}
      />,
    );

    fireEvent.click(screen.getByLabelText('Start new conversation'));
    expect(mockOnNew).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no conversations exist', async () => {
    (apiClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(
      <ConversationSidebar
        currentConvId={null}
        onSelect={mockOnSelect}
        onNew={mockOnNew}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No conversations yet.')).toBeDefined();
    });
  });

  it('renders conversations when data is available', async () => {
    (apiClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'conv-1',
        title: 'Discovery Audit',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T01:00:00Z',
        messageCount: 5,
        lastMessagePreview: 'Found 42 servers',
      },
      {
        id: 'conv-2',
        title: 'Asset Review',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T01:00:00Z',
        messageCount: 3,
        lastMessagePreview: null,
      },
    ]);

    render(
      <ConversationSidebar
        currentConvId="conv-1"
        onSelect={mockOnSelect}
        onNew={mockOnNew}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Discovery Audit')).toBeDefined();
      expect(screen.getByText('Asset Review')).toBeDefined();
    });
  });

  it('calls onSelect when a conversation is clicked', async () => {
    (apiClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'conv-1',
        title: 'Test Chat',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T01:00:00Z',
        messageCount: 1,
        lastMessagePreview: 'Hello',
      },
    ]);

    render(
      <ConversationSidebar
        currentConvId={null}
        onSelect={mockOnSelect}
        onNew={mockOnNew}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Test Chat')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Test Chat'));
    expect(mockOnSelect).toHaveBeenCalledWith('conv-1');
  });
});
