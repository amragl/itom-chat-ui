'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders markdown DOCUMENT artifacts with proper typography.
 *
 * Uses react-markdown with GitHub Flavored Markdown support for rendering
 * tables, task lists, strikethrough, and autolinks within documents.
 */

interface DocumentViewerProps {
  /** The document content -- either a markdown string or a JSON object. */
  content: string | Record<string, unknown>;
}

export default function DocumentViewer({ content }: DocumentViewerProps) {
  const markdownContent = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);

  return (
    <article
      className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-neutral-800 dark:prose-headings:text-neutral-200 prose-p:text-neutral-600 dark:prose-p:text-neutral-400 prose-strong:text-neutral-800 dark:prose-strong:text-neutral-200 prose-code:rounded prose-code:bg-neutral-100 prose-code:px-1 prose-code:py-0.5 dark:prose-code:bg-neutral-700 prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-a:text-primary-600 dark:prose-a:text-primary-400"
      role="document"
      aria-label="Document"
    >
      <Markdown remarkPlugins={[remarkGfm]}>{markdownContent}</Markdown>
    </article>
  );
}
