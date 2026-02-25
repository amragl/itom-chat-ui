'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Agent, Artifact, ClarificationData, Message, SuggestedAction, WebSocketChatPayload, WebSocketMessage } from '@/types';
import { apiClient, getStreamAuthHeaders } from '@/lib/api';
import { buildHelpText, buildPrompt, parseCommand } from '@/lib/commands';
import { useStreamingResponse } from '@/hooks/useStreamingResponse';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { ConnectionStatus } from '@/hooks/useWebSocket';

// ---------------------------------------------------------------------------
// Chat state types
// ---------------------------------------------------------------------------

/**
 * The shape of the chat state managed by the ChatProvider.
 */
export interface ChatState {
  /** The active conversation ID. Null when no conversation is active. */
  conversationId: string | null;

  /** Messages in the current conversation, ordered chronologically. */
  messages: Message[];

  /** Whether a response is being loaded (non-streaming request in flight). */
  isLoading: boolean;

  /** Whether a streaming response is currently in progress. */
  isStreaming: boolean;

  /** Available ITOM agents fetched from the backend. */
  agents: Agent[];

  /** WebSocket connection status for real-time sync. */
  connectionStatus: ConnectionStatus;

  /** Error message to display, if any. Cleared on next action. */
  error: string | null;

  /**
   * The partial message currently being streamed, for rendering in the
   * MessageList. Null when not streaming or before the first token arrives.
   */
  streamingMessage: Partial<Message> | null;

  /**
   * Active clarification request from the orchestrator.
   * Non-null when the assistant is waiting for the user to choose a domain.
   */
  clarification: { question: string; options: string[]; pendingToken: string } | null;
}

/**
 * Actions available from the ChatProvider.
 */
export interface ChatActions {
  /** Send a message in the current conversation using streaming. */
  sendMessage: (content: string, agentTarget?: string) => void;

  /** Start a new conversation (clears messages, generates new ID). */
  startNewConversation: () => void;

  /** Load an existing conversation by ID. */
  loadConversation: (conversationId: string) => Promise<void>;

  /** Clear any displayed error. */
  clearError: () => void;

  /**
   * Submit the user's answer to a clarification question.
   * Calls POST /api/chat/clarify and streams the resolved response.
   */
  respondToClarification: (answer: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ChatStateContext = createContext<ChatState | null>(null);
const ChatActionsContext = createContext<ChatActions | null>(null);

// ---------------------------------------------------------------------------
// Hook accessors
// ---------------------------------------------------------------------------

/**
 * Access the current chat state. Must be used within a ChatProvider.
 */
export function useChatState(): ChatState {
  const ctx = useContext(ChatStateContext);
  if (ctx === null) {
    throw new Error('useChatState must be used within a ChatProvider');
  }
  return ctx;
}

/**
 * Access the chat actions. Must be used within a ChatProvider.
 */
export function useChatActions(): ChatActions {
  const ctx = useContext(ChatActionsContext);
  if (ctx === null) {
    throw new Error('useChatActions must be used within a ChatProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface ChatProviderProps {
  children: React.ReactNode;
}

/**
 * ChatProvider manages the entire chat state and provides it to the component
 * tree via React context.
 *
 * State managed:
 * - Active conversation (ID and messages)
 * - Loading and streaming states
 * - Selected agent for routing
 * - Available agents list
 * - WebSocket connection for real-time sync across tabs
 * - Error state
 *
 * The provider composes the useStreamingResponse and useWebSocket hooks
 * internally. Child components access state and actions via useChatState()
 * and useChatActions().
 */
export function ChatProvider({ children }: ChatProviderProps) {
  // --- Core state ---
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<{
    question: string;
    options: string[];
    pendingToken: string;
  } | null>(null);

  // Ref to track the latest conversationId without triggering re-renders
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  // Ref for the clarification AbortController so we can clean up on unmount
  const clarifyAbortRef = useRef<AbortController | null>(null);

  // Ref to access messages without adding them to useCallback deps
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // --- Abort clarification on unmount ---
  useEffect(() => {
    return () => {
      clarifyAbortRef.current?.abort();
    };
  }, []);

  // --- Fetch agents on mount ---
  useEffect(() => {
    let cancelled = false;

    async function fetchAgents() {
      try {
        const agentList = await apiClient.listAgents();
        if (!cancelled) {
          setAgents(agentList);
        }
      } catch {
        // Agents will be fetched by AgentSelector independently as well.
        // Failing here is non-fatal; the selector has its own fallback.
      }
    }

    fetchAgents();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Streaming response callbacks ---
  // Defined before the hook to avoid circular dependency.
  const handleStreamEnd = useCallback(
    (fullContent: string, messageId: string, agentId: string, suggestedActions?: SuggestedAction[], artifacts?: Artifact[]) => {
      // When streaming completes, add the final agent message to the
      // messages array. The hook itself transitions to 'complete' status.
      const finalMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
        agentId: agentId || undefined,
        suggestedActions: suggestedActions?.length ? suggestedActions : undefined,
        artifacts: artifacts?.length ? artifacts : undefined,
      };
      setMessages((prev) => [...prev, finalMessage]);

      // Persist assistant message to backend (include artifacts in metadata)
      const convId = conversationIdRef.current;
      if (convId) {
        const meta = artifacts?.length ? { artifacts } : undefined;
        apiClient.addMessage(convId, 'assistant', fullContent, agentId || undefined, meta).catch(console.error);
      }
    },
    [],
  );

  const handleStreamError = useCallback(
    (err: { code: string; message: string }) => {
      setError(`Stream error (${err.code}): ${err.message}`);
      setIsLoading(false);
    },
    [],
  );

  const handleClarification = useCallback(
    (data: ClarificationData) => {
      setClarification({
        question: data.question,
        options: data.options,
        pendingToken: data.pending_message_token,
      });
    },
    [],
  );

  // --- Streaming response hook ---
  const {
    state: streamingState,
    startStreaming,
    abortStreaming,
    resetState: resetStreamingState,
  } = useStreamingResponse({
    onStreamEnd: handleStreamEnd,
    onError: handleStreamError,
    onClarification: handleClarification,
  });

  const isStreaming =
    streamingState.status === 'connecting' || streamingState.status === 'streaming';

  // Build a partial Message from the streaming state for the MessageList.
  const streamingMessage: Partial<Message> | null = useMemo(() => {
    if (streamingState.status === 'idle' || streamingState.status === 'complete') {
      return null;
    }
    if (streamingState.status === 'connecting' || !streamingState.hasReceivedFirstToken) {
      // Show an empty partial to trigger the typing indicator in MessageList
      return {
        id: streamingState.messageId ?? '__streaming__',
        role: 'assistant' as const,
        content: '',
        agentId: streamingState.agentId ?? undefined,
      };
    }
    if (streamingState.partialContent) {
      return {
        id: streamingState.messageId ?? '__streaming__',
        role: 'assistant' as const,
        content: streamingState.partialContent,
        timestamp: new Date().toISOString(),
        agentId: streamingState.agentId ?? undefined,
      };
    }
    return null;
  }, [streamingState]);

  // --- WebSocket hook for real-time cross-tab sync ---
  const { connectionStatus, sendMessage: wsSendMessage } = useWebSocket({
    onMessage: useCallback(
      (wsMsg: WebSocketMessage) => {
        // Handle incoming chat messages from other tabs
        if (wsMsg.type === 'chat') {
          const payload = wsMsg.payload as WebSocketChatPayload;

          // Only process messages for our active conversation
          if (
            payload.conversationId === conversationIdRef.current &&
            payload.role === 'assistant'
          ) {
            // Check if we already have this message (dedup by content and recency)
            setMessages((prev) => {
              const now = Date.now();
              const isDuplicate = prev.some(
                (m) =>
                  m.content === payload.content &&
                  m.role === payload.role &&
                  now - new Date(m.timestamp).getTime() < 5000,
              );
              if (isDuplicate) return prev;

              const newMsg: Message = {
                id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                role: payload.role,
                content: payload.content,
                timestamp: new Date().toISOString(),
                agentId: payload.agentId,
              };
              return [...prev, newMsg];
            });
          }
        }
      },
      [],
    ),
  });

  // --- Actions ---

  const respondToClarification = useCallback(
    (answer: string) => {
      if (!clarification || !conversationIdRef.current) return;
      const convId = conversationIdRef.current;

      // Clear the clarification bubble
      setClarification(null);
      setIsLoading(true);
      setError(null);

      // Show user's choice as a user message
      const userMessage: Message = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content: answer,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Stream from /api/chat/clarify endpoint
      const baseUrl =
        typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
          ? process.env.NEXT_PUBLIC_API_URL
          : 'http://localhost:8001';

      // Abort any in-flight clarification before starting a new one
      clarifyAbortRef.current?.abort();
      const controller = new AbortController();
      clarifyAbortRef.current = controller;

      getStreamAuthHeaders()
        .then((headers) =>
          fetch(`${baseUrl}/api/chat/clarify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              pending_message_token: clarification.pendingToken,
              clarification_answer: answer,
              conversation_id: convId,
            }),
            signal: controller.signal,
          }),
        )
        .then(async (response) => {
          if (!response.ok || !response.body) {
            setError('Failed to resolve clarification.');
            setIsLoading(false);
            return;
          }
          // Parse SSE directly (startStreaming targets /api/chat/stream, not /api/chat/clarify)
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullContent = '';
          let clarifyArtifacts: Artifact[] | undefined;
          let clarifySuggestedActions: SuggestedAction[] | undefined;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';
            for (const eventStr of events) {
              for (const line of eventStr.split('\n')) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const parsed = JSON.parse(line.slice(6)) as { event: string; data: Record<string, unknown> };
                  if (parsed.event === 'token') {
                    fullContent += String(parsed.data.token ?? '');
                  } else if (parsed.event === 'stream_end') {
                    fullContent = String(parsed.data.full_content ?? fullContent);
                    if (Array.isArray(parsed.data.artifacts) && parsed.data.artifacts.length > 0) {
                      clarifyArtifacts = parsed.data.artifacts as Artifact[];
                    }
                    if (Array.isArray(parsed.data.suggested_actions) && parsed.data.suggested_actions.length > 0) {
                      clarifySuggestedActions = parsed.data.suggested_actions as SuggestedAction[];
                    }
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
          }

          if (fullContent) {
            const assistantMessage: Message = {
              id: `assist-${Date.now()}`,
              role: 'assistant',
              content: fullContent,
              timestamp: new Date().toISOString(),
              artifacts: clarifyArtifacts,
              suggestedActions: clarifySuggestedActions,
            };
            setMessages((prev) => [...prev, assistantMessage]);

            // Persist clarification response to backend
            if (convId) {
              const meta = clarifyArtifacts?.length ? { artifacts: clarifyArtifacts } : undefined;
              apiClient.addMessage(convId, 'assistant', fullContent, undefined, meta).catch(console.error);
            }
          }
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          // AbortError is expected on unmount or new clarification
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError('Network error during clarification.');
          setIsLoading(false);
        });
    },
    [clarification],
  );

  const sendMessage = useCallback(
    (content: string, agentTarget?: string) => {
      if (isLoading || isStreaming) return;

      // --- Slash command handling (works even without a conversation) ---
      const parsed = parseCommand(content);
      if (parsed) {
        const { command, args } = parsed;

        if (command.agentTarget === null) {
          if (command.name === '/clear') {
            setMessages([]);
            return;
          }
          if (command.name === '/help') {
            const helpMessage: Message = {
              id: `help-${Date.now()}`,
              role: 'assistant',
              content: buildHelpText(),
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, helpMessage]);
            return;
          }
          if (command.name === '/export') {
            const format = (args || 'json') as 'json' | 'text' | 'markdown';
            const convId = conversationIdRef.current;

            // Use the backend export endpoint when a conversation exists
            if (convId && (format === 'text' || format === 'markdown')) {
              apiClient.exportConversation(convId, format).then((result) => {
                const ext = format === 'markdown' ? 'md' : 'txt';
                const blob = new Blob([result.content], { type: result.contentType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `conversation-${convId}.${ext}`;
                a.click();
                URL.revokeObjectURL(url);
              }).catch(() => {
                setError('Failed to export conversation.');
              });
            } else {
              // JSON export: serialize local messages
              const data = JSON.stringify(
                messagesRef.current.map((m) => ({
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp,
                  agentId: m.agentId,
                })),
                null,
                2,
              );
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `conversation-${convId ?? 'new'}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }

            const exportMsg: Message = {
              id: `export-${Date.now()}`,
              role: 'assistant',
              content: `Conversation exported as ${format}.`,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, exportMsg]);
            return;
          }
        }
      }

      // --- Ensure a backend conversation exists ---
      setIsLoading(true);
      setError(null);

      const ensureConversation = async (): Promise<string> => {
        if (conversationIdRef.current) return conversationIdRef.current;
        const conv = await apiClient.createConversation({
          title: content.slice(0, 60) + (content.length > 60 ? '...' : ''),
        });
        setConversationId(conv.id);
        conversationIdRef.current = conv.id;
        return conv.id;
      };

      ensureConversation()
        .then((convId) => {
          // Add the user message to local state immediately
          const userMessage: Message = {
            id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, userMessage]);

          // Persist user message to backend (fire-and-forget)
          apiClient.addMessage(convId, 'user', content).catch(console.error);

          // Broadcast via WebSocket for cross-tab sync
          wsSendMessage({
            type: 'chat',
            payload: { conversationId: convId, content, role: 'user' },
          });

          // Determine what to stream
          if (parsed?.command.agentTarget) {
            const prompt = buildPrompt(parsed.command, parsed.args);
            startStreaming(prompt, convId, parsed.command.agentTarget);
          } else {
            startStreaming(content, convId, agentTarget);
          }

          setIsLoading(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to create conversation');
          setIsLoading(false);
        });
    },
    [isLoading, isStreaming, startStreaming, wsSendMessage],
  );

  const startNewConversation = useCallback(() => {
    abortStreaming();
    resetStreamingState();
    setMessages([]);
    setConversationId(null);
    setError(null);
    setIsLoading(false);
  }, [abortStreaming, resetStreamingState]);

  const loadConversation = useCallback(async (loadConvId: string) => {
    abortStreaming();
    resetStreamingState();
    setIsLoading(true);
    setError(null);

    try {
      const conversation = await apiClient.getConversation(loadConvId);
      setConversationId(conversation.id);
      // Map backend field names to frontend Message type.
      // snakeToCamel converts created_at → createdAt, but Message uses "timestamp".
      // Artifacts are stored in metadata.artifacts by the backend — lift them to top level.
      const mapped: Message[] = conversation.messages.map((m) => {
        const raw = m as unknown as Record<string, unknown>;
        const meta = raw.metadata as Record<string, unknown> | undefined;
        return {
          ...m,
          timestamp: m.timestamp ?? (raw.createdAt as string) ?? new Date().toISOString(),
          artifacts: m.artifacts ?? (meta?.artifacts as Artifact[] | undefined),
        };
      });
      setMessages(mapped);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load conversation';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [abortStreaming, resetStreamingState]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // --- Memoized context values ---

  const stateValue = useMemo<ChatState>(
    () => ({
      conversationId,
      messages,
      isLoading,
      isStreaming,
      agents,
      connectionStatus,
      error,
      streamingMessage,
      clarification,
    }),
    [
      conversationId,
      messages,
      isLoading,
      isStreaming,
      agents,
      connectionStatus,
      error,
      streamingMessage,
      clarification,
    ],
  );

  const actionsValue = useMemo<ChatActions>(
    () => ({
      sendMessage,
      startNewConversation,
      loadConversation,
      clearError,
      respondToClarification,
    }),
    [sendMessage, startNewConversation, loadConversation, clearError, respondToClarification],
  );

  return (
    <ChatStateContext.Provider value={stateValue}>
      <ChatActionsContext.Provider value={actionsValue}>
        {children}
      </ChatActionsContext.Provider>
    </ChatStateContext.Provider>
  );
}
