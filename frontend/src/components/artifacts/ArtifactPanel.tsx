'use client';

import type { Artifact } from '@/types';
import DashboardRenderer from './DashboardRenderer';
import DocumentViewer from './DocumentViewer';
import ReportViewer from './ReportViewer';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ArtifactPanelProps {
  /** List of artifacts detected in an agent response. */
  artifacts: Artifact[];
}

// ---------------------------------------------------------------------------
// ArtifactPanel
// ---------------------------------------------------------------------------

/**
 * Renders detected artifacts from agent responses using the appropriate
 * viewer component based on artifact type.
 *
 * Artifact types are mapped to viewers:
 * - report  -> ReportViewer
 * - dashboard -> DashboardRenderer
 * - document -> DocumentViewer
 * - table   -> inline table rendering
 * - code    -> code block rendering
 */
export default function ArtifactPanel({ artifacts }: ArtifactPanelProps) {
  if (!artifacts || artifacts.length === 0) return null;

  return (
    <div className="mt-3 space-y-3" role="region" aria-label="Message artifacts">
      {artifacts.map((artifact) => (
        <div
          key={artifact.id}
          className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800/50">
            <ArtifactIcon type={artifact.type} />
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              {artifact.title}
            </span>
            <span className="ml-auto rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
              {artifact.type}
            </span>
          </div>

          {/* Content */}
          <div className="p-3">
            <ArtifactContent artifact={artifact} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content routing
// ---------------------------------------------------------------------------

function ArtifactContent({ artifact }: { artifact: Artifact }) {
  switch (artifact.type) {
    case 'report':
      return <ReportViewer content={artifact.content} />;
    case 'dashboard':
      return <DashboardRenderer content={artifact.content} />;
    case 'document':
      return <DocumentViewer content={artifact.content} />;
    case 'table':
      return <TableView content={artifact.content} />;
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-3 text-xs text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
          <code>{typeof artifact.content === 'string' ? artifact.content : JSON.stringify(artifact.content, null, 2)}</code>
        </pre>
      );
    default:
      return (
        <pre className="overflow-x-auto text-xs text-neutral-600 dark:text-neutral-400">
          {typeof artifact.content === 'string' ? artifact.content : JSON.stringify(artifact.content, null, 2)}
        </pre>
      );
  }
}

// ---------------------------------------------------------------------------
// Table view (inline)
// ---------------------------------------------------------------------------

function TableView({ content }: { content: string | { headers?: string[]; rows?: string[][] } }) {
  if (typeof content === 'string') {
    return <pre className="text-xs text-neutral-600">{content}</pre>;
  }

  const headers = content.headers || [];
  const rows = content.rows || [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" role="table">
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-left font-semibold text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border border-neutral-200 px-2 py-1 text-neutral-600 dark:border-neutral-600 dark:text-neutral-400"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

function ArtifactIcon({ type }: { type: string }) {
  const iconClass = 'h-4 w-4 text-neutral-500 dark:text-neutral-400';

  switch (type) {
    case 'report':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
          <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
        </svg>
      );
    case 'dashboard':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
          <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" />
        </svg>
      );
    case 'table':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
          <path fillRule="evenodd" d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 0v2.25h15v-2.25a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75Zm0 3.75v2.25h4v-2.25h-4Zm0 3.75v2.01c0 .414.336.75.75.75h3.25v-2.76h-4Zm5.5 0v2.76h3.25v-2.76h-3.25Zm4.75 0v2.76h3.5a.75.75 0 0 0 .75-.75v-2.01h-4.25Zm4.25-1.5v-2.25h-4.25v2.25h4.25Zm-5.75-2.25v2.25h-3.25v-2.25h3.25Z" clipRule="evenodd" />
        </svg>
      );
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
          <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Z" clipRule="evenodd" />
        </svg>
      );
  }
}
