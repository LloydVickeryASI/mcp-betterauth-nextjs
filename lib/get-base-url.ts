/**
 * Get the base URL for the application
 * Works in both client and server environments
 * Handles Vercel preview deployments automatically
 * 
 * Priority order:
 * 1. In browser: use window.location.origin
 * 2. VERCEL_URL for preview/production deployments
 * 3. PORT environment variable (if set)
 * 4. LOCAL_URL from .env.local (if set)
 * 5. Fallback to localhost:3000
 * 
 * Note: When Next.js auto-selects a different port (e.g., 3001),
 * you'll need to either:
 * - Set LOCAL_URL=http://localhost:3001 in .env.local
 * - Or run with PORT=3001 pnpm dev
 */
export function getBaseUrl(): string {
  // Browser environment
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // Server environment
  
  // Vercel preview/production deployments
  
  // Allow explicit override for production domains
  if (process.env.AUTH_URL) {
    return process.env.AUTH_URL;
  }
  
  // VERCEL_URL is automatically set by Vercel and includes the deployment URL
  // It's NOT available in local development
  // Note: This will be the internal Vercel URL, not your custom domain
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Local development fallback
  // Check for Next.js server port from environment
  if (process.env.PORT) {
    return `http://localhost:${process.env.PORT}`;
  }

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