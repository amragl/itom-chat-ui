import { getSession } from 'next-auth/react';
import type {
  Agent,
  Conversation,
  ConversationSummary,
  CreateConversationPayload,
  HealthStatus,
  Message,
  SendMessagePayload,
  SendMessageResponse,
} from '@/types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Base URL for the backend API.
 * Reads from the NEXT_PUBLIC_API_URL environment variable at build time.
 * Falls back to http://localhost:8000 for local development.
 */
const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Structured error thrown by the API client when a request fails.
 *
 * Provides the HTTP status code, a human-readable message, and optionally
 * the response body parsed as JSON for detailed backend error information.
 */
export class ApiError extends Error {
  /** HTTP status code from the response (e.g., 400, 404, 500). */
  public readonly status: number;

  /** The parsed JSON body from the error response, if available. */
  public readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Typed fetch wrapper that handles JSON serialization, error handling,
 * and base URL resolution.
 *
 * All API methods use this function internally. It ensures consistent
 * behavior across the client:
 * - Prepends the API base URL to relative paths
 * - Sets JSON content-type headers for request bodies
 * - Parses JSON responses with proper typing
 * - Throws ApiError with status and body on non-2xx responses
 *
 * @param path - The API path relative to the base URL (e.g., "/api/health").
 * @param options - Standard RequestInit options, extended with an optional typed body.
 * @returns The parsed JSON response body, typed as T.
 * @throws {ApiError} When the response status is not in the 2xx range.
 */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: HeadersInit = {
    Accept: 'application/json',
    ...options.headers,
  };

  // Add Content-Type for requests with a body
  if (options.body) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  // Attach ServiceNow access token from the Auth.js session (skip for health)
  if (!path.endsWith('/health')) {
    try {
      const session = await getSession();
      if (session?.accessToken) {
        (headers as Record<string, string>)['Authorization'] =
          `Bearer ${session.accessToken}`;
      }
    } catch {
      // Session fetch failed; proceed without token (backend will return 401)
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Response body is not JSON; leave body as undefined
    }

    const message =
      typeof body === 'object' && body !== null && 'detail' in body
        ? String((body as Record<string, unknown>).detail)
        : `API request failed: ${response.status} ${response.statusText}`;

    throw new ApiError(response.status, message, body);
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * Check the backend health status.
 *
 * Calls GET /api/health and returns the health response.
 */
export async function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>('/api/health');
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * List all conversations, ordered by most recently updated.
 *
 * Calls GET /api/conversations.
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  return apiFetch<ConversationSummary[]>('/api/conversations');
}

/**
 * Get a single conversation with its full message history.
 *
 * Calls GET /api/conversations/:id.
 *
 * @param id - The conversation UUID.
 */
export async function getConversation(id: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${encodeURIComponent(id)}`);
}

/**
 * Create a new conversation.
 *
 * Calls POST /api/conversations.
 *
 * @param payload - Optional title and agent assignment.
 * @returns The newly created conversation.
 */
export async function createConversation(
  payload: CreateConversationPayload = {},
): Promise<Conversation> {
  return apiFetch<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Delete a conversation and all its messages.
 *
 * Calls DELETE /api/conversations/:id.
 *
 * @param id - The conversation UUID to delete.
 */
export async function deleteConversation(id: string): Promise<void> {
  return apiFetch<void>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Send a message to an ITOM agent within a conversation.
 *
 * Calls POST /api/chat.
 *
 * @param payload - The message content, conversation ID, and optional agent target.
 * @returns Both the stored user message and the agent's response.
 */
export async function sendMessage(payload: SendMessagePayload): Promise<SendMessageResponse> {
  return apiFetch<SendMessageResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Get all messages in a conversation, ordered chronologically.
 *
 * Calls GET /api/conversations/:id/messages.
 *
 * @param conversationId - The conversation UUID.
 */
export async function getMessages(conversationId: string): Promise<Message[]> {
  return apiFetch<Message[]>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/**
 * List all available ITOM agents with their current status.
 *
 * Calls GET /api/agents.
 */
export async function listAgents(): Promise<Agent[]> {
  return apiFetch<Agent[]>('/api/agents');
}

/**
 * Get details for a specific ITOM agent.
 *
 * Calls GET /api/agents/:id.
 *
 * @param id - The agent identifier (e.g., "discovery", "auditor").
 */
export async function getAgent(id: string): Promise<Agent> {
  return apiFetch<Agent>(`/api/agents/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Exported client object
// ---------------------------------------------------------------------------

/**
 * The ITOM Chat API client.
 *
 * This is the single point of contact for all backend API calls.
 * All methods return typed responses and throw ApiError on failure.
 *
 * Usage:
 *   import { apiClient } from "@/lib/api";
 *   const health = await apiClient.getHealth();
 *   const agents = await apiClient.listAgents();
 */
export const apiClient = {
  // Health
  getHealth,

  // Conversations
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,

  // Messages
  sendMessage,
  getMessages,

  // Agents
  listAgents,
  getAgent,
} as const;
