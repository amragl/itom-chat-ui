/**
 * Tests for the useKeyboardShortcuts hook.
 *
 * Verifies that keyboard shortcuts are registered, triggered, and
 * cleaned up correctly.
 *
 * Requires vitest and @testing-library/react to be installed:
 *   npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
 *
 * Run with: npx vitest run src/__tests__/hooks/useKeyboardShortcuts.test.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, getDefaultShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { KeyboardShortcut } from '@/hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the handler when the shortcut key is pressed', () => {
    const handler = vi.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: 'Escape', handler, description: 'Close' },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call the handler for non-matching keys', () => {
    const handler = vi.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: 'Escape', handler, description: 'Close' },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports Ctrl modifier', () => {
    const handler = vi.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: 'n', ctrlKey: true, handler, description: 'New' },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Without Ctrl - should not trigger
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', bubbles: true }),
    );
    expect(handler).not.toHaveBeenCalled();

    // With Ctrl - should trigger
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports Meta key as alternative to Ctrl', () => {
    const handler = vi.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: 'n', ctrlKey: true, handler, description: 'New' },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cleans up event listener on unmount', () => {
    const handler = vi.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: 'Escape', handler, description: 'Close' },
    ];

    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));
    unmount();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('getDefaultShortcuts', () => {
  it('returns shortcuts for provided actions', () => {
    const actions = {
      onNewConversation: vi.fn(),
      onFocusInput: vi.fn(),
      onShowShortcuts: vi.fn(),
      onEscape: vi.fn(),
    };

    const shortcuts = getDefaultShortcuts(actions);

    expect(shortcuts.length).toBe(4);
    expect(shortcuts.find((s) => s.key === 'n')).toBeDefined();
    expect(shortcuts.find((s) => s.key === '/')).toBeDefined();
    expect(shortcuts.find((s) => s.key === '?')).toBeDefined();
    expect(shortcuts.find((s) => s.key === 'Escape')).toBeDefined();
  });

  it('returns empty array when no actions are provided', () => {
    const shortcuts = getDefaultShortcuts({});
    expect(shortcuts.length).toBe(0);
  });

  it('only includes shortcuts for provided actions', () => {
    const shortcuts = getDefaultShortcuts({
      onNewConversation: vi.fn(),
    });

    expect(shortcuts.length).toBe(1);
    expect(shortcuts[0].key).toBe('n');
    expect(shortcuts[0].ctrlKey).toBe(true);
  });
});
