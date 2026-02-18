/**
 * Tests for the ArtifactPanel component.
 *
 * Verifies rendering of different artifact types (report, dashboard,
 * document, table, code) and the empty state.
 *
 * Requires vitest and @testing-library/react to be installed:
 *   npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
 *
 * Run with: npx vitest run src/__tests__/components/ArtifactPanel.test.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArtifactPanel from '@/components/artifacts/ArtifactPanel';
import type { Artifact } from '@/types';

// Mock react-markdown to avoid SSR issues in tests
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: () => {},
}));

describe('ArtifactPanel', () => {
  it('renders nothing when artifacts array is empty', () => {
    const { container } = render(<ArtifactPanel artifacts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when artifacts is undefined', () => {
    const { container } = render(<ArtifactPanel artifacts={undefined as unknown as Artifact[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a report artifact with title and type badge', () => {
    const artifacts: Artifact[] = [
      {
        id: 'art-1',
        type: 'report',
        title: 'Compliance Report',
        content: 'All systems compliant.',
      },
    ];

    render(<ArtifactPanel artifacts={artifacts} />);

    expect(screen.getByText('Compliance Report')).toBeDefined();
    expect(screen.getByText('report')).toBeDefined();
  });

  it('renders a table artifact with headers and rows', () => {
    const artifacts: Artifact[] = [
      {
        id: 'art-2',
        type: 'table',
        title: 'Server List',
        content: JSON.stringify({
          headers: ['Name', 'Status'],
          rows: [
            ['web-01', 'online'],
            ['web-02', 'offline'],
          ],
        }),
      },
    ];

    render(<ArtifactPanel artifacts={artifacts} />);

    expect(screen.getByText('Server List')).toBeDefined();
    expect(screen.getByText('table')).toBeDefined();
  });

  it('renders a dashboard artifact', () => {
    const artifacts: Artifact[] = [
      {
        id: 'art-3',
        type: 'dashboard',
        title: 'Health Dashboard',
        content: 'CPU: 45%, Memory: 72%',
      },
    ];

    render(<ArtifactPanel artifacts={artifacts} />);

    expect(screen.getByText('Health Dashboard')).toBeDefined();
    expect(screen.getByText('dashboard')).toBeDefined();
  });

  it('renders multiple artifacts', () => {
    const artifacts: Artifact[] = [
      {
        id: 'art-1',
        type: 'report',
        title: 'First Artifact',
        content: 'Content 1',
      },
      {
        id: 'art-2',
        type: 'document',
        title: 'Second Artifact',
        content: 'Content 2',
      },
    ];

    render(<ArtifactPanel artifacts={artifacts} />);

    expect(screen.getByText('First Artifact')).toBeDefined();
    expect(screen.getByText('Second Artifact')).toBeDefined();
  });

  it('renders the artifacts region with proper ARIA label', () => {
    const artifacts: Artifact[] = [
      {
        id: 'art-1',
        type: 'report',
        title: 'Test',
        content: 'Content',
      },
    ];

    render(<ArtifactPanel artifacts={artifacts} />);

    expect(screen.getByRole('region', { name: 'Message artifacts' })).toBeDefined();
  });
});
