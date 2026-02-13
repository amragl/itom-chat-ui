'use client';

/**
 * Client-side session provider that wraps the Auth.js SessionProvider.
 *
 * This component must be rendered as a client component ("use client") because
 * the Auth.js SessionProvider uses React Context to provide session data to all
 * child components via the useSession() hook.
 *
 * Place this in the root layout to make authentication state available
 * throughout the application.
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * import { AuthSessionProvider } from '@/components/providers/SessionProvider';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <AuthSessionProvider>{children}</AuthSessionProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

interface AuthSessionProviderProps {
  children: ReactNode;
}

/**
 * Wraps the application with the Auth.js SessionProvider for client-side
 * session management.
 *
 * The SessionProvider fetches the session from /api/auth/session on mount
 * and keeps it synchronized across browser tabs. It re-fetches when the
 * window regains focus and on visibility changes.
 */
export function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
