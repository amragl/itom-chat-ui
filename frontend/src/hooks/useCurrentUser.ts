'use client';

import { useSession } from 'next-auth/react';

/**
 * Convenience hook that returns the authenticated ServiceNow user from session.
 *
 * Provides a simpler API than useSession() for components that just need
 * the current user's info for display or message attribution.
 *
 * @returns The current user object, loading state, and authentication status.
 */
export function useCurrentUser() {
  const { data: session, status } = useSession();

  const user = session?.user ?? null;
  const isAuthenticated = status === 'authenticated' && user !== null;
  const isLoading = status === 'loading';

  return {
    user,
    isAuthenticated,
    isLoading,
    accessToken: session?.accessToken ?? null,
  } as const;
}
