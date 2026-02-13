/**
 * Next.js middleware for route protection.
 *
 * Checks the Auth.js session token and redirects unauthenticated users to
 * /login for all protected routes. Public routes (login, auth API, static
 * assets) are excluded via the matcher config.
 *
 * When AUTH_MODE=dev, all authentication checks are bypassed -- every request
 * is allowed through without a session cookie. This enables local development
 * without ServiceNow OAuth credentials.
 *
 * Auth.js stores the session in a cookie named `authjs.session-token`
 * (or `__Secure-authjs.session-token` in production). The middleware checks
 * for the presence of this cookie as a lightweight auth gate. The actual
 * token validation happens server-side in Auth.js route handlers.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Routes that do not require authentication. */
const PUBLIC_PATHS = ['/login'];

/**
 * Read AUTH_MODE from the server-side environment.
 * "dev" bypasses all auth checks; "sso" (default) enforces the session cookie.
 */
const AUTH_MODE = (process.env.AUTH_MODE ?? 'sso').toLowerCase();

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Dev mode: skip all auth checks ---
  if (AUTH_MODE === 'dev') {
    return NextResponse.next();
  }

  // --- SSO mode: enforce session cookie ---

  // Allow public paths
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  // Check for Auth.js session cookie.
  // Auth.js uses different cookie names depending on whether the app is
  // served over HTTPS (production) or HTTP (development).
  const sessionToken =
    request.cookies.get('authjs.session-token')?.value ??
    request.cookies.get('__Secure-authjs.session-token')?.value;

  if (!sessionToken) {
    // Redirect to login with the original URL as callbackUrl
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/**
 * Matcher config: only run the middleware on routes that need protection.
 * Excludes:
 * - /login (public)
 * - /api/auth/* (Auth.js routes)
 * - /_next/* (Next.js internals)
 * - /favicon.ico, /robots.txt, etc.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/auth (Auth.js handlers)
     * - /_next/static (Next.js static files)
     * - /_next/image (Next.js image optimization)
     * - /favicon.ico
     * - /login (public login page)
     */
    '/((?!api/auth|_next/static|_next/image|favicon\\.ico|login).*)',
  ],
};
