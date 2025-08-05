import { Pool } from "@neondatabase/serverless";
import { getAccountByUserIdAndProvider, updateAccountTokens } from "./db-queries";
import * as Sentry from "@sentry/nextjs";

/**
 * Token refresh configuration for OAuth providers
 */
const REFRESH_CONFIGS = {
  hubspot: {
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    method: "POST" as const,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  },
  pandadoc: {
    tokenUrl: "https://api.pandadoc.com/oauth2/access_token",
    method: "POST" as const,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  },
  xero: {
    tokenUrl: "https://identity.xero.com/connect/token",
    method: "POST" as const,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  },
} as const;

type RefreshableProvider = keyof typeof REFRESH_CONFIGS;

/**
 * Check if a token is expired or will expire soon
 * @param expiresAt Token expiration timestamp
 * @param bufferMinutes Minutes before expiration to consider token expired (default: 5)
 */
export function isTokenExpired(expiresAt: Date | null, bufferMinutes = 5): boolean {
  if (!expiresAt) return true;
  
  const expirationTime = new Date(expiresAt).getTime();
  const bufferMs = bufferMinutes * 60 * 1000;
  const now = Date.now();
  
  return now >= (expirationTime - bufferMs);
}

/**
 * Refresh OAuth tokens for a provider
 * @param db Database connection
 * @param userId User ID
 * @param provider OAuth provider
 * @returns Updated tokens or null if refresh failed
 */
export async function refreshOAuthTokens(
  db: Pool,
  userId: string,
  provider: RefreshableProvider
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date } | null> {
  try {
    // Get current account with refresh token
    const account = await getAccountByUserIdAndProvider(db, userId, provider);
    
    if (!account?.refreshToken) {
      console.error(`No refresh token available for ${provider}`);
      return null;
    }
    
    const config = REFRESH_CONFIGS[provider];
    const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
    const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
    
    if (!clientId || !clientSecret) {
      console.error(`Missing OAuth credentials for ${provider}`);
      return null;
    }
    
    // Prepare refresh request
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    
    // Special handling for Xero which uses basic auth
    const headers: Record<string, string> = { ...config.headers };
    if (provider === "xero") {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
      // Remove client_secret from params since it's in the header
      params.delete("client_secret");
      params.delete("client_id");
    }
    
    // Make refresh request
    const response = await fetch(config.tokenUrl, {
      method: config.method,
      headers,
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Token refresh failed for ${provider}:`, errorText);
      
      // Track refresh failure in Sentry
      Sentry.captureException(new Error(`OAuth token refresh failed for ${provider}`), {
        extra: {
          provider,
          userId,
          status: response.status,
          error: errorText,
        },
      });
      
      return null;
    }
    
    const data = await response.json();
    
    // Calculate new expiration time
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    
    // Update tokens in database
    await updateAccountTokens(db, userId, provider, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || account.refreshToken, // Keep old refresh token if new one not provided
      expiresAt,
    });
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || account.refreshToken,
      expiresAt,
    };
  } catch (error) {
    console.error(`Error refreshing tokens for ${provider}:`, error);
    
    Sentry.captureException(error, {
      extra: {
        provider,
        userId,
      },
    });
    
    return null;
  }
}

/**
 * Get valid OAuth tokens, refreshing if necessary
 * @param db Database connection
 * @param userId User ID
 * @param provider OAuth provider
 * @returns Valid tokens or null if not available
 */
export async function getValidOAuthTokens(
  db: Pool,
  userId: string,
  provider: RefreshableProvider
): Promise<{ accessToken: string; refreshToken?: string } | null> {
  const account = await getAccountByUserIdAndProvider(db, userId, provider);
  
  if (!account) {
    return null;
  }
  
  // Check if token needs refresh
  if (isTokenExpired(account.accessTokenExpiresAt)) {
    const refreshed = await refreshOAuthTokens(db, userId, provider);
    if (!refreshed) {
      return null;
    }
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
    };
  }
  
  return {
    accessToken: account.accessToken,
    refreshToken: account.refreshToken || undefined,
  };
}