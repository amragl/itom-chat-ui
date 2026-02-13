export default function ChatPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-surface font-[family-name:var(--font-inter)]">
      <div className="flex max-w-lg flex-col items-center gap-6 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-8 w-8 text-white"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          Chat Interface
        </h1>

        <p className="text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
          The chat interface is coming soon. This will be the main area for conversing with ITOM
          agents, viewing streaming responses, and interacting with artifacts.
        </p>
      </div>
    </div>
  );
}
