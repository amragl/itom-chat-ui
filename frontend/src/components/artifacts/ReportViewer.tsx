'use client';

/**
 * Renders REPORT artifacts with section headers, compliance scores, and
 * color-coded severity levels.
 *
 * Accepts either a JSON object with structured report data or a plain text
 * string containing the raw report content.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportData {
  title?: string;
  score?: number;
  overall_score?: string;
  status?: string;
  sections?: ReportSection[];
  findings?: ReportFinding[];
  [key: string]: unknown;
}

interface ReportSection {
  title: string;
  content?: string;
  status?: string;
  score?: number;
}

interface ReportFinding {
  severity?: string;
  title?: string;
  description?: string;
  recommendation?: string;
}

interface ReportViewerProps {
  content: string | ReportData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportViewer({ content }: ReportViewerProps) {
  // Plain text fallback
  if (typeof content === 'string') {
    return (
      <div className="prose prose-sm max-w-none whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
        {content}
      </div>
    );
  }

  const report = content as ReportData;

  return (
    <div className="space-y-3" role="article" aria-label="Report">
      {/* Score indicator */}
      {(report.score !== undefined || report.overall_score !== undefined) && (
        <div className="flex items-center gap-3">
          <ScoreIndicator score={report.score ?? parseFloat(report.overall_score ?? '0')} />
          {report.status && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(report.status)}`}>
              {report.status}
            </span>
          )}
        </div>
      )}

      {/* Sections */}
      {report.sections && report.sections.length > 0 && (
        <div className="space-y-2">
          {report.sections.map((section, i) => (
            <div
              key={i}
              className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  {section.title}
                </h4>
                {section.score !== undefined && (
                  <span className="text-xs font-medium text-neutral-500">{section.score}%</span>
                )}
                {section.status && (
                  <span className={`rounded px-1.5 py-0.5 text-xs ${getStatusColor(section.status)}`}>
                    {section.status}
                  </span>
                )}
              </div>
              {section.content && (
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {section.content}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Findings */}
      {report.findings && report.findings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Findings ({report.findings.length})
          </h4>
          {report.findings.map((finding, i) => (
            <div
              key={i}
              className={`rounded-lg border-l-4 p-3 ${getSeverityBorder(finding.severity)}`}
            >
              <div className="flex items-center gap-2">
                {finding.severity && (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${getSeverityColor(finding.severity)}`}>
                    {finding.severity}
                  </span>
                )}
                {finding.title && (
                  <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                    {finding.title}
                  </span>
                )}
              </div>
              {finding.description && (
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {finding.description}
                </p>
              )}
              {finding.recommendation && (
                <p className="mt-1 text-xs italic text-neutral-500 dark:text-neutral-500">
                  Recommendation: {finding.recommendation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback: render any remaining top-level keys */}
      {!report.sections && !report.findings && (
        <pre className="overflow-x-auto text-xs text-neutral-600 dark:text-neutral-400">
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score indicator
// ---------------------------------------------------------------------------

function ScoreIndicator({ score }: { score: number }) {
  let colorClass = 'text-success-600';
  if (score < 50) colorClass = 'text-error-600';
  else if (score < 80) colorClass = 'text-warning-600';

  return (
    <div className="flex items-center gap-2">
      <span className={`text-2xl font-bold ${colorClass}`}>{Math.round(score)}%</span>
      <span className="text-xs text-neutral-500">compliance score</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function getStatusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'pass' || lower === 'compliant' || lower === 'healthy') {
    return 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400';
  }
  if (lower === 'fail' || lower === 'non-compliant' || lower === 'critical') {
    return 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';
  }
  if (lower === 'warning' || lower === 'degraded') {
    return 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';
  }
  return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
}

function getSeverityColor(severity: string): string {
  const lower = severity.toLowerCase();
  if (lower === 'critical' || lower === 'high') {
    return 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';
  }
  if (lower === 'medium' || lower === 'warning') {
    return 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';
  }
  if (lower === 'low' || lower === 'info') {
    return 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400';
  }
  return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
}

function getSeverityBorder(severity?: string): string {
  if (!severity) return 'border-neutral-300 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800/50';
  const lower = severity.toLowerCase();
  if (lower === 'critical' || lower === 'high') {
    return 'border-error-500 bg-error-50 dark:border-error-600 dark:bg-error-900/20';
  }
  if (lower === 'medium' || lower === 'warning') {
    return 'border-warning-500 bg-warning-50 dark:border-warning-600 dark:bg-warning-900/20';
  }
  return 'border-primary-500 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20';
}
