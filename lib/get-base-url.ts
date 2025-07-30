/**
 * Get the base URL for the application
 * Works in both client and server environments
 * Handles Vercel preview deployments automatically
 * 
 * Priority order:
 * 1. In browser: use window.location.origin
 * 2. VERCEL_URL for preview/production deployments
 * 3. Fallback to localhost:3000 for local development
 */
export function getBaseUrl(): string {
  // Browser environment
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // Server environment
  
  // Vercel preview/production deployments
  // VERCEL_URL is automatically set by Vercel and includes the deployment URL
  // It's NOT available in local development
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Local development fallback
  // You can override this in .env.local if using a different port
  const localUrl = process.env.LOCAL_URL || "http://localhost:3000";
  return localUrl;
}

/**
 * Get the public-facing URL for client-side usage
 * This prioritizes NEXT_PUBLIC_* environment variables
 */
export function getPublicUrl(): string {
  // Browser environment
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // Use NEXT_PUBLIC_AUTH_URL if available
  if (process.env.NEXT_PUBLIC_AUTH_URL) {
    return process.env.NEXT_PUBLIC_AUTH_URL;
  }

  // Use NEXT_PUBLIC_VERCEL_URL for Vercel deployments
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }

  // Fall back to server-side detection
  return getBaseUrl();
}