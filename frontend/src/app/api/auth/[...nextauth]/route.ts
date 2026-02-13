/**
 * Auth.js route handler for the Next.js App Router.
 *
 * This catch-all route handles all authentication-related HTTP requests:
 * - GET /api/auth/signin — renders the sign-in page (redirects to /login)
 * - GET /api/auth/signout — renders the sign-out confirmation
 * - GET /api/auth/callback/:provider — handles OAuth callback from ServiceNow
 * - GET /api/auth/session — returns the current session as JSON
 * - POST /api/auth/signin/:provider — initiates the OAuth flow
 * - POST /api/auth/signout — performs the sign-out
 * - GET /api/auth/csrf — returns the CSRF token
 *
 * @see https://authjs.dev/getting-started/installation#configure
 */

import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
