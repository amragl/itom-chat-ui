'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
}

/**
 * Renders a Mermaid diagram from a code block with language="mermaid".
 * Initialises mermaid lazily (client-side only) and injects the rendered SVG.
 */
export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });

        const { svg } = await mermaid.render(`mermaid-${id}`, chart.trim());

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div className="rounded-lg border border-error-200 bg-error-50 p-3 dark:border-error-800 dark:bg-error-950">
        <p className="mb-1 text-xs font-semibold text-error-700 dark:text-error-400">
          Diagram error
        </p>
        <pre className="whitespace-pre-wrap text-xs text-error-600 dark:text-error-300">
          {error}
        </pre>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-neutral-500">Show source</summary>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-neutral-500">{chart}</pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto rounded-lg bg-white p-4 dark:bg-neutral-900 [&_svg]:mx-auto [&_svg]:max-w-full"
      aria-label="Mermaid diagram"
    />
  );
}
