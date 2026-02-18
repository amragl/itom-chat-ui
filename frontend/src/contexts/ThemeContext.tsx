'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** The current theme preference. */
  theme: Theme;
  /** Set the theme preference. Persists to localStorage. */
  setTheme: (theme: Theme) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Access the current theme and setter. Must be used within a ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'itom-chat-theme';

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider manages the application theme (light, dark, or system).
 *
 * - Persists the user's preference in localStorage under the key
 *   "itom-chat-theme".
 * - Applies the "dark" class to document.documentElement when dark mode
 *   is active, enabling Tailwind CSS dark mode variants.
 * - Listens for system color scheme changes when theme is "system".
 */
/**
 * Read the persisted theme from localStorage during initialization.
 * Returns "system" if nothing is stored or localStorage is unavailable.
 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'system';
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Apply the dark class to the document element
  useEffect(() => {
    const applyTheme = (resolvedTheme: Theme) => {
      const isDark =
        resolvedTheme === 'dark' ||
        (resolvedTheme === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);

      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme(theme);

    // Listen for system theme changes when in system mode
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage not available
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
