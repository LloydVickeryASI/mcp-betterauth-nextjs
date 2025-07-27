export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  key: string;
}

export interface CacheConfig {
  ttlMs?: number; // Default TTL in milliseconds
  maxSize?: number; // Maximum number of entries
  keyPrefix?: string; // Prefix for all keys
}

export class SimpleCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  
  constructor(private config: CacheConfig = {}) {
    this.config = {
      ttlMs: 5 * 60 * 1000, // 5 minutes default
      maxSize: 1000,
      keyPrefix: '',
      ...config,
    };
  }
  
  get(key: string): T | undefined {
    const fullKey = this.getFullKey(key);
    const entry = this.cache.get(fullKey);
    
    if (!entry) {
      return undefined;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }
    
    // Update access order for LRU
    this.updateAccessOrder(fullKey);
    
    return entry.value;
  }
  
  set(key: string, value: T, ttlMs?: number): void {
    const fullKey = this.getFullKey(key);
    const expiresAt = Date.now() + (ttlMs || this.config.ttlMs!);
    
    // Remove old entry if exists
    if (this.cache.has(fullKey)) {
      this.removeFromAccessOrder(fullKey);
    }
    
    // Check size limit
    if (this.cache.size >= this.config.maxSize!) {
      this.evictLRU();
    }
    
    this.cache.set(fullKey, {
      value,
      expiresAt,
      key: fullKey,
    });
    
    this.accessOrder.push(fullKey);
  }
  
  delete(key: string): boolean {
    const fullKey = this.getFullKey(key);
    const deleted = this.cache.delete(fullKey);
    
    if (deleted) {
      this.removeFromAccessOrder(fullKey);
    }
    
    return deleted;
  }
  
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
  
  has(key: string): boolean {
    const value = this.get(key);
    return value !== undefined;
  }
  
  size(): number {
    return this.cache.size;
  }
  
  private getFullKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }
  
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }
  
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }
  
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder.shift()!;
    this.cache.delete(lruKey);
  }
  
  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }
  }
}

// Cache key builder utility
export class CacheKeyBuilder {
  static build(parts: Record<string, any>): string {
    const sortedParts = Object.entries(parts)
      .filter(([_, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        if (typeof value === 'object') {
          return `${key}:${JSON.stringify(value)}`;
        }
        return `${key}:${value}`;
      });
    
    return sortedParts.join(':');
  }
}

// Provider-specific cache configurations
export const providerCacheConfigs: Record<string, CacheConfig> = {
  hubspot: {
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxSize: 500,
    keyPrefix: 'hubspot:',
  },
  pandadoc: {
    ttlMs: 10 * 60 * 1000, // 10 minutes
    maxSize: 200,
    keyPrefix: 'pandadoc:',
  },
};

// Cache manager for multiple caches
export class CacheManager {
  private caches = new Map<string, SimpleCache>();
  
  getCache(provider: string): SimpleCache {
    let cache = this.caches.get(provider);
    
    if (!cache) {
      const config = providerCacheConfigs[provider] || {};
      cache = new SimpleCache(config);
      this.caches.set(provider, cache);
      
      // Set up periodic cleanup
      setInterval(() => cache!.cleanup(), 60000); // Every minute
    }
    
    return cache;
  }
  
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }
  
  clear(provider: string): void {
    this.caches.get(provider)?.clear();
  }
}

// Singleton instance
export const cacheManager = new CacheManager();