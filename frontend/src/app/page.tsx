import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-surface font-[family-name:var(--font-inter)]">
      <main className="flex max-w-2xl flex-col items-center gap-8 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-5xl">
          ITOM Chat UI
        </h1>

        <p className="max-w-md text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
          A conversational interface for interacting with ITOM agents. Chat with Discovery, Asset
          Management, Auditor, and Documentator agents through a unified interface.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/chat"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-primary-600 px-8 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Open Chat
          </Link>
        </div>

        <div className="mt-8 grid max-w-lg grid-cols-1 gap-4 text-left sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Multi-Agent Chat
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Route conversations to specialized ITOM agents or let the orchestrator decide.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Artifact Viewer
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              View audit reports, compliance docs, and health dashboards inline.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Conversation History
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Persistent conversations with search, context memory, and export.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Status Dashboard
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Real-time agent status, workflow progress, and health metrics.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
