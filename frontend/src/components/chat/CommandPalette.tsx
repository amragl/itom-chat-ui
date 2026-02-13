'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CommandCategory, SlashCommand } from '@/lib/commands';
import { categoryLabels, matchCommands } from '@/lib/commands';

// ---------------------------------------------------------------------------
// Public handle exposed via ref
// ---------------------------------------------------------------------------

export interface CommandPaletteHandle {
  /**
   * Forward a keyboard event from the parent input. Returns true if the
   * palette consumed the event (caller should preventDefault).
   */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  /** Current input value used to filter commands (command part only, no args). */
  input: string;
  /** Called when the user selects a command. */
  onSelect: (command: SlashCommand) => void;
  /** Called when the user dismisses the palette (Escape). */
  onClose: () => void;
  /** Whether the palette should be visible. */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A dropdown autocomplete palette that appears when the user types "/" in the
 * message input. Shows matching commands grouped by category with keyboard
 * navigation (ArrowUp/ArrowDown to move, Enter/Tab to select, Escape to close).
 *
 * The parent component should forward keyboard events via the imperative
 * `handleKeyDown` method exposed through the ref.
 */
const CommandPalette = forwardRef<CommandPaletteHandle, CommandPaletteProps>(
  function CommandPalette({ input, onSelect, onClose, visible }, ref) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [prevInput, setPrevInput] = useState(input);
    const listRef = useRef<HTMLDivElement>(null);

    const matches = useMemo(
      () => (visible ? matchCommands(input) : []),
      [visible, input],
    );

    // Reset active index when the filter input changes (state-based pattern)
    if (prevInput !== input) {
      setPrevInput(input);
      if (activeIndex !== 0) {
        setActiveIndex(0);
      }
    }

    // Scroll the active item into view
    useEffect(() => {
      if (!listRef.current) return;
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      activeEl?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    // Expose keyboard handler to parent
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent): boolean => {
        if (!visible || matches.length === 0) return false;

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % matches.length);
            return true;
          case 'ArrowUp':
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
            return true;
          case 'Enter':
          case 'Tab':
            e.preventDefault();
            onSelect(matches[activeIndex]);
            return true;
          case 'Escape':
            e.preventDefault();
            onClose();
            return true;
          default:
            return false;
        }
      },
      [visible, matches, activeIndex, onSelect, onClose],
    );

    useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

    if (!visible || matches.length === 0) return null;

    // Group matches by category for display
    const grouped: { category: CommandCategory; commands: SlashCommand[] }[] = [];
    const seen = new Set<CommandCategory>();
    for (const cmd of matches) {
      if (!seen.has(cmd.category)) {
        seen.add(cmd.category);
        grouped.push({
          category: cmd.category,
          commands: matches.filter((m) => m.category === cmd.category),
        });
      }
    }

    let flatIndex = 0;

    return (
      <div
        ref={listRef}
        role="listbox"
        aria-label="Slash commands"
        className="absolute bottom-full left-0 right-0 mb-1 max-h-72 overflow-y-auto rounded-xl border border-neutral-200 bg-surface shadow-lg dark:border-neutral-700"
      >
        {grouped.map((group) => {
          const startIndex = flatIndex;
          const groupItems = group.commands.map((cmd, i) => {
            const itemIndex = startIndex + i;
            const isActive = itemIndex === activeIndex;
            return (
              <button
                key={cmd.name}
                type="button"
                role="option"
                aria-selected={isActive}
                data-active={isActive}
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => setActiveIndex(itemIndex)}
                className={`flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="shrink-0 font-mono font-medium">
                  {cmd.name}
                </span>
                {cmd.paramHint && (
                  <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                    {cmd.paramHint}
                  </span>
                )}
                <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {cmd.description}
                </span>
              </button>
            );
          });
          flatIndex += group.commands.length;
          return (
            <div key={group.category}>
              <div className="sticky top-0 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
                {categoryLabels[group.category]}
              </div>
              {groupItems}
            </div>
          );
        })}
      </div>
    );
  },
);

export default CommandPalette;
