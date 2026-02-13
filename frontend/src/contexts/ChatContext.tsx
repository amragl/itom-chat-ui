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
import type { Agent, Message, WebSocketChatPayload, WebSocketMessage } from '@/types';
import { apiClient } from '@/lib/api';
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

  /** The currently selected agent ID. Null means auto-routing (orchestrator decides). */
  selectedAgentId: string | null;

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
}

/**
 * Actions available from the ChatProvider.
 */
export interface ChatActions {
  /** Send a message in the current conversation using streaming. */
  sendMessage: (content: string) => void;

  /** Select a different agent for message routing. */
  selectAgent: (agentId: string | null) => void;

  /** Start a new conversation (clears messages, generates new ID). */
  startNewConversation: () => void;

  /** Load an existing conversation by ID. */
  loadConversation: (conversationId: string) => Promise<void>;

  /** Clear any displayed error. */
  clearError: () => void;
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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    (fullContent: string, messageId: string, agentId: string) => {
      // When streaming completes, add the final agent message to the
      // messages array. The hook itself transitions to 'complete' status.
      const finalMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
        agentId: agentId || undefined,
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

  // --- Streaming response hook ---
  const {
    state: streamingState,
    startStreaming,
    abortStreaming,
    resetState: resetStreamingState,
  } = useStreamingResponse({
    onStreamEnd: handleStreamEnd,
    onError: handleStreamError,
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

  const sendMessage = useCallback(
    (content: string) => {
      if (!conversationIdRef.current || isLoading || isStreaming) return;

      const convId = conversationIdRef.current;

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

      // Start the streaming request
      const agentTarget =
        selectedAgentId === 'auto' ? undefined : selectedAgentId ?? undefined;
      startStreaming(content, convId, agentTarget);
      setIsLoading(false);
    },
    [isLoading, isStreaming, selectedAgentId, startStreaming, wsSendMessage],
  );

  const selectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
  }, []);

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
      if (conversation.agentId) {
        setSelectedAgentId(conversation.agentId);
      }
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
      selectedAgentId,
      agents,
      connectionStatus,
      error,
      streamingMessage,
    }),
    [
      conversationId,
      messages,
      isLoading,
      isStreaming,
      selectedAgentId,
      agents,
      connectionStatus,
      error,
      streamingMessage,
    ],
  );

  const actionsValue = useMemo<ChatActions>(
    () => ({
      sendMessage,
      selectAgent,
      startNewConversation,
      loadConversation,
      clearError,
    }),
    [sendMessage, selectAgent, startNewConversation, loadConversation, clearError],
  );

  return (
    <ChatStateContext.Provider value={stateValue}>
      <ChatActionsContext.Provider value={actionsValue}>
        {children}
      </ChatActionsContext.Provider>
    </ChatStateContext.Provider>
  );
}
