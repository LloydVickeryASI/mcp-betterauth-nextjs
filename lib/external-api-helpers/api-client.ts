import { rateLimiter } from './rate-limiter';
import { withRetry, providerRetryConfigs } from './retry';
import { ApiError, mapProviderError, providerErrorMappers } from './errors';
import { apiLogger } from './logging';
import { tokenManager } from './token-manager';
import { providerConfigManager } from './provider-config';
import { circuitBreakerManager, providerCircuitConfigs } from './circuit-breaker';
import { cacheManager, CacheKeyBuilder } from './cache';

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
  skipAuth?: boolean;
  skipRateLimit?: boolean;
  skipRetry?: boolean;
  skipCircuitBreaker?: boolean;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  cached?: boolean;
}

export class ExternalApiClient {
  async request<T = any>(
    provider: string,
    userId: string,
    path: string,
    operation: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const config = providerConfigManager.getConfig(provider);
    const url = providerConfigManager.getEndpointUrl(provider, path);
    
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
      // Get auth token
      let authHeaders: Record<string, string> = {};
      if (!options.skipAuth) {
        const token = await tokenManager.getValidToken(userId, provider);
        authHeaders = providerConfigManager.getAuthHeaders(provider, token);
      }
      
      // Build final headers
      const headers = {
        ...providerConfigManager.getDefaultHeaders(provider),
        ...authHeaders,
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
          signal: AbortSignal.timeout(config.endpoint.timeout || 30000),
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
    path: string,
    operation: string,
    options?: Omit<ApiRequestOptions, 'method'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(provider, userId, path, operation, {
      ...options,
      method: 'GET',
    });
  }
  
  async post<T = any>(
    provider: string,
    userId: string,
    path: string,
    operation: string,
    body: any,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(provider, userId, path, operation, {
      ...options,
      method: 'POST',
      body,
    });
  }
  
  async put<T = any>(
    provider: string,
    userId: string,
    path: string,
    operation: string,
    body: any,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(provider, userId, path, operation, {
      ...options,
      method: 'PUT',
      body,
    });
  }
  
  async delete<T = any>(
    provider: string,
    userId: string,
    path: string,
    operation: string,
    options?: Omit<ApiRequestOptions, 'method'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(provider, userId, path, operation, {
      ...options,
      method: 'DELETE',
    });
  }
  
  // Helper methods
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    
    // For non-JSON responses, return as text
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
  
  // Status and monitoring
  getStatus() {
    return {
      rateLimiter: Object.fromEntries(
        providerConfigManager.getEnabledConfigs().map(config => [
          config.name,
          rateLimiter.getStatus(config.name),
        ])
      ),
      circuitBreakers: circuitBreakerManager.getStatus(),
      providers: providerConfigManager.getEnabledConfigs().map(c => ({
        name: c.name,
        displayName: c.displayName,
        enabled: c.enabled,
      })),
    };
  }
}

// Singleton instance
export const apiClient = new ExternalApiClient();