'use client';

import { useCallback, useState } from 'react';
import MobileNav from './MobileNav';
import Sidebar from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Root application layout that composes the desktop sidebar, mobile navigation
 * drawer, and main content area.
 *
 * - Desktop (>= lg): Sidebar is visible on the left (256 px expanded, 64 px
 *   collapsed). Main content fills the remaining width.
 * - Mobile (< lg): Sidebar is hidden. A hamburger button in a top bar opens
 *   the MobileNav drawer.
 */
export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const handleCloseMobileNav = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  const handleOpenMobileNav = useCallback(() => {
    setMobileNavOpen(true);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar -- hidden on mobile (< lg) */}
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={handleToggleCollapse} />

      {/* Mobile navigation drawer */}
      <MobileNav open={mobileNavOpen} onClose={handleCloseMobileNav} />

      {/* Main content column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar with hamburger menu -- visible only below lg */}
        <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 px-4 dark:border-neutral-700 lg:hidden">
          <button
            type="button"
            onClick={handleOpenMobileNav}
            aria-label="Open navigation menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>

          <span className="ml-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            ITOM Chat
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
