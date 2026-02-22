import type { Artifact } from './artifact';
import type { SuggestedAction } from './streaming';

/**
 * The role of the entity that sent a message.
 * - "user" -- the human user
 * - "assistant" -- an ITOM agent responding
 * - "system" -- system-generated messages (e.g., status updates, errors)
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * A single chat message within a conversation.
 *
 * Messages flow between the user and ITOM agents. Each message is immutable
 * once created and belongs to exactly one conversation.
 */
export interface Message {
  /** Unique identifier for the message (UUID from the backend). */
  id: string;

  /** Who sent this message. */
  role: MessageRole;

  /** The text content of the message. May contain markdown. */
  content: string;

  /** ISO 8601 timestamp of when the message was created. */
  timestamp: string;

  /** The ID of the agent that sent or should receive this message. Absent for user messages when auto-routing. */
  agentId?: string;

  /** Structured artifacts embedded in or attached to this message (e.g., reports, dashboards). */
  artifacts?: Artifact[];

  /** Suggested follow-up actions displayed as pill buttons below agent responses. */
  suggestedActions?: SuggestedAction[];
}

/**
 * Payload sent to the backend when creating a new message.
 */
export interface SendMessagePayload {
  /** The text content of the message. */
  content: string;

  /** The conversation this message belongs to. */
  conversationId: string;

  /** Optional target agent. When omitted, the orchestrator decides routing. */
  agentTarget?: string;
}

/**
 * The response returned by the backend after sending a message.
 */
export interface SendMessageResponse {
  /** The user message as stored by the backend. */
  userMessage: Message;

  /** The agent's reply message. */
  assistantMessage: Message;
}
