import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-[family-name:var(--font-inter)] dark:bg-zinc-950">
      <main className="flex max-w-2xl flex-col items-center gap-8 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          ITOM Chat UI
        </h1>

        <p className="max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          A conversational interface for interacting with ITOM agents. Chat with Discovery, Asset
          Management, Auditor, and Documentator agents through a unified interface.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/chat"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Open Chat
          </Link>
        </div>

        <div className="mt-8 grid max-w-lg grid-cols-1 gap-4 text-left sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Multi-Agent Chat
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Route conversations to specialized ITOM agents or let the orchestrator decide.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Artifact Viewer
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              View audit reports, compliance docs, and health dashboards inline.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Conversation History
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Persistent conversations with search, context memory, and export.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Status Dashboard
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Real-time agent status, workflow progress, and health metrics.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
