/**
 * Auth.js (NextAuth v5) configuration with a custom ServiceNow OAuth 2.0
 * provider.
 *
 * ServiceNow uses a standard OAuth 2.0 authorization code flow:
 *   1. Redirect user to {instance}/oauth_auth.do with client_id and redirect_uri
 *   2. User authenticates in ServiceNow
 *   3. ServiceNow redirects back with an authorization code
 *   4. Auth.js exchanges the code for tokens at {instance}/oauth_token.do
 *   5. Auth.js fetches the user profile from the sys_user table using the access token
 *
 * Session strategy: JWT (no database adapter required).
 * ServiceNow user data (sys_id, user_name, title, roles) is stored in the JWT
 * and exposed on session.user for client-side access.
 *
 * @module lib/auth
 */

import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import type { JWT } from '@auth/core/jwt';
import type { ServiceNowUser, ServiceNowRoles } from '@/types/auth';

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

/**
 * ServiceNow instance URL (e.g., "https://dev12345.service-now.com").
 * Must NOT include a trailing slash.
 */
const SERVICENOW_INSTANCE = process.env.SERVICENOW_INSTANCE ?? '';

/** OAuth 2.0 client ID registered in ServiceNow. */
const SERVICENOW_CLIENT_ID = process.env.SERVICENOW_CLIENT_ID ?? '';

/** OAuth 2.0 client secret registered in ServiceNow. */
const SERVICENOW_CLIENT_SECRET = process.env.SERVICENOW_CLIENT_SECRET ?? '';

// ---------------------------------------------------------------------------
// ServiceNow user profile response shape
// ---------------------------------------------------------------------------

/** Shape of the ServiceNow REST API response for a sys_user query. */
interface ServiceNowUserResponse {
  result: ServiceNowUser[];
}

/** Shape of the ServiceNow REST API response for sys_user_has_role query. */
interface ServiceNowRolesResponse {
  result: Array<{
    role: {
      value: string;
      display_value: string;
    };
  }>;
}

// ---------------------------------------------------------------------------
// Helper: fetch ServiceNow user profile using access token
// ---------------------------------------------------------------------------

/**
 * Fetches the authenticated user's profile from ServiceNow sys_user table.
 *
 * Uses the OAuth access token as a Bearer token to query the REST Table API.
 * The username is extracted from the token response's scope or from a
 * preliminary call to the ServiceNow user info.
 *
 * @param accessToken - The OAuth 2.0 access token from ServiceNow.
 * @param userName - The username to query (obtained from token scope or sub).
 * @returns The ServiceNow user record, or null if not found.
 */
async function fetchServiceNowUser(
  accessToken: string,
  userName: string,
): Promise<ServiceNowUser | null> {
  const url = new URL(`${SERVICENOW_INSTANCE}/api/now/table/sys_user`);
  url.searchParams.set('sysparm_query', `user_name=${userName}`);
  url.searchParams.set(
    'sysparm_fields',
    'sys_id,user_name,name,email,title,photo,active',
  );
  url.searchParams.set('sysparm_limit', '1');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    console.error(
      `[auth] Failed to fetch ServiceNow user profile: ${response.status} ${response.statusText}`,
    );
    return null;
  }

  const data = (await response.json()) as ServiceNowUserResponse;

  if (!data.result || data.result.length === 0) {
    console.error(`[auth] No sys_user record found for user_name=${userName}`);
    return null;
  }

  return data.result[0];
}

/**
 * Fetches the roles assigned to a ServiceNow user.
 *
 * Queries the sys_user_has_role table filtered by the user's sys_id.
 *
 * @param accessToken - The OAuth 2.0 access token from ServiceNow.
 * @param userSysId - The sys_id of the user record.
 * @returns Array of role name strings.
 */
async function fetchServiceNowRoles(
  accessToken: string,
  userSysId: string,
): Promise<ServiceNowRoles> {
  const url = new URL(`${SERVICENOW_INSTANCE}/api/now/table/sys_user_has_role`);
  url.searchParams.set('sysparm_query', `user=${userSysId}^state=active`);
  url.searchParams.set('sysparm_fields', 'role');
  url.searchParams.set('sysparm_display_value', 'true');
  url.searchParams.set('sysparm_limit', '100');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    console.error(
      `[auth] Failed to fetch ServiceNow roles: ${response.status} ${response.statusText}`,
    );
    return [];
  }

  const data = (await response.json()) as ServiceNowRolesResponse;

  if (!data.result) {
    return [];
  }

  return data.result.map((entry) => entry.role.display_value);
}

/**
 * Resolves the user's photo URL from the ServiceNow photo field.
 *
 * The photo field in sys_user can be:
 * - An empty string (no photo)
 * - A sys_id reference to sys_attachment
 * - A relative URL path
 *
 * This helper constructs the full URL to retrieve the image.
 *
 * @param photo - The raw photo field value from sys_user.
 * @returns A full URL to the user's photo, or an empty string if no photo.
 */
function resolvePhotoUrl(photo: string): string {
  if (!photo) {
    return '';
  }

  // If it already starts with http, it is a full URL
  if (photo.startsWith('http')) {
    return photo;
  }

  // If it starts with a slash, it is a relative path on the instance
  if (photo.startsWith('/')) {
    return `${SERVICENOW_INSTANCE}${photo}`;
  }

  // Otherwise, treat it as a sys_id reference to the user photo attachment
  return `${SERVICENOW_INSTANCE}/sys_user.do?sys_id=${photo}&sysparm_type=photo`;
}

// ---------------------------------------------------------------------------
// Auth.js configuration
// ---------------------------------------------------------------------------

const authConfig: NextAuthConfig = {
  providers: [
    {
      id: 'servicenow',
      name: 'ServiceNow',
      type: 'oauth',

      // ServiceNow does not support PKCE; use state parameter for CSRF protection
      checks: ['state'],

      clientId: SERVICENOW_CLIENT_ID,
      clientSecret: SERVICENOW_CLIENT_SECRET,

      // Authorization endpoint: redirects the user to ServiceNow login
      authorization: {
        url: `${SERVICENOW_INSTANCE}/oauth_auth.do`,
        params: {
          response_type: 'code',
        },
      },

      // Token endpoint: exchanges the authorization code for access/refresh tokens
      token: {
        url: `${SERVICENOW_INSTANCE}/oauth_token.do`,
      },

      // ServiceNow token endpoint uses client_secret_post by default
      client: {
        token_endpoint_auth_method: 'client_secret_post',
      },

      // User info: custom function to fetch from sys_user table
      userinfo: {
        // Auth.js calls this URL to get user profile. We provide a custom
        // request function instead of a static URL because ServiceNow
        // does not have a standard /userinfo endpoint.
        url: `${SERVICENOW_INSTANCE}/api/now/table/sys_user`,
        async request({ tokens }: { tokens: { access_token?: string } }) {
          if (!tokens.access_token) {
            throw new Error('[auth] No access token available for userinfo request');
          }

          // First, get the current user's username by querying the lightweight
          // /api/now/ui/user endpoint (or we parse it from the token scope).
          // ServiceNow includes the username in the scope of the token response
          // as "useraccount". We use the /api/now/ui/user endpoint as a reliable
          // alternative.
          const meResponse = await fetch(
            `${SERVICENOW_INSTANCE}/api/now/ui/user`,
            {
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                Accept: 'application/json',
              },
            },
          );

          if (!meResponse.ok) {
            throw new Error(
              `[auth] Failed to identify current user: ${meResponse.status} ${meResponse.statusText}`,
            );
          }

          const meData = (await meResponse.json()) as {
            result: { user_name: string; user_sys_id: string };
          };

          const userName = meData.result.user_name;

          // Fetch full user profile from sys_user
          const user = await fetchServiceNowUser(tokens.access_token, userName);

          if (!user) {
            throw new Error(`[auth] Could not fetch profile for user: ${userName}`);
          }

          // Fetch user roles
          const roles = await fetchServiceNowRoles(tokens.access_token, user.sys_id);

          return {
            sub: user.sys_id,
            name: user.name,
            email: user.email,
            picture: resolvePhotoUrl(user.photo),
            sys_id: user.sys_id,
            user_name: user.user_name,
            title: user.title,
            roles,
          };
        },
      },

      // Map the ServiceNow profile to Auth.js User shape
      profile(profile: {
        sub: string;
        name: string;
        email: string;
        picture: string;
        sys_id: string;
        user_name: string;
        title: string;
        roles: string[];
      }) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture || null,
          sysId: profile.sys_id,
          userName: profile.user_name,
          title: profile.title,
          roles: profile.roles,
        };
      },
    },
  ],

  // Use JWT-based sessions (no database adapter needed)
  session: {
    strategy: 'jwt',
  },

  callbacks: {
    /**
     * JWT callback: invoked whenever a JWT is created or updated.
     *
     * On initial sign-in (when `account` is present), we store the
     * ServiceNow access token, refresh token, expiry, and user metadata
     * in the JWT. On subsequent calls, the stored values persist.
     */
    async jwt({ token, user, account }): Promise<JWT> {
      // Initial sign-in: account and user are populated by the provider
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token ?? undefined,
          refreshToken: account.refresh_token ?? undefined,
          accessTokenExpires: account.expires_at
            ? account.expires_at
            : undefined,
          sysId: user.sysId ?? undefined,
          userName: user.userName ?? undefined,
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          picture: user.image ?? undefined,
          title: user.title ?? undefined,
          roles: user.roles ?? [],
        };
      }

      // Subsequent requests: return the token as-is
      // Token refresh could be implemented here in the future by checking
      // accessTokenExpires and calling the ServiceNow token endpoint with
      // the refresh token.
      return token;
    },

    /**
     * Session callback: controls what data is exposed to the client via
     * useSession() and auth().
     *
     * Maps JWT fields to session.user and session.accessToken.
     */
    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id: (token.sub as string) ?? '',
          name: (token.name as string) ?? null,
          email: (token.email as string) ?? null,
          image: (token.picture as string) ?? null,
          sysId: (token.sysId as string) ?? '',
          userName: (token.userName as string) ?? '',
          title: (token.title as string) ?? '',
          roles: (token.roles as string[]) ?? [],
        };
        session.accessToken = (token.accessToken as string) ?? '';
      }
      return session;
    },
  },

  // Custom pages (login page will be built in CHAT-041)
  pages: {
    signIn: '/login',
  },

  // Trust the NEXTAUTH_URL environment variable for URL generation
  trustHost: true,
};

// ---------------------------------------------------------------------------
// Export NextAuth handlers, auth function, and server actions
// ---------------------------------------------------------------------------

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export { authConfig };
