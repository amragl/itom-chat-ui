'use client';

import type { StreamingState } from '@/types';
import type { Message } from '@/types';
import ChatBubble from './ChatBubble';
import TypingIndicator from './TypingIndicator';

// ---------------------------------------------------------------------------
// Agent display helper (duplicated minimally from ChatBubble to resolve name)
// ---------------------------------------------------------------------------

function getAgentDisplayName(agentId: string | undefined): string {
  if (!agentId) return 'ITOM Agent';
  const names: Record<string, string> = {
    discovery: 'Discovery Agent',
    asset: 'Asset Agent',
    auditor: 'Auditor Agent',
    documentator: 'Documentator Agent',
    orchestrator: 'Orchestrator',
  };
  return names[agentId] ?? agentId;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StreamingChatBubbleProps {
  /** The current streaming state from useStreamingResponse. */
  streamingState: StreamingState;
}

// ---------------------------------------------------------------------------
// StreamingChatBubble component
// ---------------------------------------------------------------------------

/**
 * StreamingChatBubble renders the appropriate visual state during a streaming
 * response lifecycle:
 *
 * - **Connecting / before first token**: Shows the TypingIndicator (animated
 *   three-dot bounce).
 * - **Streaming (tokens arriving)**: Shows a ChatBubble with `isStreaming=true`
 *   and the accumulated partial content.
 * - **Complete**: Returns null (the parent should replace this with the final
 *   message in the messages array).
 * - **Error**: Shows a ChatBubble with the error message styled as a system
 *   message.
 * - **Idle**: Returns null (nothing to show).
 *
 * This component is designed to be placed after the message list and before
 * the scroll anchor, so it appears at the bottom of the chat.
 */
export default function StreamingChatBubble({ streamingState }: StreamingChatBubbleProps) {
  const { status, partialContent, messageId, agentId, error, hasReceivedFirstToken } =
    streamingState;

  // Nothing to render when idle or complete
  if (status === 'idle' || status === 'complete') {
    return null;
  }

  // Show typing indicator while connecting or before the first token arrives
  if (status === 'connecting' || (status === 'streaming' && !hasReceivedFirstToken)) {
    return <TypingIndicator agentName={getAgentDisplayName(agentId ?? undefined)} />;
  }

  // Show error as a system-style message
  if (status === 'error' && error) {
    const errorMessage: Message = {
      id: messageId ?? '__stream_error__',
      role: 'system',
      content: `**Stream Error** (${error.code}): ${error.message}`,
      timestamp: new Date().toISOString(),
      agentId: agentId ?? undefined,
    };
    return <ChatBubble message={errorMessage} />;
  }

  // Streaming with content -- render as a ChatBubble with partial content
  if (status === 'streaming' && hasReceivedFirstToken && partialContent) {
    const partialMessage: Message = {
      id: messageId ?? '__streaming__',
      role: 'assistant',
      content: partialContent,
      timestamp: new Date().toISOString(),
      agentId: agentId ?? undefined,
    };
    return <ChatBubble message={partialMessage} isStreaming />;
  }

  return null;
}
