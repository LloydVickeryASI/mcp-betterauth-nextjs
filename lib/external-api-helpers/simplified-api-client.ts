import { auth } from '@/lib/auth';
import * as Sentry from '@sentry/nextjs';
import { rateLimiter } from './rate-limiter';
import { withRetry, providerRetryConfigs } from './retry';
import { ApiError, mapProviderError, providerErrorMappers, ApiErrorCode } from './errors';
import { apiLogger } from './logging';
import { circuitBreakerManager, providerCircuitConfigs } from './circuit-breaker';
import { cacheManager, CacheKeyBuilder } from './cache';
import { getProviderConfig, formatApiKeyHeader, getSystemApiKey } from '@/lib/providers/config';
import { getAccountById, getAccountByUserIdAndProvider } from '@/lib/db-queries';
import { Pool } from '@neondatabase/serverless';
import { getBaseUrl } from '@/lib/get-base-url';
import { createLogger } from '@/lib/logger';

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
  userToken?: string; // Bearer token for refresh endpoint
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
      version = undefined; // Provider config doesn't have version
    } else {
      // Fall back to legacy endpoints
      const endpoint = providerEndpoints[provider];
      if (!endpoint) {
        throw new ApiError(
          ApiErrorCode.BAD_REQUEST,
          `Unknown provider: ${provider}`,
          {
            provider,
            operation,
            originalError: null,
            retryable: false,
          }
        );
      }
      baseUrl = endpoint.baseUrl;
      version = endpoint.version;
    }
    
    const url = `${baseUrl}${version ? `/${version}` : ''}${path}`;
    
    // Check cache for GET requests
    const cacheKey = options.cache?.enabled && options.method === 'GET'
      ? CacheKeyBuilder.build({
          provider,
          operation,
          ...options.query,
          customKey: options.cache.key
        })
      : null;
    
    if (cacheKey) {
      const cached = cacheManager.getCache(provider).get(cacheKey) as ApiResponse<T> | undefined;
      if (cached) {
        return { ...cached, cached: true };
      }
    }
    
    // Apply rate limiting
    if (!options.skipRateLimit) {
      await rateLimiter.acquire(provider, userId);
    }
    
    // Create the request function
    const makeRequest = async (): Promise<ApiResponse<T>> => {
      try {
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
            const db = auth.options.database as Pool;
            const account = accountId
              ? await getAccountById(db, accountId)
              : await getAccountByUserIdAndProvider(db, userId, provider);
            
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
            
            // Check if token is expired and refresh if needed
            let accessToken = account.accessToken;
            if (account.accessTokenExpiresAt && new Date(account.accessTokenExpiresAt) <= new Date()) {
              // Token is expired, try to refresh it
              if (account.refreshToken) {
                try {
                  const refreshResponse = await fetch(`${getBaseUrl()}/api/auth/refresh/${provider}`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${options.userToken}`,
                      'Content-Type': 'application/json',
                    },
                  });
                  
                  if (refreshResponse.ok) {
                    const refreshData = await refreshResponse.json();
                    accessToken = refreshData.accessToken;
                    const logger = createLogger({ component: 'api.auth', provider, userId });
                    logger.info('Refreshed expired token', { provider });
                  } else {
                    const logger = createLogger({ component: 'api.auth', provider, userId });
                    logger.warn('Failed to refresh token, using potentially expired token', { provider });
                  }
                } catch (refreshError) {
                  const logger = createLogger({ component: 'api.auth', provider, userId });
                  logger.error('Error refreshing token', refreshError, { provider });
                  // Continue with the expired token - let the API call fail naturally
                }
              } else {
                const logger = createLogger({ component: 'api.auth', provider, userId });
                logger.warn('Token expired but no refresh token available', { provider });
              }
            }
            
            authHeaders = { 'Authorization': `Bearer ${accessToken}` };
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
      } catch (outerError) {
        console.error("Error in makeRequest:", outerError);
        throw outerError;
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
      providerRetryConfigs[provider]
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
    return this.request<T>(
      provider,
      userId,
      accountId,
      path,
      operation,
      { ...options, method: 'GET' }
    );
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
    return this.request<T>(
      provider,
      userId,
      accountId,
      path,
      operation,
      { ...options, method: 'POST', body }
    );
  }
  
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    const sensitiveFields = ['authorization', 'api-key', 'x-api-key'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
  
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    
    if (contentType?.includes('text/')) {
      const text = await response.text();
      return text as unknown as T;
    }
    
    // For other content types, return as blob
    const blob = await response.blob();
    return blob as unknown as T;
  }
}

// Export singleton instance
export const apiClient = new SimplifiedApiClient();