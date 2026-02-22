'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebSocketMessage } from '@/types';

/**
 * Possible states for the WebSocket connection.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * Configuration options for the useWebSocket hook.
 */
export interface UseWebSocketOptions {
  /** The WebSocket server URL. Defaults to NEXT_PUBLIC_WS_URL env var. */
  url?: string;

  /** Maximum number of automatic reconnect attempts (default 10). */
  maxReconnectAttempts?: number;

  /** Heartbeat interval in milliseconds (default 30_000). */
  heartbeatIntervalMs?: number;

  /** Whether to connect automatically on mount (default true). */
  autoConnect?: boolean;

  /** Callback fired when the connection opens. */
  onOpen?: () => void;

  /** Callback fired when a message is received. */
  onMessage?: (message: WebSocketMessage) => void;

  /** Callback fired when the connection closes. */
  onClose?: (event: CloseEvent) => void;

  /** Callback fired on connection errors. */
  onError?: (event: Event) => void;
}

/**
 * Return value of the useWebSocket hook.
 */
export interface UseWebSocketReturn {
  /** Current connection status. */
  connectionStatus: ConnectionStatus;

  /** Send a structured WebSocket message to the server. */
  sendMessage: (message: WebSocketMessage) => void;

  /** The last message received from the server, parsed as JSON. */
  lastMessage: WebSocketMessage | null;

  /** Manually trigger a reconnect (resets the attempt counter). */
  reconnect: () => void;
}

/** Base delay for exponential backoff in milliseconds. */
const BASE_RECONNECT_DELAY_MS = 1_000;
/** Maximum delay between reconnect attempts. */
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Build the default WebSocket URL from the Next.js environment variable.
 * Falls back to a sensible localhost default if the env var is unset.
 */
function getDefaultUrl(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  return 'ws://localhost:8001/ws';
}

/**
 * Generate a simple client ID for this browser tab.
 *
 * Uses crypto.randomUUID when available (all modern browsers), with a
 * Math.random fallback for environments that lack it (e.g. older test
 * runtimes).
 */
function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * React hook for managing a WebSocket connection with auto-reconnect,
 * heartbeat keep-alive, and JSON message serialization.
 *
 * Usage:
 * ```tsx
 * const { connectionStatus, sendMessage, lastMessage, reconnect } =
 *   useWebSocket({ onMessage: (msg) => console.log(msg) });
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url,
    maxReconnectAttempts = 10,
    heartbeatIntervalMs = 30_000,
    autoConnect = true,
    onOpen,
    onMessage,
    onClose,
    onError,
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  // Refs survive re-renders without triggering them.
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clientIdRef = useRef<string>(generateClientId());
  const mountedRef = useRef(true);
  // Keep a stable ref to the latest callbacks so we never re-create the socket
  // just because a callback identity changed.
  const callbacksRef = useRef({ onOpen, onMessage, onClose, onError });
  callbacksRef.current = { onOpen, onMessage, onClose, onError };

  /**
   * Compute the backoff delay for the current reconnect attempt.
   * Uses exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s.
   */
  const getReconnectDelay = useCallback((): number => {
    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current);
    return Math.min(delay, MAX_RECONNECT_DELAY_MS);
  }, []);

  /** Clear heartbeat interval. */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  /** Start sending periodic heartbeat pings. */
  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const heartbeat: WebSocketMessage = {
          type: 'heartbeat',
          payload: { timestamp: new Date().toISOString() },
        };
        wsRef.current.send(JSON.stringify(heartbeat));
      }
    }, heartbeatIntervalMs);
  }, [heartbeatIntervalMs, stopHeartbeat]);

  /** Cancel any pending reconnect timer. */
  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  /**
   * Core connection logic. Opens a new WebSocket and wires up event handlers.
   * Designed to be called both for the initial connection and for reconnects.
   */
  const connect = useCallback(() => {
    // Do not connect if already open or connecting
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const baseUrl = url ?? getDefaultUrl();
    // Append the client ID to the URL path
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${clientIdRef.current}`;

    setConnectionStatus('connecting');

    const ws = new WebSocket(fullUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      reconnectAttemptsRef.current = 0;
      setConnectionStatus('connected');
      startHeartbeat();
      callbacksRef.current.onOpen?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data as string) as WebSocketMessage;
        setLastMessage(parsed);
        callbacksRef.current.onMessage?.(parsed);
      } catch {
        // Non-JSON messages are silently ignored to prevent UI crashes.
      }
    };

    ws.onclose = (event: CloseEvent) => {
      if (!mountedRef.current) return;
      stopHeartbeat();
      setConnectionStatus('disconnected');
      callbacksRef.current.onClose?.(event);

      // Attempt reconnect for abnormal closures
      if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = getReconnectDelay();
        reconnectAttemptsRef.current += 1;
        setConnectionStatus('reconnecting');
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, delay);
      }
    };

    ws.onerror = (event: Event) => {
      if (!mountedRef.current) return;
      callbacksRef.current.onError?.(event);
    };
  }, [url, maxReconnectAttempts, startHeartbeat, stopHeartbeat, getReconnectDelay]);

  /**
   * Send a structured WebSocketMessage. Silently drops messages if the
   * socket is not in OPEN state to prevent runtime errors.
   */
  const sendMessage = useCallback((message: WebSocketMessage): void => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  /**
   * Manually reconnect: close the existing socket, reset the attempt
   * counter, and establish a fresh connection.
   */
  const reconnect = useCallback((): void => {
    cancelReconnect();
    stopHeartbeat();
    reconnectAttemptsRef.current = 0;
    if (wsRef.current) {
      // Close with normal code so auto-reconnect does not trigger
      wsRef.current.onclose = null;
      wsRef.current.close(1000, 'Manual reconnect');
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
    connect();
  }, [cancelReconnect, stopHeartbeat, connect]);

  // Connect on mount (if autoConnect is true), clean up on unmount.
  useEffect(() => {
    mountedRef.current = true;
    if (autoConnect) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      cancelReconnect();
      stopHeartbeat();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connectionStatus, sendMessage, lastMessage, reconnect };
}
