import { Pool } from '@neondatabase/serverless';
import { getAccountByUserIdAndProvider } from '@/lib/db-queries';
import { auth } from '@/lib/auth';

export interface RefreshTokenResult {
  accessToken: string;
  expiresAt: Date | null;
  refreshed: boolean;
}

export async function refreshProviderToken(
  userId: string,
  provider: string
): Promise<RefreshTokenResult> {
  const db = auth.options.database as Pool;
  
  // Get the account for this provider
  const account = await getAccountByUserIdAndProvider(
    db,
    userId,
    provider
  );

  if (!account || !account.refreshToken) {
    throw new Error(`No refresh token found for provider ${provider}`);
  }

  // Check if the access token is still valid
  if (account.accessTokenExpiresAt && new Date(account.accessTokenExpiresAt) > new Date()) {
    return {
      accessToken: account.accessToken,
      expiresAt: account.accessTokenExpiresAt,
      refreshed: false
    };
  }

  // Get the provider configuration directly from the auth instance
  // Better Auth stores the genericOAuth config in the auth instance itself
  let providerConfig = (auth as any).genericOAuth?.providers?.[provider] || 
                      (auth as any).options?.genericOAuth?.providers?.[provider];
  
  if (!providerConfig) {
    // Try to find it in the initial configuration
    const providers: Record<string, any> = {
      hubspot: {
        tokenUrl: "https://api.hubapi.com/oauth/v1/token",
        authentication: "post" as const,
      },
      pandadoc: {
        tokenUrl: "https://api.pandadoc.com/oauth2/access_token",
        authentication: "post" as const,
      },
      xero: {
        tokenUrl: "https://identity.xero.com/connect/token",
        authentication: "basic" as const,
        clientId: process.env.XERO_CLIENT_ID,
        clientSecret: process.env.XERO_CLIENT_SECRET,
      }
    };
    
    const config = providers[provider];
    if (!config) {
      throw new Error(`Provider ${provider} not configured`);
    }
    
    // Use the hardcoded config
    Object.assign(config, {
      clientId: config.clientId || process.env[`${provider.toUpperCase()}_CLIENT_ID`],
      clientSecret: config.clientSecret || process.env[`${provider.toUpperCase()}_CLIENT_SECRET`],
    });
    
    if (!config.clientId || !config.clientSecret) {
      throw new Error(`Missing client credentials for provider ${provider}`);
    }
    
    providerConfig = config;
  }

  // Refresh the token
  try {
    const refreshResponse = await fetch(providerConfig.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(providerConfig.authentication === 'basic' ? {
          'Authorization': `Basic ${Buffer.from(`${providerConfig.clientId}:${providerConfig.clientSecret}`).toString('base64')}`
        } : {})
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        ...(providerConfig.authentication === 'post' ? {
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret
        } : {})
      }).toString()
    });
    
    if (!refreshResponse.ok) {
      const errorData = await refreshResponse.json();
      throw new Error(errorData.error || 'Failed to refresh token');
    }
    
    const refreshedTokens = await refreshResponse.json();
    
    // Update the account with new tokens
    const now = new Date();
    const accessTokenExpiresAt = refreshedTokens.expires_in 
      ? new Date(now.getTime() + refreshedTokens.expires_in * 1000)
      : null;
    
    await db.query(
      `UPDATE account 
      SET 
        "accessToken" = $1,
        "refreshToken" = $2,
        "accessTokenExpiresAt" = $3,
        "refreshTokenExpiresAt" = $4,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE 
        "userId" = $5
        AND "providerId" = $6`,
      [
        refreshedTokens.access_token,
        refreshedTokens.refresh_token || account.refreshToken,
        accessTokenExpiresAt,
        null,
        userId,
        provider
      ]
    );

    return {
      accessToken: refreshedTokens.access_token,
      expiresAt: accessTokenExpiresAt,
      refreshed: true
    };
  } catch (refreshError: any) {
    console.error(`Failed to refresh token for ${provider}:`, refreshError);
    throw new Error(`Failed to refresh ${provider} token: ${refreshError.message}`);
  }
}