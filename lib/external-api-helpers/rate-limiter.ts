export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  maxBurst?: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number;
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private queues: Map<string, Array<() => void>> = new Map();

  constructor(private config: Record<string, RateLimiterConfig>) {}

  async acquire(provider: string, key?: string): Promise<void> {
    const bucketKey = `${provider}:${key || 'default'}`;
    const config = this.config[provider];
    
    if (!config) {
      throw new Error(`No rate limit configuration for provider: ${provider}`);
    }

    const bucket = this.getOrCreateBucket(bucketKey, config);
    
    if (this.tryConsumeToken(bucket)) {
      return;
    }

    // Queue the request
    return new Promise((resolve) => {
      const queue = this.queues.get(bucketKey) || [];
      queue.push(resolve);
      this.queues.set(bucketKey, queue);
      
      // Schedule processing
      this.scheduleQueueProcessing(bucketKey, bucket, config);
    });
  }

  private getOrCreateBucket(key: string, config: RateLimiterConfig): TokenBucket {
    let bucket = this.buckets.get(key);
    
    if (!bucket) {
      const maxTokens = config.maxBurst || config.maxRequests;
      bucket = {
        tokens: maxTokens,
        lastRefill: Date.now(),
        maxTokens,
        refillRate: config.maxRequests / config.windowMs,
      };
      this.buckets.set(key, bucket);
    }
    
    // Refill tokens
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = timePassed * bucket.refillRate;
    
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    
    return bucket;
  }

  private tryConsumeToken(bucket: TokenBucket): boolean {
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  private scheduleQueueProcessing(
    bucketKey: string,
    bucket: TokenBucket,
    config: RateLimiterConfig
  ): void {
    const timeUntilNextToken = (1 - bucket.tokens) / bucket.refillRate;
    
    setTimeout(() => {
      const queue = this.queues.get(bucketKey) || [];
      const resolve = queue.shift();
      
      if (resolve) {
        const updatedBucket = this.getOrCreateBucket(bucketKey, config);
        if (this.tryConsumeToken(updatedBucket)) {
          resolve();
        } else {
          // Re-queue
          queue.unshift(resolve);
          this.scheduleQueueProcessing(bucketKey, updatedBucket, config);
        }
      }
      
      if (queue.length === 0) {
        this.queues.delete(bucketKey);
      } else {
        this.queues.set(bucketKey, queue);
      }
    }, Math.max(timeUntilNextToken, 10));
  }

  // Get current status for monitoring
  getStatus(provider: string, key?: string): {
    availableTokens: number;
    queueLength: number;
  } | null {
    const bucketKey = `${provider}:${key || 'default'}`;
    const config = this.config[provider];
    
    if (!config) return null;
    
    const bucket = this.getOrCreateBucket(bucketKey, config);
    const queue = this.queues.get(bucketKey) || [];
    
    return {
      availableTokens: Math.floor(bucket.tokens),
      queueLength: queue.length,
    };
  }
}

// Provider-specific rate limit configurations
export const providerRateLimits: Record<string, RateLimiterConfig> = {
  hubspot: {
    maxRequests: 100,
    windowMs: 10000, // 100 requests per 10 seconds
    maxBurst: 10,
  },
  pandadoc: {
    maxRequests: 30,
    windowMs: 60000, // 30 requests per minute
    maxBurst: 5,
  },
  // Add more providers as needed
};

// Singleton instance
export const rateLimiter = new RateLimiter(providerRateLimits);