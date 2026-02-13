'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamErrorData, StreamingState, StreamingStatus } from '@/types';

/**
 * Options for configuring the streaming response hook.
 */
export interface UseStreamingResponseOptions {
  /** Base URL for the backend API. Defaults to NEXT_PUBLIC_API_URL or localhost. */
  apiBaseUrl?: string;

  /** Called when the stream starts and metadata is received. */
  onStreamStart?: (messageId: string, agentId: string) => void;

  /** Called for each token as it arrives. */
  onToken?: (token: string, accumulated: string) => void;

  /** Called when the stream completes with the full content. */
  onStreamEnd?: (fullContent: string, messageId: string, agentId: string) => void;

  /** Called when an error occurs during streaming. */
  onError?: (error: StreamErrorData) => void;
}

/**
 * Return value of the useStreamingResponse hook.
 */
export interface UseStreamingResponseReturn {
  /** Current streaming state (status, partial content, error, etc.). */
  state: StreamingState;

  /** Initiate a streaming chat request. */
  startStreaming: (content: string, conversationId: string, agentTarget?: string) => void;

  /** Abort the current streaming request. */
  abortStreaming: () => void;

  /** Reset the streaming state back to idle. */
  resetState: () => void;
}

const INITIAL_STATE: StreamingState = {
  status: 'idle',
  partialContent: '',
  fullContent: null,
  messageId: null,
  agentId: null,
  error: null,
  hasReceivedFirstToken: false,
};

/**
 * Resolve the API base URL from environment or option override.
 */
function resolveApiBaseUrl(override?: string): string {
  if (override) return override;
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return 'http://localhost:8000';
}

/**
 * React hook for consuming a streaming chat response from the backend
 * ``POST /api/chat/stream`` SSE endpoint.
 *
 * This hook manages the full lifecycle of a streaming interaction:
 * 1. Sends the user message to the streaming endpoint via ``fetch``.
 * 2. Reads the response as a ``ReadableStream`` and parses SSE events.
 * 3. Accumulates tokens into ``partialContent`` which grows in real time.
 * 4. Exposes the final ``fullContent`` once the stream completes.
 * 5. Handles errors and stream interruption gracefully.
 *
 * Usage:
 * ```tsx
 * const { state, startStreaming, abortStreaming } = useStreamingResponse({
 *   onToken: (token, accumulated) => console.log('Partial:', accumulated),
 *   onStreamEnd: (full) => console.log('Done:', full),
 * });
 * ```
 */
export function useStreamingResponse(
  options: UseStreamingResponseOptions = {},
): UseStreamingResponseReturn {
  const { apiBaseUrl, onStreamStart, onToken, onStreamEnd, onError } = options;

  const [state, setState] = useState<StreamingState>(INITIAL_STATE);

  // Refs for the AbortController and latest callback references
  const abortControllerRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef({ onStreamStart, onToken, onStreamEnd, onError });
  useEffect(() => {
    callbacksRef.current = { onStreamStart, onToken, onStreamEnd, onError };
  }, [onStreamStart, onToken, onStreamEnd, onError]);

  /**
   * Parse a single SSE "data: ..." line into a structured event.
   */
  const parseSSELine = useCallback(
    (line: string): { event: string; data: Record<string, unknown> } | null => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) return null;

      const jsonStr = trimmed.slice(6); // Remove "data: " prefix
      try {
        const parsed = JSON.parse(jsonStr) as { event: string; data: Record<string, unknown> };
        return parsed;
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * Abort the current streaming request if one is in progress.
   */
  const abortStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => {
      if (prev.status === 'streaming' || prev.status === 'connecting') {
        return {
          ...prev,
          status: 'error' as StreamingStatus,
          error: {
            code: 'STREAM_ABORTED',
            message: 'Streaming was cancelled by the user.',
          },
        };
      }
      return prev;
    });
  }, []);

  /**
   * Reset the streaming state back to idle.
   */
  const resetState = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(INITIAL_STATE);
  }, []);

  /**
   * Initiate a streaming chat request.
   *
   * Uses the Fetch API with ReadableStream to consume SSE events. This
   * approach works in all modern browsers and does not require EventSource
   * (which only supports GET requests).
   */
  const startStreaming = useCallback(
    (content: string, conversationId: string, agentTarget?: string) => {
      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const baseUrl = resolveApiBaseUrl(apiBaseUrl);
      const url = `${baseUrl}/api/chat/stream`;

      // Transition to connecting state
      setState({
        ...INITIAL_STATE,
        status: 'connecting',
      });

      // Track accumulated content in a local variable for synchronous access
      // within the stream reader (avoids stale closure issues with setState).
      let accumulated = '';

      const body = JSON.stringify({
        content,
        conversation_id: conversationId,
        agent_target: agentTarget ?? null,
      });

      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body,
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            let errorMessage = `Server returned HTTP ${response.status}`;
            try {
              const errorBody = (await response.json()) as { detail?: string };
              if (errorBody.detail) {
                errorMessage = String(errorBody.detail);
              }
            } catch {
              // Body was not JSON; use the default message
            }

            const errorData: StreamErrorData = {
              code: 'HTTP_ERROR',
              message: errorMessage,
            };
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: errorData,
            }));
            callbacksRef.current.onError?.(errorData);
            return;
          }

          if (!response.body) {
            const errorData: StreamErrorData = {
              code: 'NO_RESPONSE_BODY',
              message: 'Server returned an empty response body.',
            };
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: errorData,
            }));
            callbacksRef.current.onError?.(errorData);
            return;
          }

          // Read the response stream
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // SSE events are separated by double newlines
            const events = buffer.split('\n\n');
            // Keep the last incomplete chunk in the buffer
            buffer = events.pop() ?? '';

            for (const eventStr of events) {
              const parsed = parseSSELine(eventStr);
              if (!parsed) continue;

              const { event, data } = parsed;

              switch (event) {
                case 'stream_start': {
                  const messageId = String(data.message_id ?? '');
                  const agentId = String(data.agent_id ?? '');
                  setState((prev) => ({
                    ...prev,
                    status: 'streaming',
                    messageId,
                    agentId,
                  }));
                  callbacksRef.current.onStreamStart?.(messageId, agentId);
                  break;
                }

                case 'token': {
                  const token = String(data.token ?? '');
                  accumulated += token;
                  const currentAccumulated = accumulated;
                  setState((prev) => ({
                    ...prev,
                    status: 'streaming',
                    partialContent: currentAccumulated,
                    hasReceivedFirstToken: true,
                  }));
                  callbacksRef.current.onToken?.(token, currentAccumulated);
                  break;
                }

                case 'stream_end': {
                  const fullContent = String(data.full_content ?? accumulated);
                  const messageId = String(data.message_id ?? '');
                  const agentId = String(data.agent_id ?? '');
                  setState((prev) => ({
                    ...prev,
                    status: 'complete',
                    partialContent: fullContent,
                    fullContent,
                    messageId: messageId || prev.messageId,
                    agentId: agentId || prev.agentId,
                  }));
                  callbacksRef.current.onStreamEnd?.(fullContent, messageId, agentId);
                  break;
                }

                case 'error': {
                  const errorData: StreamErrorData = {
                    code: String(data.code ?? 'UNKNOWN_ERROR'),
                    message: String(data.message ?? 'An unknown error occurred.'),
                  };
                  setState((prev) => ({
                    ...prev,
                    status: 'error',
                    error: errorData,
                  }));
                  callbacksRef.current.onError?.(errorData);
                  break;
                }

                default:
                  // Unknown event type -- ignore silently
                  break;
              }
            }
          }

          // If we exited the loop without a stream_end event, mark as complete
          // with whatever content we accumulated (graceful degradation).
          setState((prev) => {
            if (prev.status === 'streaming') {
              return {
                ...prev,
                status: 'complete',
                fullContent: accumulated || prev.partialContent,
              };
            }
            return prev;
          });
        })
        .catch((err: unknown) => {
          // AbortError is expected when the user cancels
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }

          const errorData: StreamErrorData = {
            code: 'NETWORK_ERROR',
            message:
              err instanceof Error
                ? err.message
                : 'A network error occurred while streaming.',
          };
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: errorData,
          }));
          callbacksRef.current.onError?.(errorData);
        });
    },
    [apiBaseUrl, parseSSELine],
  );

  return { state, startStreaming, abortStreaming, resetState };
}
