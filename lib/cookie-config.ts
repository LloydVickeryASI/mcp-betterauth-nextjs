/**
 * Centralized cookie configuration for consistent auth cookie settings
 */
export const AUTH_COOKIE_CONFIG = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
} as const;

/**
 * Get standardized cookie options for auth cookies
 * @param customOptions Optional overrides for specific use cases
 */
export function getAuthCookieOptions(customOptions: Record<string, any> = {}) {
  return {
    ...AUTH_COOKIE_CONFIG,
    ...customOptions,
  };
}

/**
 * Cookie names used by the auth system
 */
export const AUTH_COOKIE_NAMES = {
  SESSION_TOKEN: 'better-auth.session_token',
  CSRF_TOKEN: 'better-auth.csrf_token',
} as const;