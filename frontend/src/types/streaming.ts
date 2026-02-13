/**
 * Types for the streaming chat response system.
 *
 * These types mirror the SSE event envelope and data payloads emitted by
 * the backend ``POST /api/chat/stream`` endpoint.
 */

/**
 * Discriminator for the kind of SSE event received from the streaming endpoint.
 */
export type StreamEventType = 'stream_start' | 'token' | 'stream_end' | 'error';

/**
 * Data payload for the ``stream_start`` SSE event.
 * Emitted once at the beginning of a streaming response.
 */
export interface StreamStartData {
  message_id: string;
  agent_id: string;
  conversation_id: string;
  timestamp: string;
}

/**
 * Data payload for a ``token`` SSE event.
 * Emitted for each partial text chunk of the agent's response.
 */
export interface TokenData {
  token: string;
  message_id: string;
}

/**
 * Data payload for the ``stream_end`` SSE event.
 * Emitted once when the full response has been delivered.
 */
export interface StreamEndData {
  message_id: string;
  full_content: string;
  agent_id: string;
  conversation_id: string;
  timestamp: string;
}

/**
 * Data payload for the ``error`` SSE event.
 * Emitted if something goes wrong during streaming.
 */
export interface StreamErrorData {
  code: string;
  message: string;
}

/**
 * Union type for all possible SSE event envelopes from the streaming endpoint.
 */
export type StreamEvent =
  | { event: 'stream_start'; data: StreamStartData }
  | { event: 'token'; data: TokenData }
  | { event: 'stream_end'; data: StreamEndData }
  | { event: 'error'; data: StreamErrorData };

/**
 * The current state of a streaming response.
 */
export type StreamingStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';

/**
 * State object returned by the useStreamingResponse hook.
 */
export interface StreamingState {
  /** Current streaming lifecycle status. */
  status: StreamingStatus;

  /** The partial response accumulated so far (grows token-by-token). */
  partialContent: string;

  /** The complete response text after streaming finishes. */
  fullContent: string | null;

  /** The UUID of the streaming message (set once stream_start is received). */
  messageId: string | null;

  /** The agent ID handling this response. */
  agentId: string | null;

  /** Error information if the stream encountered an error. */
  error: StreamErrorData | null;

  /** Whether the first token has been received (typing indicator uses this). */
  hasReceivedFirstToken: boolean;
}
