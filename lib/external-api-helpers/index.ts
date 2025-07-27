// Main API client
export { apiClient, type ApiRequestOptions, type ApiResponse } from './api-client';

// Rate limiting
export { rateLimiter, type RateLimiterConfig } from './rate-limiter';

// Retry logic
export { withRetry, type RetryConfig } from './retry';

// Error handling
export {
  ApiError,
  ApiErrorCode,
  type ApiErrorDetails,
  mapProviderError,
} from './errors';

// Logging
export { apiLogger, type ApiRequestLog, type ApiResponseLog } from './logging';

// Token management
export { tokenManager, type TokenInfo } from './token-manager';

// Provider configuration
export {
  providerConfigManager,
  type ProviderConfig,
  type ProviderEndpoint,
  type ProviderFeatures,
  type ProviderAuth,
} from './provider-config';

// Circuit breaker
export {
  circuitBreakerManager,
  CircuitState,
  type CircuitBreakerConfig,
} from './circuit-breaker';

// Caching
export {
  cacheManager,
  CacheKeyBuilder,
  type CacheConfig,
} from './cache';

// Import managers for helper functions
import { tokenManager as tm } from './token-manager';
import { cacheManager as cm } from './cache';
import { circuitBreakerManager as cbm } from './circuit-breaker';

// Helper function to check if a provider is connected for a user
export async function isProviderConnected(
  userId: string,
  provider: string
): Promise<boolean> {
  try {
    await tm.getValidToken(userId, provider);
    return true;
  } catch {
    return false;
  }
}

// Helper to clear all caches and reset circuit breakers
export function resetAllHelpers(): void {
  cm.clearAll();
  cbm.reset();
}