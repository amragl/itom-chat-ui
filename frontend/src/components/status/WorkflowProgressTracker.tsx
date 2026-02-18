'use client';

/**
 * Displays multi-step workflow progress for agent operations.
 *
 * Shows steps in order with status icons to indicate completion,
 * in-progress, or pending states.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  /** Unique identifier for the step. */
  id: string;
  /** Human-readable label for the step. */
  label: string;
  /** Current status of the step. */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  /** Optional detail text shown below the label. */
  detail?: string;
}

export interface WorkflowExecution {
  /** Unique identifier for the workflow execution. */
  id: string;
  /** Display name for the workflow. */
  name: string;
  /** The ordered list of steps in this workflow. */
  steps: WorkflowStep[];
  /** Overall workflow status. */
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface WorkflowProgressTrackerProps {
  /** The workflow execution to display. */
  workflow: WorkflowExecution;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkflowProgressTracker({ workflow }: WorkflowProgressTrackerProps) {
  const completedCount = workflow.steps.filter((s) => s.status === 'completed').length;
  const progressPercent = workflow.steps.length > 0
    ? Math.round((completedCount / workflow.steps.length) * 100)
    : 0;

  return (
    <div
      className="rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-700"
      role="region"
      aria-label={`Workflow: ${workflow.name}`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {workflow.name}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {completedCount} of {workflow.steps.length} steps completed
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getWorkflowStatusColor(workflow.status)}`}>
          {workflow.status}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progressPercent}% complete`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            workflow.status === 'failed' ? 'bg-error-500' : 'bg-primary-600'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2" role="list">
        {workflow.steps.map((step, index) => (
          <div
            key={step.id}
            role="listitem"
            className="flex items-start gap-3"
          >
            <div className="flex flex-col items-center">
              <StepIcon status={step.status} />
              {index < workflow.steps.length - 1 && (
                <div className={`mt-1 h-4 w-0.5 ${
                  step.status === 'completed'
                    ? 'bg-success-400'
                    : 'bg-neutral-200 dark:bg-neutral-700'
                }`} />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <p className={`text-sm ${
                step.status === 'completed'
                  ? 'text-neutral-800 dark:text-neutral-200'
                  : step.status === 'in_progress'
                    ? 'font-medium text-primary-700 dark:text-primary-400'
                    : step.status === 'failed'
                      ? 'text-error-600 dark:text-error-400'
                      : 'text-neutral-400 dark:text-neutral-500'
              }`}>
                {step.label}
              </p>
              {step.detail && (
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step icon
// ---------------------------------------------------------------------------

function StepIcon({ status }: { status: WorkflowStep['status'] }) {
  const baseClass = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full';

  switch (status) {
    case 'completed':
      return (
        <span className={`${baseClass} bg-success-500 text-white`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
          </svg>
        </span>
      );
    case 'in_progress':
      return (
        <span className={`${baseClass} border-2 border-primary-500 bg-surface`}>
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
        </span>
      );
    case 'failed':
      return (
        <span className={`${baseClass} bg-error-500 text-white`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
          </svg>
        </span>
      );
    case 'skipped':
      return (
        <span className={`${baseClass} border-2 border-neutral-300 bg-surface dark:border-neutral-600`}>
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </span>
      );
    default: // pending
      return (
        <span className={`${baseClass} border-2 border-neutral-300 bg-surface dark:border-neutral-600`} />
      );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkflowStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400';
    case 'running':
      return 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400';
    case 'failed':
      return 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';
    default:
      return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
  }
}
