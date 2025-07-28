import { auth } from '@/lib/auth';
import { rateLimiter } from './rate-limiter';
import { withRetry, providerRetryConfigs } from './retry';
import { ApiError, mapProviderError, providerErrorMappers, ApiErrorCode } from './errors';
import { apiLogger } from './logging';
import { circuitBreakerManager, providerCircuitConfigs } from './circuit-breaker';
import { cacheManager, CacheKeyBuilder } from './cache';
import { getProviderConfig, formatApiKeyHeader, getSystemApiKey } from '@/lib/providers/config';

// Legacy provider endpoints for backward compatibility
// New providers should be defined in /lib/providers/config.ts
const providerEndpoints: Record<string, { baseUrl: string; version?: string }> = {
  hubspot: {
    baseUrl: 'https://api.hubapi.com/crm/v3',
    version: undefined,
  },
  pandadoc: {
    baseUrl: 'https://api.pandadoc.com/public',
    version: 'v1',
  },
};

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string | number | boolean>;
  cache?: {
    enabled: boolean;
    ttlMs?: number;
    key?: string;
  };
  skipRateLimit?: boolean;
  skipRetry?: boolean;
  skipCircuitBreaker?: boolean;
  authMethod?: 'oauth' | 'system';
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  cached?: boolean;
}

export class SimplifiedApiClient {
  async request<T = any>(
    provider: string,
    userId: string,
    accountId: string | undefined,
    path: string,
    operation: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    // Try to get from provider config first
    const providerConfig = getProviderConfig(provider);
    let baseUrl: string;
    let version: string | undefined;
    
    if (providerConfig) {
      baseUrl = providerConfig.baseUrl;
      // Extract version from base URL if it ends with a version pattern
      const versionMatch = baseUrl.match(/\/v\d+$/);
      if (versionMatch) {
        version = undefined; // Version is already in base URL
      }
    } else {
      // Fallback to legacy endpoints
      const endpoint = providerEndpoints[provider];
      if (!endpoint) {
        throw new Error(`Unknown provider: ${provider}`);
      }
      baseUrl = endpoint.baseUrl;
      version = endpoint.version;
    }
    
    // Build URL
    const basePath = version ? `/${version}` : '';
    const url = `${baseUrl}${basePath}${path}`;
    
    // Build cache key if caching is enabled
    let cacheKey: string | undefined;
    if (options.cache?.enabled && options.method === 'GET') {
      cacheKey = options.cache.key || CacheKeyBuilder.build({
        provider,
        userId,
        path,
        query: options.query,
      });
      
      // Check cache first
      const cached = cacheManager.getCache(provider).get(cacheKey);
      if (cached) {
        return {
          ...(cached as ApiResponse<T>),
          cached: true,
        };
      }
    }
    
    // Apply rate limiting
    if (!options.skipRateLimit) {
      await rateLimiter.acquire(provider, userId);
    }
    
    // Create the request function
    const makeRequest = async (): Promise<ApiResponse<T>> => {
      let authHeaders: Record<string, string> = {};
      
      // Determine authentication method
      if (options.authMethod === 'system') {
        // Use system API key
        const systemApiKey = getSystemApiKey(provider);
        if (!systemApiKey) {
          throw new ApiError(
            ApiErrorCode.UNAUTHORIZED,
            'System API key not configured',
            {
              provider,
              operation,
              originalError: null,
              retryable: false,
            }
          );
        }
        authHeaders = formatApiKeyHeader(provider, systemApiKey);
      } else {
        // Default to OAuth
        // Get access token from the database
        // Note: Better Auth will handle refresh automatically when we call their API endpoints
        const db = auth.options.database as any;
        const account = accountId
          ? db.prepare('SELECT * FROM account WHERE id = ?').get(accountId)
          : db.prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?').get(userId, provider);
        
        if (!account?.accessToken) {
          throw new ApiError(
            ApiErrorCode.UNAUTHORIZED,
            'No access token available',
            {
              provider,
              operation,
              originalError: null,
              retryable: false,
            }
          );
        }
        
        authHeaders = { 'Authorization': `Bearer ${account.accessToken}` };
      }
      
      // Build headers
      const headers = {
        ...authHeaders,
        'Content-Type': 'application/json',
        ...options.headers,
      };
      
      // Build URL with query params
      const urlObj = new URL(url);
      if (options.query) {
        Object.entries(options.query).forEach(([key, value]) => {
          urlObj.searchParams.append(key, String(value));
        });
      }
      
      // Log request
      const logResponse = apiLogger.createRequestLogger({
        provider,
        operation,
        userId,
      });
      
      const requestLog = {
        timestamp: new Date(),
        provider,
        operation,
        method: options.method || 'GET',
        url: urlObj.toString(),
        headers: this.sanitizeHeaders(headers),
        body: options.body,
      };
      
      const logComplete = logResponse(requestLog);
      
      try {
        // Make the request
        const response = await fetch(urlObj.toString(), {
          method: options.method || 'GET',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });
        
        // Parse response
        const responseData = await this.parseResponse<T>(response);
        
        // Log response
        logComplete({
          ...requestLog,
          duration: 0, // Will be calculated by logger
          status: response.status,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          responseBody: responseData,
        });
        
        // Handle errors
        if (!response.ok) {
          const errorMapper = providerErrorMappers[provider] || mapProviderError;
          throw errorMapper(operation, {
            response: {
              status: response.status,
              data: responseData,
              headers: Object.fromEntries(response.headers.entries()),
            },
          });
        }
        
        const result: ApiResponse<T> = {
          data: responseData,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
        };
        
        // Cache successful GET responses
        if (cacheKey && options.cache?.enabled) {
          cacheManager.getCache(provider).set(
            cacheKey,
            result,
            options.cache.ttlMs
          );
        }
        
        return result;
      } catch (error) {
        // Log error
        logComplete({
          ...requestLog,
          duration: 0,
          status: 0,
          error,
        });
        
        // Map to ApiError if needed
        if (error instanceof ApiError) {
          throw error;
        }
        
        const errorMapper = providerErrorMappers[provider] || mapProviderError;
        throw errorMapper(operation, error);
      }
    };
    
    // Apply circuit breaker
    const requestWithCircuitBreaker = options.skipCircuitBreaker
      ? makeRequest
      : () => circuitBreakerManager.execute(
          `${provider}:${operation}`,
          makeRequest,
          providerCircuitConfigs[provider]
        );
    
    // Apply retry logic
    if (options.skipRetry) {
      return requestWithCircuitBreaker();
    }
    
    return withRetry(
      requestWithCircuitBreaker,
      providerRetryConfigs[provider],
      (attempt, error, delayMs) => {
        console.log(
          `Retrying ${provider}:${operation} (attempt ${attempt}) after ${delayMs}ms`,
          error.message
        );
      }
    );
  }
  
  // Convenience methods
  async get<T = any>(
    provider: string,
    userId: string,
    accountId: string | undefined,
    path: string,
    operation: string,
    options?: Omit<ApiRequestOptions, 'method'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(provider, userId, accountId, path, operation, {
      ...options,
      method: 'GET',
    });
  }
  
  async post<T = any>(
    provider: string,
    userId: string,
    accountId: string | undefined,
    path: string,
    operation: string,
    body: any,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(provider, userId, accountId, path, operation, {
      ...options,
      method: 'POST',
      body,
    });
  }
  
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    
    const text = await response.text();
    return text as unknown as T;
  }
  
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveKeys = ['authorization', 'api-key', 'x-api-key'];
    
    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}

// Helper to check if a provider is connected
export async function isProviderConnected(
  userId: string,
  provider: string,
  options?: { allowSystemKey?: boolean }
): Promise<{ connected: boolean; accountId?: string; authMethod?: 'oauth' | 'system' }> {
  try {
    // Check if user has an account for this provider
    const db = auth.options.database as any;
    const account = db
      .prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?')
      .get(userId, provider);
    
    if (account?.accessToken) {
      // Check if token exists (Better Auth will handle refresh when needed)
      // TODO: In the future, we could check accessTokenExpiresAt to see if it's expired
      // and preemptively mark as not connected, but for now we'll let the API call fail
      // and handle the 401 response
      
      return { 
        connected: true,
        accountId: account.id,
        authMethod: 'oauth'
      };
    }
    
    // Check system API key if allowed
    if (options?.allowSystemKey) {
      const systemApiKey = getSystemApiKey(provider);
      if (systemApiKey) {
        return { 
          connected: true,
          authMethod: 'system'
        };
      }
    }
    
    return { connected: false };
  } catch {
    return { connected: false };
  }
}

// Singleton instance
export const apiClient = new SimplifiedApiClient();