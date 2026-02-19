'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import MermaidDiagram from './MermaidDiagram';
import type { Message } from '@/types';

// ---------------------------------------------------------------------------
// Agent display helpers
// ---------------------------------------------------------------------------

/**
 * Maps an agentId to a human-readable display name.
 * When the message has no agentId, falls back to a generic label.
 */
function getAgentDisplayName(agentId: string | undefined): string {
  if (!agentId) return 'ITOM Agent';

  const names: Record<string, string> = {
    discovery: 'Discovery Agent',
    asset: 'Asset Agent',
    auditor: 'Auditor Agent',
    documentator: 'Documentator Agent',
    orchestrator: 'Orchestrator',
  };

  return names[agentId] ?? agentId;
}

/**
 * Returns the initials for an agent avatar based on agentId.
 */
function getAgentInitials(agentId: string | undefined): string {
  if (!agentId) return 'AI';

  const initials: Record<string, string> = {
    discovery: 'DI',
    asset: 'AS',
    auditor: 'AU',
    documentator: 'DO',
    orchestrator: 'OR',
  };

  return initials[agentId] ?? agentId.slice(0, 2).toUpperCase();
}

/**
 * Returns a Tailwind background color class for an agent avatar based on agentId.
 * Each agent gets a distinct color for visual differentiation.
 */
function getAgentAvatarColor(agentId: string | undefined): string {
  if (!agentId) return 'bg-neutral-500';

  const colors: Record<string, string> = {
    discovery: 'bg-primary-600',
    asset: 'bg-secondary-600',
    auditor: 'bg-error-600',
    documentator: 'bg-accent-600',
    orchestrator: 'bg-success-600',
  };

  return colors[agentId] ?? 'bg-neutral-500';
}

/**
 * Formats an ISO 8601 timestamp into a human-readable time string.
 * Shows time in the user's local timezone (e.g., "2:30 PM").
 */
function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Markdown code block renderer — renders mermaid blocks as diagrams
// ---------------------------------------------------------------------------

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const language = /language-(\w+)/.exec(className ?? '')?.[1];
    const code = String(children).replace(/\n$/, '');

    if (language === 'mermaid') {
      return <MermaidDiagram chart={code} />;
    }

    // Inline code (no className) vs fenced code block
    const isBlock = className != null;
    if (isBlock) {
      return (
        <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-3 dark:bg-neutral-700">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    }

    return (
      <code
        className="rounded bg-neutral-100 px-1 py-0.5 text-sm dark:bg-neutral-700"
        {...props}
      >
        {children}
      </code>
    );
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatBubbleProps {
  /** The message to render. */
  message: Message;
  /** Whether this message is currently being streamed (token-by-token). */
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// ChatBubble component
// ---------------------------------------------------------------------------

/**
 * ChatBubble renders a single message within the chat conversation.
 *
 * User messages are right-aligned with a primary color background.
 * Agent/assistant messages are left-aligned with a neutral background,
 * and include an avatar, agent name label, and timestamp.
 * System messages are centered with a subtle style.
 *
 * Message content is rendered as markdown using react-markdown with
 * GitHub Flavored Markdown support (tables, strikethrough, task lists, etc.).
 */
export default function ChatBubble({ message, isStreaming = false }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // System messages render as centered, subtle notices
  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="max-w-md rounded-lg bg-neutral-100 px-4 py-2 text-center text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</Markdown>
        </div>
      </div>
    );
  }

  // User messages: right-aligned, primary color
  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[75%] lg:max-w-[60%]">
          <div className="rounded-2xl rounded-br-md bg-primary-600 px-4 py-2.5 text-white shadow-sm">
            <div className="prose prose-sm prose-invert max-w-none break-words [&_a]:text-primary-200 [&_a]:underline [&_code]:rounded [&_code]:bg-primary-700 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-primary-100 [&_p]:m-0 [&_p]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-primary-700 [&_pre]:p-3">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</Markdown>
            </div>
          </div>
          <div className="mt-1 flex justify-end">
            <time
              dateTime={message.timestamp}
              className="text-xs text-neutral-400 dark:text-neutral-500"
            >
              {formatTimestamp(message.timestamp)}
            </time>
          </div>
        </div>
      </div>
    );
  }

  // Agent/assistant messages: left-aligned, neutral color, with avatar
  const agentName = getAgentDisplayName(message.agentId);
  const agentInitials = getAgentInitials(message.agentId);
  const avatarColor = getAgentAvatarColor(message.agentId);

  return (
    <div className="flex gap-3 px-4 py-1.5">
      {/* Agent avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor}`}
        aria-hidden="true"
      >
        {agentInitials}
      </div>

      <div className="max-w-[75%] lg:max-w-[60%]">
        {/* Agent name label */}
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            {agentName}
          </span>
          {isStreaming && (
            <span className="inline-flex items-center gap-0.5 text-xs text-primary-500">
              <span className="animate-pulse">typing</span>
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary-500 [animation-delay:0ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary-500 [animation-delay:150ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary-500 [animation-delay:300ms]" />
              </span>
            </span>
          )}
        </div>

        {/* Message content */}
        <div className="rounded-2xl rounded-tl-md border border-neutral-200 bg-white px-4 py-2.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
          <div className="prose prose-sm max-w-none break-words text-neutral-800 dark:text-neutral-200 [&_a]:text-primary-600 [&_a]:underline dark:[&_a]:text-primary-400 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm dark:[&_code]:bg-neutral-700 [&_p]:m-0 [&_p]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-neutral-100 [&_pre]:p-3 dark:[&_pre]:bg-neutral-700 [&_table]:w-full [&_td]:border [&_td]:border-neutral-200 [&_td]:px-2 [&_td]:py-1 dark:[&_td]:border-neutral-600 [&_th]:border [&_th]:border-neutral-200 [&_th]:bg-neutral-50 [&_th]:px-2 [&_th]:py-1 dark:[&_th]:border-neutral-600 dark:[&_th]:bg-neutral-700">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</Markdown>
          </div>
        </div>

        {/* Timestamp */}
        <div className="mt-1">
          <time
            dateTime={message.timestamp}
            className="text-xs text-neutral-400 dark:text-neutral-500"
          >
            {formatTimestamp(message.timestamp)}
          </time>
        </div>
      </div>
    </div>
  );
}
