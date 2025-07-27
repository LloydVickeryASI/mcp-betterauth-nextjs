export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
  retryableErrors?: (error: any) => boolean;
}

const defaultRetryConfig: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrors: (error: any) => {
    // Retry on network errors and 5xx status codes
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    if (error.response?.status) {
      const status = error.response.status;
      return status >= 500 || status === 429; // Server errors and rate limit
    }
    
    return false;
  },
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig,
  onRetry?: (attempt: number, error: any, delayMs: number) => void
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config };
  let lastError: any;
  
  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === finalConfig.maxAttempts || !finalConfig.retryableErrors(error)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const baseDelay = Math.min(
        finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
        finalConfig.maxDelayMs
      );
      
      // Add jitter to prevent thundering herd
      const jitter = baseDelay * finalConfig.jitterFactor * (Math.random() * 2 - 1);
      const delayMs = Math.round(baseDelay + jitter);
      
      if (onRetry) {
        onRetry(attempt, error, delayMs);
      }
      
      await sleep(delayMs);
    }
  }
  
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Provider-specific retry configurations
export const providerRetryConfigs: Record<string, RetryConfig> = {
  hubspot: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    retryableErrors: (error: any) => {
      const status = error.response?.status;
      if (status === 429) return true; // Rate limit
      if (status >= 500) return true; // Server errors
      if (error.code === 'ECONNRESET') return true;
      return false;
    },
  },
  pandadoc: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 20000,
    retryableErrors: (error: any) => {
      const status = error.response?.status;
      if (status === 429 || status === 503) return true;
      if (status >= 500) return true;
      return false;
    },
  },
};