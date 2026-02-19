'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ClarificationBubbleProps {
  /** The question to present to the user. */
  question: string;

  /** Selectable option chips. */
  options: string[];

  /** Called when the user selects an option or submits free text. */
  onRespond: (answer: string) => void;
}

// ---------------------------------------------------------------------------
// ClarificationBubble component
// ---------------------------------------------------------------------------

/**
 * ClarificationBubble renders an amber-bordered card with a question,
 * clickable option chips, and a free-text fallback input.
 *
 * Displayed in the MessageList when the orchestrator cannot disambiguate
 * the user's query and requires additional context.
 *
 * Calling onRespond() clears the bubble and resumes the chat.
 */
export default function ClarificationBubble({
  question,
  options,
  onRespond,
}: ClarificationBubbleProps) {
  const [customInput, setCustomInput] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleOptionClick = (option: string) => {
    setSelectedOption(option);
    onRespond(option);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customInput.trim();
    if (!trimmed) return;
    onRespond(trimmed);
  };

  return (
    <div
      className="mx-4 my-2 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-700 dark:bg-amber-950/30"
      role="dialog"
      aria-label="Clarification needed"
    >
      {/* Icon + header */}
      <div className="mb-3 flex items-start gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500 dark:text-amber-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{question}</p>
      </div>

      {/* Option chips */}
      <div className="mb-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleOptionClick(option)}
            disabled={selectedOption !== null}
            className={[
              'rounded-full border px-3 py-1 text-sm font-medium transition-all',
              'focus:outline-none focus:ring-2 focus:ring-amber-400',
              selectedOption === option
                ? 'border-amber-500 bg-amber-500 text-white'
                : 'border-amber-300 bg-white text-amber-700 hover:border-amber-400 hover:bg-amber-100',
              'dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200',
              'dark:hover:border-amber-500 dark:hover:bg-amber-800/50',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {option}
          </button>
        ))}
      </div>

      {/* Free-text fallback */}
      <form onSubmit={handleCustomSubmit} className="flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Or type your answer..."
          disabled={selectedOption !== null}
          className={[
            'flex-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm',
            'placeholder:text-neutral-400 focus:border-amber-400 focus:outline-none',
            'focus:ring-1 focus:ring-amber-400',
            'dark:border-amber-700 dark:bg-neutral-900 dark:text-neutral-100',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={!customInput.trim() || selectedOption !== null}
          className={[
            'rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-sm',
            'font-medium text-amber-700 transition-colors',
            'hover:border-amber-400 hover:bg-amber-200',
            'focus:outline-none focus:ring-2 focus:ring-amber-400',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
          ].join(' ')}
        >
          Send
        </button>
      </form>
    </div>
  );
}
