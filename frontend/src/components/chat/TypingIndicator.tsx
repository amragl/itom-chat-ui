'use client';

/**
 * Props for the TypingIndicator component.
 */
interface TypingIndicatorProps {
  /** The display name of the agent that is typing. */
  agentName?: string;
}

/**
 * TypingIndicator renders an animated three-dot indicator that signals the
 * agent is processing and preparing a response.
 *
 * This component is displayed in the chat while waiting for the first token
 * from a streaming response. Once the first token arrives, this indicator
 * is replaced by the actual streaming content in the ChatBubble.
 *
 * The animation uses three bouncing dots with staggered delays to create
 * the classic "typing..." visual cue.
 */
export default function TypingIndicator({ agentName = 'Agent' }: TypingIndicatorProps) {
  return (
    <div className="flex gap-3 px-4 py-1.5" role="status" aria-label={`${agentName} is typing`}>
      {/* Agent avatar placeholder */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-400 text-xs font-bold text-white"
        aria-hidden="true"
      >
        AI
      </div>

      <div>
        {/* Agent name label */}
        <div className="mb-1">
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            {agentName}
          </span>
        </div>

        {/* Typing bubble with animated dots */}
        <div className="inline-flex items-center gap-1 rounded-2xl rounded-tl-md border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500"
            style={{ animationDelay: '0ms', animationDuration: '1.2s' }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500"
            style={{ animationDelay: '200ms', animationDuration: '1.2s' }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500"
            style={{ animationDelay: '400ms', animationDuration: '1.2s' }}
          />
          <span className="sr-only">{agentName} is typing a response</span>
        </div>
      </div>
    </div>
  );
}
