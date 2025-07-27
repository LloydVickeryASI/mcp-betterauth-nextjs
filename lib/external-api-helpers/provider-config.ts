import { RateLimiterConfig } from './rate-limiter';
import { RetryConfig } from './retry';

export interface ProviderEndpoint {
  baseUrl: string;
  version?: string;
  timeout?: number;
}

export interface ProviderFeatures {
  supportsBulkOperations?: boolean;
  supportsWebhooks?: boolean;
  supportsPagination?: boolean;
  maxPageSize?: number;
  maxRequestSize?: number;
}

export interface ProviderAuth {
  type: 'oauth2' | 'api_key' | 'basic';
  tokenEndpoint?: string;
  authorizationEndpoint?: string;
  scopes?: string[];
  headerName?: string;
  headerPrefix?: string;
}

export interface ProviderConfig {
  name: string;
  displayName: string;
  endpoint: ProviderEndpoint;
  auth: ProviderAuth;
  features: ProviderFeatures;
  rateLimiter?: RateLimiterConfig;
  retry?: RetryConfig;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export const providerConfigs: Record<string, ProviderConfig> = {
  hubspot: {
    name: 'hubspot',
    displayName: 'HubSpot',
    endpoint: {
      baseUrl: 'https://api.hubapi.com',
      version: 'v3',
      timeout: 30000,
    },
    auth: {
      type: 'oauth2',
      tokenEndpoint: 'https://api.hubapi.com/oauth/v1/token',
      authorizationEndpoint: 'https://app.hubspot.com/oauth/authorize',
      scopes: ['contacts', 'content', 'forms'],
      headerName: 'Authorization',
      headerPrefix: 'Bearer',
    },
    features: {
      supportsBulkOperations: true,
      supportsWebhooks: true,
      supportsPagination: true,
      maxPageSize: 100,
      maxRequestSize: 10 * 1024 * 1024, // 10MB
    },
    rateLimiter: {
      maxRequests: 100,
      windowMs: 10000,
      maxBurst: 10,
    },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
    },
    headers: {
      'Content-Type': 'application/json',
    },
    enabled: !!process.env.HUBSPOT_CLIENT_ID,
  },
  
  pandadoc: {
    name: 'pandadoc',
    displayName: 'PandaDoc',
    endpoint: {
      baseUrl: 'https://api.pandadoc.com',
      version: 'v1',
      timeout: 60000,
    },
    auth: {
      type: 'oauth2',
      tokenEndpoint: 'https://api.pandadoc.com/oauth2/access_token',
      authorizationEndpoint: 'https://app.pandadoc.com/oauth2/authorize',
      scopes: ['read', 'write'],
      headerName: 'Authorization',
      headerPrefix: 'Bearer',
    },
    features: {
      supportsBulkOperations: false,
      supportsWebhooks: true,
      supportsPagination: true,
      maxPageSize: 50,
      maxRequestSize: 5 * 1024 * 1024, // 5MB
    },
    rateLimiter: {
      maxRequests: 30,
      windowMs: 60000,
      maxBurst: 5,
    },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 2000,
      maxDelayMs: 20000,
    },
    headers: {
      'Content-Type': 'application/json',
    },
    enabled: !!process.env.PANDADOC_CLIENT_ID,
  },
};

export class ProviderConfigManager {
  private configs: Map<string, ProviderConfig>;
  
  constructor(configs: Record<string, ProviderConfig>) {
    this.configs = new Map(Object.entries(configs));
  }
  
  getConfig(provider: string): ProviderConfig {
    const config = this.configs.get(provider);
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    
    if (!config.enabled) {
      throw new Error(`Provider ${provider} is not enabled`);
    }
    
    return config;
  }
  
  getAllConfigs(): ProviderConfig[] {
    return Array.from(this.configs.values());
  }
  
  getEnabledConfigs(): ProviderConfig[] {
    return this.getAllConfigs().filter(config => config.enabled);
  }
  
  isEnabled(provider: string): boolean {
    const config = this.configs.get(provider);
    return config?.enabled ?? false;
  }
  
  getEndpointUrl(provider: string, path: string): string {
    const config = this.getConfig(provider);
    const { baseUrl, version } = config.endpoint;
    
    // Clean up path
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    // Build URL with version if specified
    if (version) {
      return `${baseUrl}/${version}${cleanPath}`;
    }
    
    return `${baseUrl}${cleanPath}`;
  }
  
  getAuthHeaders(provider: string, token: string): Record<string, string> {
    const config = this.getConfig(provider);
    const { auth } = config;
    
    if (auth.type === 'oauth2' && auth.headerName) {
      const prefix = auth.headerPrefix ? `${auth.headerPrefix} ` : '';
      return {
        [auth.headerName]: `${prefix}${token}`,
      };
    }
    
    return {};
  }
  
  getDefaultHeaders(provider: string): Record<string, string> {
    const config = this.getConfig(provider);
    return { ...config.headers };
  }
  
  // Update configuration at runtime (e.g., from database)
  updateConfig(provider: string, updates: Partial<ProviderConfig>): void {
    const existing = this.configs.get(provider);
    if (!existing) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    
    this.configs.set(provider, {
      ...existing,
      ...updates,
    });
  }
}

// Singleton instance
export const providerConfigManager = new ProviderConfigManager(providerConfigs);