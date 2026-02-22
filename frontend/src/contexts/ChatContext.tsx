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
import type { Agent, ClarificationData, Message, SuggestedAction, WebSocketChatPayload, WebSocketMessage } from '@/types';
import { apiClient } from '@/lib/api';
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
// Helper: generate a local conversation ID
// ---------------------------------------------------------------------------

function generateConversationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  const [conversationId, setConversationId] = useState<string | null>(
    () => generateConversationId(),
  );
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
    (fullContent: string, messageId: string, agentId: string, suggestedActions?: SuggestedAction[]) => {
      // When streaming completes, add the final agent message to the
      // messages array. The hook itself transitions to 'complete' status.
      const finalMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
        agentId: agentId || undefined,
        suggestedActions: suggestedActions?.length ? suggestedActions : undefined,
      };
      setMessages((prev) => [...prev, finalMessage]);
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
            // Check if we already have this message (dedup by content and timing)
            setMessages((prev) => {
              const isDuplicate = prev.some(
                (m) =>
                  m.content === payload.content &&
                  m.role === payload.role &&
                  Math.abs(
                    new Date(m.timestamp).getTime() - Date.now(),
                  ) < 5000,
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
          : 'http://localhost:8000';
      const controller = new AbortController();

      fetch(`${baseUrl}/api/chat/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          pending_message_token: clarification.pendingToken,
          clarification_answer: answer,
          conversation_id: convId,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            setError('Failed to resolve clarification.');
            setIsLoading(false);
            return;
          }
          // Re-use the same startStreaming mechanism by reading the stream manually.
          // For simplicity: hand off to startStreaming with a sentinel content.
          // Actually, startStreaming goes to /api/chat/stream not /api/chat/clarify,
          // so we parse the SSE here directly.
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullContent = '';

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
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
          setIsLoading(false);
        })
        .catch(() => {
          setError('Network error during clarification.');
          setIsLoading(false);
        });
    },
    [clarification],
  );

  const sendMessage = useCallback(
    (content: string, agentTarget?: string) => {
      if (!conversationIdRef.current || isLoading || isStreaming) return;

      const convId = conversationIdRef.current;

      // --- Slash command handling ---
      const parsed = parseCommand(content);
      if (parsed) {
        const { command, args } = parsed;

        // Client-side commands: handle locally without hitting the backend
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
            const format = args || 'json';
            const data = JSON.stringify(
              messages.map((m) => ({
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
            a.download = `conversation-${convId}.${format === 'json' ? 'json' : 'txt'}`;
            a.click();
            URL.revokeObjectURL(url);
            const exportMsg: Message = {
              id: `export-${Date.now()}`,
              role: 'assistant',
              content: `Conversation exported as ${format}.`,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, exportMsg]);
            return;
          }
          // Unknown client-side command — fall through to normal send
        }

        // Agent commands: transform to natural language and route to agent
        if (command.agentTarget) {
          const prompt = buildPrompt(command, args);

          // Show the original command as the user message
          const userMessage: Message = {
            id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, userMessage]);
          setIsLoading(true);
          setError(null);

          wsSendMessage({
            type: 'chat',
            payload: { conversationId: convId, content, role: 'user' },
          });

          // Route to the command's target agent
          startStreaming(prompt, convId, command.agentTarget);
          setIsLoading(false);
          return;
        }
      }

      // --- Normal message flow (no slash command) ---

      // Add the user message to the local message list immediately
      const userMessage: Message = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      // Broadcast the user message via WebSocket for cross-tab sync
      wsSendMessage({
        type: 'chat',
        payload: {
          conversationId: convId,
          content,
          role: 'user',
        },
      });

      // Start the streaming request — use explicit agent target if provided
      // (e.g. from suggested action pills that target a specific agent)
      startStreaming(content, convId, agentTarget);
      setIsLoading(false);
    },
    [isLoading, isStreaming, messages, startStreaming, wsSendMessage],
  );

  const startNewConversation = useCallback(() => {
    abortStreaming();
    resetStreamingState();
    setMessages([]);
    setConversationId(generateConversationId());
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
      setMessages(conversation.messages);
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
