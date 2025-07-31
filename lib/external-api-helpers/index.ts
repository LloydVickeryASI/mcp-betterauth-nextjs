// Main API client - using simplified version
export { apiClient, type ApiRequestOptions, type ApiResponse } from './simplified-api-client';

// Database queries
export { isProviderConnected } from '../db-queries';

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

// Circuit breaker
export {
  circuitBreakerManager,
  CircuitState,
  type CircuitBreakerConfig,
} from './circuit-breaker';

// Import managers for helper functions
import { circuitBreakerManager as cbm } from './circuit-breaker';

// Helper to reset circuit breakers
export function resetAllHelpers(): void {
  cbm.reset();
}