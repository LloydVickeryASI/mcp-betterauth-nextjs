import jwt from "jsonwebtoken";

export interface OAuthStateData {
  origin: string;
  next?: string;
  timestamp: number;
}

/**
 * Validates that all critical OAuth secrets are present in the environment
 * This should be called at application startup
 */
export function validateOAuthSecrets(): void {
  if (!process.env.STATE_SECRET) {
    throw new Error(
      "STATE_SECRET environment variable is required for OAuth security. " +
      "Please set this to a cryptographically secure random string."
    );
  }
  
  if (process.env.STATE_SECRET === "dev-secret-please-change") {
    throw new Error(
      "STATE_SECRET cannot use the default development value. " +
      "Please set this to a cryptographically secure random string."
    );
  }
}

/**
 * Gets the STATE_SECRET from environment, throwing if not present
 */
function getStateSecret(): string {
  const secret = process.env.STATE_SECRET;
  if (!secret) {
    throw new Error("STATE_SECRET environment variable is not set");
  }
  return secret;
}

/**
 * Generate a JWT-encoded state parameter for OAuth flows
 * This allows us to securely pass the origin URL through the OAuth flow
 */
export function generateOAuthState(data: Omit<OAuthStateData, "timestamp">): string {
  const stateData: OAuthStateData = {
    ...data,
    timestamp: Date.now(),
  };

  return jwt.sign(
    stateData,
    getStateSecret(),
    { expiresIn: "10m" }
  );
}

/**
 * Verify and decode an OAuth state parameter
 */
export function verifyOAuthState(state: string): OAuthStateData | null {
  try {
    const decoded = jwt.verify(
      state,
      getStateSecret()
    ) as OAuthStateData;

    // Validate timestamp (prevent replay attacks)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (decoded.timestamp < tenMinutesAgo) {
      throw new Error("State parameter expired");
    }

    return decoded;
  } catch (error) {
    console.error("Failed to verify OAuth state:", error);
    return null;
  }
}

/**
 * Check if a redirect origin is allowed
 */
export function isAllowedRedirectOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    
    // Allow localhost for development
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return true;
    }

    // Allow Vercel preview URLs
    if (url.hostname.endsWith(".vercel.app")) {
      return true;
    }

    // Allow explicitly configured domains
    const allowedDomains = process.env.ALLOWED_REDIRECT_DOMAINS?.split(",") || [];
    return allowedDomains.some(domain => 
      url.hostname === domain.trim() || 
      url.hostname.endsWith(`.${domain.trim()}`)
    );
  } catch {
    return false;
  }
}