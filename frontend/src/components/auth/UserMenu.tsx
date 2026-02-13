'use client';

import { signOut, useSession } from 'next-auth/react';
import { useCallback, useState } from 'react';

interface UserMenuProps {
  /** Whether the parent container is in collapsed mode (icon-only). */
  collapsed?: boolean;
}

/**
 * Displays the authenticated user's avatar, name, and a sign-out button.
 *
 * Designed to sit at the bottom of the sidebar. In collapsed mode, only the
 * avatar is visible with a tooltip showing the user name.
 *
 * Shows nothing when the user is not authenticated.
 */
export default function UserMenu({ collapsed = false }: UserMenuProps) {
  const { data: session, status } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = useCallback(() => {
    setIsSigningOut(true);
    signOut({ callbackUrl: '/login' });
  }, []);

  // Don't render anything while loading or when not authenticated
  if (status === 'loading' || status === 'unauthenticated' || !session?.user) {
    return null;
  }

  const { name, userName, title, image, roles } = session.user;
  const displayName = name ?? userName ?? 'User';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const primaryRole = roles.length > 0 ? roles[0] : title || 'User';

  return (
    <div className="flex flex-col gap-1">
      {/* User info row */}
      <div
        className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
          collapsed ? 'justify-center' : ''
        }`}
        title={collapsed ? `${displayName} (${primaryRole})` : undefined}
      >
        {/* Avatar */}
        {image ? (
          <img
            src={image}
            alt={displayName}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {initials}
          </span>
        )}

        {/* Name and role */}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {displayName}
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
              {primaryRole}
            </p>
          </div>
        )}
      </div>

      {/* Sign out button */}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        title={collapsed ? 'Sign out' : undefined}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        {isSigningOut ? (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-4 w-4 shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            />
          </svg>
        )}
        {!collapsed && (
          <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
        )}
      </button>
    </div>
  );
}
