/**
 * The type of WebSocket message exchanged between frontend and backend.
 *
 * - "chat"      -- A chat message (user input or agent response)
 * - "status"    -- Agent or system status update
 * - "error"     -- Error notification
 * - "heartbeat" -- Keep-alive ping/pong
 */
export type WebSocketMessageType = 'chat' | 'status' | 'error' | 'heartbeat';

/**
 * A structured WebSocket message for real-time communication.
 *
 * All WebSocket communication between the frontend and backend uses this
 * envelope format. The `type` field determines how the `payload` is interpreted.
 */
export interface WebSocketMessage<T = unknown> {
  /** The category of this message, determining how the payload is processed. */
  type: WebSocketMessageType;

  /** The message data. Structure depends on the message type. */
  payload: T;

  /** Optional correlation ID for matching requests with responses. */
  correlationId?: string;
}

/**
 * Payload for WebSocket chat messages.
 */
export interface WebSocketChatPayload {
  /** The conversation this message belongs to. */
  conversationId: string;

  /** The message content. */
  content: string;

  /** The role of the sender. */
  role: 'user' | 'assistant' | 'system';

  /** The agent involved, if any. */
  agentId?: string;
}

/**
 * Payload for WebSocket status update messages.
 */
export interface WebSocketStatusPayload {
  /** The agent whose status changed. */
  agentId: string;

  /** The new status. */
  status: 'online' | 'offline' | 'busy';

  /** ISO 8601 timestamp of the status change. */
  timestamp: string;
}

/**
 * Payload for WebSocket error messages.
 */
export interface WebSocketErrorPayload {
  /** Machine-readable error code. */
  code: string;

  /** Human-readable error description. */
  message: string;
}

/**
 * Payload for WebSocket heartbeat messages.
 */
export interface WebSocketHeartbeatPayload {
  /** ISO 8601 timestamp of the heartbeat. */
  timestamp: string;
}
