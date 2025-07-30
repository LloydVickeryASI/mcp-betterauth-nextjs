import jwt from "jsonwebtoken";

export interface OAuthStateData {
  origin: string;
  next?: string;
  timestamp: number;
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
    process.env.STATE_SECRET || "dev-secret-please-change",
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
      process.env.STATE_SECRET || "dev-secret-please-change"
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