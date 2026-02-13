/**
 * Authentication types for ServiceNow OAuth 2.0 integration.
 *
 * Defines the shape of ServiceNow user data returned by the sys_user table
 * and augments the Auth.js module types to include ServiceNow-specific fields
 * on session.user and the JWT token.
 */

// ---------------------------------------------------------------------------
// ServiceNow user profile
// ---------------------------------------------------------------------------

/**
 * Represents a user record from the ServiceNow sys_user table.
 *
 * These fields are fetched during the OAuth userinfo step using the
 * access token obtained from the ServiceNow token endpoint.
 */
export interface ServiceNowUser {
  /** The sys_id primary key of the user record. */
  sys_id: string;
  /** The login username (e.g., "admin", "john.doe"). */
  user_name: string;
  /** The display name of the user (e.g., "John Doe"). */
  name: string;
  /** The user's email address. */
  email: string;
  /** The user's job title (e.g., "IT Operations Manager"). */
  title: string;
  /** URL or sys_id reference to the user's photo attachment. */
  photo: string;
  /** Whether the user account is active. */
  active: boolean;
}

/**
 * Roles assigned to the user, fetched from sys_user_has_role.
 * Each entry is the role name string (e.g., "admin", "itil", "snc_internal").
 */
export type ServiceNowRoles = string[];

// ---------------------------------------------------------------------------
// Auth.js module augmentation
// ---------------------------------------------------------------------------

declare module 'next-auth' {
  /**
   * Extends the default Auth.js Session interface to include ServiceNow user
   * fields. These are populated in the session callback from the JWT token.
   */
  interface Session {
    user: {
      /** Auth.js default fields */
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      /** ServiceNow-specific fields */
      sysId: string;
      userName: string;
      title: string;
      roles: ServiceNowRoles;
    };
    /** The ServiceNow OAuth access token for backend API calls. */
    accessToken: string;
  }

  /**
   * Extends the default Auth.js User interface returned by the provider
   * profile callback.
   */
  interface User {
    sysId?: string;
    userName?: string;
    title?: string;
    roles?: ServiceNowRoles;
  }
}

declare module '@auth/core/jwt' {
  /**
   * Extends the default JWT interface to carry ServiceNow data between
   * the jwt and session callbacks.
   */
  interface JWT {
    /** ServiceNow OAuth access token. */
    accessToken?: string;
    /** ServiceNow OAuth refresh token. */
    refreshToken?: string;
    /** Token expiry timestamp (seconds since epoch). */
    accessTokenExpires?: number;
    /** ServiceNow sys_id. */
    sysId?: string;
    /** ServiceNow login username. */
    userName?: string;
    /** User's job title from ServiceNow. */
    title?: string;
    /** User's roles from ServiceNow. */
    roles?: ServiceNowRoles;
  }
}
