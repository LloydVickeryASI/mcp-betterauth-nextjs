export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes before closing
  timeout: number; // Time in ms before attempting to close
  volumeThreshold: number; // Minimum requests before evaluating
  errorFilter?: (error: any) => boolean; // Which errors count as failures
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitStats {
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: number;
  consecutiveSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    totalRequests: 0,
    consecutiveSuccesses: 0,
  };
  private nextAttempt: number = 0;
  
  constructor(private config: CircuitBreakerConfig) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      
      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.stats.consecutiveSuccesses = 0;
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.stats.successes++;
    this.stats.totalRequests++;
    this.stats.consecutiveSuccesses++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) {
        this.close();
      }
    }
  }
  
  private onFailure(error: any): void {
    // Check if error should be counted
    if (this.config.errorFilter && !this.config.errorFilter(error)) {
      return;
    }
    
    this.stats.failures++;
    this.stats.totalRequests++;
    this.stats.lastFailureTime = Date.now();
    this.stats.consecutiveSuccesses = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.open();
    } else if (this.state === CircuitState.CLOSED) {
      if (
        this.stats.totalRequests >= this.config.volumeThreshold &&
        this.stats.failures >= this.config.failureThreshold
      ) {
        this.open();
      }
    }
  }
  
  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.timeout;
    
    // Reset stats for next evaluation period
    this.stats = {
      failures: 0,
      successes: 0,
      totalRequests: 0,
      consecutiveSuccesses: 0,
      lastFailureTime: this.stats.lastFailureTime,
    };
  }
  
  private close(): void {
    this.state = CircuitState.CLOSED;
    
    // Reset stats
    this.stats = {
      failures: 0,
      successes: 0,
      totalRequests: 0,
      consecutiveSuccesses: 0,
    };
  }
  
  getState(): CircuitState {
    return this.state;
  }
  
  getStats(): Readonly<CircuitStats> {
    return { ...this.stats };
  }
  
  reset(): void {
    this.close();
  }
}

export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  
  getBreaker(key: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(key);
    
    if (!breaker) {
      const defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000, // 1 minute
        volumeThreshold: 10,
        errorFilter: (error: any) => {
          // Count network errors and 5xx as failures
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return true;
          }
          
          if (error.response?.status >= 500) {
            return true;
          }
          
          return false;
        },
      };
      
      breaker = new CircuitBreaker({ ...defaultConfig, ...config });
      this.breakers.set(key, breaker);
    }
    
    return breaker;
  }
  
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const breaker = this.getBreaker(key, config);
    return breaker.execute(fn);
  }
  
  getStatus(): Record<string, { state: CircuitState; stats: CircuitStats }> {
    const status: Record<string, { state: CircuitState; stats: CircuitStats }> = {};
    
    for (const [key, breaker] of this.breakers.entries()) {
      status[key] = {
        state: breaker.getState(),
        stats: breaker.getStats() as CircuitStats,
      };
    }
    
    return status;
  }
  
  reset(key?: string): void {
    if (key) {
      this.breakers.get(key)?.reset();
    } else {
      for (const breaker of this.breakers.values()) {
        breaker.reset();
      }
    }
  }
}

// Provider-specific circuit breaker configurations
export const providerCircuitConfigs: Record<string, Partial<CircuitBreakerConfig>> = {
  hubspot: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000, // 30 seconds
    volumeThreshold: 10,
  },
  pandadoc: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    volumeThreshold: 5,
  },
};

// Singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();