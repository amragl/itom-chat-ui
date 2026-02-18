'use client';

/**
 * A reusable empty state component for when there is no data to display.
 *
 * Supports an icon, title, description, and an optional action button.
 */

interface EmptyStateProps {
  /** Title text for the empty state. */
  title: string;
  /** Description text providing more context. */
  description?: string;
  /** Optional icon element to display above the title. */
  icon?: React.ReactNode;
  /** Optional action button configuration. */
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 text-neutral-300 dark:text-neutral-600">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
