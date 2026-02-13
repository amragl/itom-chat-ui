'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';

/**
 * Maps Auth.js error codes to user-friendly messages.
 *
 * Auth.js redirects to /login?error=<code> when authentication fails.
 * See: https://authjs.dev/reference/core/errors
 */
const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: 'Could not start the sign-in flow. Please try again.',
  OAuthCallback: 'Authentication failed during the callback. Please try again.',
  OAuthAccountNotLinked:
    'This email is already associated with another account.',
  Callback: 'An error occurred during authentication. Please try again.',
  OAuthCreateAccount: 'Could not create your account. Please try again.',
  AccessDenied: 'Access denied. You may not have permission to sign in.',
  Configuration:
    'There is a server configuration issue. Please contact your administrator.',
  Default: 'An unexpected error occurred. Please try again.',
};

/**
 * Inner login content that uses useSearchParams (must be wrapped in Suspense).
 */
function LoginContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [isLoading, setIsLoading] = useState(false);

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.Default
    : null;

  const handleSignIn = useCallback(() => {
    setIsLoading(true);
    signIn('servicenow', { callbackUrl });
  }, [callbackUrl]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-2xl font-bold text-white shadow-lg">
            IT
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            ITOM Chat
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Sign in with your ServiceNow account to continue
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-neutral-200 bg-surface p-6 shadow-lg dark:border-neutral-700">
          {/* Error Alert */}
          {errorMessage && (
            <div
              className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-950 dark:text-error-300"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="mt-0.5 h-4 w-4 shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Sign In Button */}
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
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
                <span>Redirecting to ServiceNow...</span>
              </>
            ) : (
              <>
                {/* ServiceNow-style icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.732-3.558"
                  />
                </svg>
                <span>Sign in with ServiceNow</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              SSO
            </span>
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          </div>

          {/* Info text */}
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            You will be redirected to your ServiceNow instance to authenticate.
            Your credentials are handled securely by ServiceNow.
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
          ITOM Chat &mdash; Conversational interface for ITOM agents
        </p>
      </div>
    </div>
  );
}

/**
 * Login page rendered at /login.
 *
 * Auth.js is configured to redirect unauthenticated users here (pages.signIn).
 * Displays a branded card with a "Sign in with ServiceNow" button.
 * Auth errors from the OAuth callback are shown as alerts.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
