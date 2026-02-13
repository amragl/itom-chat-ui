'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Props and state
// ---------------------------------------------------------------------------

interface ChatErrorBoundaryProps {
  children: ReactNode;
}

interface ChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// ChatErrorBoundary component
// ---------------------------------------------------------------------------

/**
 * Error boundary for the chat interface.
 *
 * Catches uncaught JavaScript errors in the chat component tree and renders
 * a recovery UI instead of crashing the entire application. Provides a
 * "Try Again" button that resets the error state and re-mounts the children.
 *
 * This boundary is placed around the ChatPage content so that errors in
 * message rendering, streaming, or WebSocket handling do not propagate
 * beyond the chat area.
 */
export default class ChatErrorBoundary extends Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error for debugging. In production, this would send to an
    // error reporting service.
    console.error('[ChatErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 py-12">
          <div className="flex max-w-md flex-col items-center text-center">
            {/* Error icon */}
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-error-100 dark:bg-error-900/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-7 w-7 text-error-600 dark:text-error-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>

            <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              The chat interface encountered an unexpected error. Your messages are safe. Click
              below to try again.
            </p>

            {this.state.error && (
              <details className="mt-4 w-full rounded-lg border border-neutral-200 p-3 text-left dark:border-neutral-700">
                <summary className="cursor-pointer text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Error details
                </summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                  {this.state.error.message}
                </pre>
              </details>
            )}

            <button
              type="button"
              onClick={this.handleReset}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 active:bg-primary-800"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                />
              </svg>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
