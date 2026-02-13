'use client';

/**
 * Visual indicator displayed when the application is running in dev auth mode.
 *
 * Renders a slim, fixed banner at the very top of the viewport with a
 * conspicuous warning that authentication is bypassed. The banner uses a
 * bright amber/orange color scheme so it is immediately noticeable.
 *
 * Only renders when NEXT_PUBLIC_AUTH_MODE=dev. In SSO mode, this component
 * renders nothing.
 */

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE ?? 'sso';

export default function DevModeBanner() {
  if (AUTH_MODE !== 'dev') {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Development authentication mode active"
      className="flex h-7 shrink-0 items-center justify-center bg-amber-500 text-xs font-semibold tracking-wide text-amber-950"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="mr-1.5 h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      DEV MODE — Auth bypassed — Not for production
    </div>
  );
}
