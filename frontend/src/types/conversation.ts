import type { Message } from "./message";

/**
 * A conversation between a user and one or more ITOM agents.
 *
 * Conversations persist across sessions and contain an ordered list of messages.
 * Each conversation may be associated with a specific agent or use auto-routing.
 */
export interface Conversation {
  /** Unique identifier for the conversation (UUID from the backend). */
  id: string;

  /** Display title for the conversation. Auto-generated from the first user message or set manually. */
  title: string;

  /** Ordered list of messages in this conversation, oldest first. */
  messages: Message[];

  /** ISO 8601 timestamp of when the conversation was created. */
  createdAt: string;

  /** ISO 8601 timestamp of the most recent activity in this conversation. */
  updatedAt: string;

  /** The default agent for this conversation. When set, messages route to this agent unless overridden. */
  agentId?: string;
}

/**
 * Summary of a conversation for display in lists (without full message history).
 */
export interface ConversationSummary {
  /** Unique identifier for the conversation. */
  id: string;

  /** Display title for the conversation. */
  title: string;

  /** ISO 8601 timestamp of when the conversation was created. */
  createdAt: string;

  /** ISO 8601 timestamp of the most recent activity. */
  updatedAt: string;

  /** The default agent for this conversation. */
  agentId?: string;

  /** Total number of messages in this conversation. */
  messageCount: number;

  /** Preview of the last message content, truncated. */
  lastMessagePreview?: string;
}

/**
 * Payload sent to the backend when creating a new conversation.
 */
export interface CreateConversationPayload {
  /** Optional title. If omitted, the backend auto-generates one from the first message. */
  title?: string;

  /** Optional default agent for the conversation. */
  agentId?: string;
}
