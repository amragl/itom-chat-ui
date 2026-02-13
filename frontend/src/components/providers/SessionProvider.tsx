'use client';

/**
 * Client-side session provider that wraps the Auth.js SessionProvider.
 *
 * This component must be rendered as a client component ("use client") because
 * the Auth.js SessionProvider uses React Context to provide session data to all
 * child components via the useSession() hook.
 *
 * When AUTH_MODE=dev, the provider automatically signs in as the dev user
 * on first load, so the session is populated without manual login.
 *
 * Place this in the root layout to make authentication state available
 * throughout the application.
 */

import { SessionProvider, signIn, useSession } from 'next-auth/react';
import { useEffect, useRef, type ReactNode } from 'react';

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE ?? 'sso';

interface AuthSessionProviderProps {
  children: ReactNode;
}

/**
 * Inner component that auto-signs-in as the dev user when AUTH_MODE=dev
 * and no session exists. This runs inside the SessionProvider context
 * so it can use useSession().
 */
function DevAutoSignIn({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (
      AUTH_MODE === 'dev' &&
      status === 'unauthenticated' &&
      !attemptedRef.current
    ) {
      attemptedRef.current = true;
      // Sign in with the dev credentials provider. redirect: false prevents
      // a full page navigation -- the session will be populated via the
      // SessionProvider's built-in polling.
      signIn('dev-credentials', { redirect: false });
    }
  }, [status]);

  return <>{children}</>;
}

/**
 * Wraps the application with the Auth.js SessionProvider for client-side
 * session management.
 *
 * The SessionProvider fetches the session from /api/auth/session on mount
 * and keeps it synchronized across browser tabs. It re-fetches when the
 * window regains focus and on visibility changes.
 *
 * In dev mode, the DevAutoSignIn child automatically authenticates as the
 * static dev user without requiring manual login.
 */
export function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  return (
    <SessionProvider>
      {AUTH_MODE === 'dev' ? (
        <DevAutoSignIn>{children}</DevAutoSignIn>
      ) : (
        children
      )}
    </SessionProvider>
  );
}
