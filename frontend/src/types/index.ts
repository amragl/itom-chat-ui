/**
 * Shared TypeScript type definitions for the ITOM Chat UI.
 *
 * Import from "@/types" to access all types:
 *   import type { Message, Conversation, Agent } from "@/types";
 */

export type { Message, MessageRole, SendMessagePayload, SendMessageResponse } from './message';
export type { Conversation, ConversationSummary, CreateConversationPayload } from './conversation';
export type { Agent, AgentStatus, AgentDomain } from './agent';
export type { Artifact, ArtifactType, ArtifactMetadata } from './artifact';
export type { HealthStatus } from './health';
export type {
  WebSocketMessage,
  WebSocketMessageType,
  WebSocketChatPayload,
  WebSocketStatusPayload,
  WebSocketErrorPayload,
  WebSocketHeartbeatPayload,
} from './websocket';
export type { ServiceNowUser, ServiceNowRoles } from './auth';
export type {
  StreamEventType,
  StreamStartData,
  TokenData,
  StreamEndData,
  StreamErrorData,
  ClarificationData,
  StreamEvent,
  StreamingStatus,
  StreamingState,
} from './streaming';
