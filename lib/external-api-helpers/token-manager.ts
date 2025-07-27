import { auth } from '@/lib/auth';
import { ApiError, ApiErrorCode } from './errors';

export interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  provider: string;
  userId: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export class TokenManager {
  private tokenCache = new Map<string, TokenInfo>();
  private refreshPromises = new Map<string, Promise<TokenInfo>>();
  
  private getCacheKey(userId: string, provider: string): string {
    return `${userId}:${provider}`;
  }
  
  async getValidToken(userId: string, provider: string): Promise<string> {
    const cacheKey = this.getCacheKey(userId, provider);
    
    // Check cache first
    const cached = this.tokenCache.get(cacheKey);
    if (cached && this.isTokenValid(cached)) {
      return cached.accessToken;
    }
    
    // Check if refresh is already in progress
    const existingRefresh = this.refreshPromises.get(cacheKey);
    if (existingRefresh) {
      const refreshed = await existingRefresh;
      return refreshed.accessToken;
    }
    
    // Start refresh process
    const refreshPromise = this.refreshToken(userId, provider);
    this.refreshPromises.set(cacheKey, refreshPromise);
    
    try {
      const refreshed = await refreshPromise;
      return refreshed.accessToken;
    } finally {
      this.refreshPromises.delete(cacheKey);
    }
  }
  
  private isTokenValid(token: TokenInfo): boolean {
    if (!token.expiresAt) return true; // No expiry info, assume valid
    
    // Check if token expires in next 5 minutes
    const bufferMs = 5 * 60 * 1000;
    return token.expiresAt.getTime() > Date.now() + bufferMs;
  }
  
  private async refreshToken(userId: string, provider: string): Promise<TokenInfo> {
    try {
      // Get the user's account for this provider
      const account = await this.getProviderAccount(userId, provider);
      
      if (!account?.refreshToken) {
        throw new ApiError(
          ApiErrorCode.TOKEN_INVALID,
          'No refresh token available',
          {
            provider,
            operation: 'token_refresh',
            originalError: null,
            retryable: false,
          }
        );
      }
      
      // Refresh the token using provider-specific logic
      const refreshed = await this.performTokenRefresh(provider, account.refreshToken);
      
      // Update the account with new tokens
      await this.updateProviderAccount(userId, provider, refreshed);
      
      // Create new token info
      const tokenInfo: TokenInfo = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresIn
          ? new Date(Date.now() + refreshed.expiresIn * 1000)
          : undefined,
        provider,
        userId,
      };
      
      // Cache the new token
      const cacheKey = this.getCacheKey(userId, provider);
      this.tokenCache.set(cacheKey, tokenInfo);
      
      return tokenInfo;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      
      throw new ApiError(
        ApiErrorCode.TOKEN_INVALID,
        'Failed to refresh token',
        {
          provider,
          operation: 'token_refresh',
          originalError: error,
          retryable: false,
        }
      );
    }
  }
  
  private async getProviderAccount(userId: string, provider: string): Promise<any> {
    // Get database from auth options
    const db = auth.options.database as any;
    
    const account = db
      .prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?')
      .get(userId, provider);
    
    return account;
  }
  
  private async updateProviderAccount(
    userId: string,
    provider: string,
    tokens: TokenRefreshResult
  ): Promise<void> {
    const db = auth.options.database as any;
    
    const expiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
      : null;
    
    db.prepare(`
      UPDATE account 
      SET accessToken = ?, 
          refreshToken = ?, 
          accessTokenExpiresAt = ?
      WHERE userId = ? AND providerId = ?
    `).run(
      tokens.accessToken,
      tokens.refreshToken || null,
      expiresAt,
      userId,
      provider
    );
  }
  
  private async performTokenRefresh(
    provider: string,
    refreshToken: string
  ): Promise<TokenRefreshResult> {
    // Provider-specific refresh logic
    const refreshers = {
      hubspot: () => this.refreshHubSpotToken(refreshToken),
      pandadoc: () => this.refreshPandaDocToken(refreshToken),
    };
    
    const refresher = refreshers[provider as keyof typeof refreshers];
    if (!refresher) {
      throw new Error(`No refresh implementation for provider: ${provider}`);
    }
    
    return refresher();
  }
  
  private async refreshHubSpotToken(refreshToken: string): Promise<TokenRefreshResult> {
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HubSpot token refresh failed: ${error.message}`);
    }
    
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }
  
  private async refreshPandaDocToken(refreshToken: string): Promise<TokenRefreshResult> {
    const response = await fetch('https://api.pandadoc.com/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.PANDADOC_CLIENT_ID!,
        client_secret: process.env.PANDADOC_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`PandaDoc token refresh failed: ${error.message}`);
    }
    
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }
  
  // Clear cached token (e.g., after disconnect)
  clearToken(userId: string, provider: string): void {
    const cacheKey = this.getCacheKey(userId, provider);
    this.tokenCache.delete(cacheKey);
  }
  
  // Pre-cache token info (e.g., from fresh auth)
  cacheToken(tokenInfo: TokenInfo): void {
    const cacheKey = this.getCacheKey(tokenInfo.userId, tokenInfo.provider);
    this.tokenCache.set(cacheKey, tokenInfo);
  }
}

// Singleton instance
export const tokenManager = new TokenManager();