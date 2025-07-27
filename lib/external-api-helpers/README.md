# External API Helpers

A comprehensive set of helpers for managing external API calls with built-in rate limiting, retries, circuit breakers, caching, and more.

## Features

- 🚦 **Rate Limiting** - Prevent API overload with configurable limits per provider
- 🔄 **Automatic Retries** - Exponential backoff with jitter for transient failures
- 🔐 **OAuth Token Management** - Automatic token refresh before expiry
- 🛡️ **Circuit Breaker** - Prevent cascading failures when providers are down
- 💾 **Request Caching** - Reduce API calls with intelligent caching
- 📊 **Logging & Monitoring** - Automatic request/response logging with Sentry integration
- ⚡ **Unified API Client** - Single interface for all external API calls
- 🎯 **Error Standardization** - Consistent error handling across providers

## Quick Start

```typescript
import { apiClient, isProviderConnected } from "@/lib/external-api-helpers";

// Check if provider is connected
const isConnected = await isProviderConnected(userId, 'hubspot');

// Make an API call
const response = await apiClient.get(
  'hubspot',           // provider
  userId,              // user ID
  '/contacts/v1/lists', // API path
  'list_contacts',     // operation name
  {
    cache: {
      enabled: true,
      ttlMs: 60000   // Cache for 1 minute
    }
  }
);
```

## Provider Configuration

Add new providers in `provider-config.ts`:

```typescript
export const providerConfigs: Record<string, ProviderConfig> = {
  newProvider: {
    name: 'newProvider',
    displayName: 'New Provider',
    endpoint: {
      baseUrl: 'https://api.newprovider.com',
      version: 'v1',
      timeout: 30000,
    },
    auth: {
      type: 'oauth2',
      tokenEndpoint: 'https://api.newprovider.com/oauth/token',
      headerName: 'Authorization',
      headerPrefix: 'Bearer',
    },
    features: {
      supportsPagination: true,
      maxPageSize: 100,
    },
    rateLimiter: {
      maxRequests: 60,
      windowMs: 60000, // 60 requests per minute
      maxBurst: 10,
    },
    enabled: !!process.env.NEW_PROVIDER_CLIENT_ID,
  },
};
```

## API Client Methods

### GET Request
```typescript
const response = await apiClient.get(provider, userId, path, operation, options);
```

### POST Request
```typescript
const response = await apiClient.post(provider, userId, path, operation, body, options);
```

### PUT Request
```typescript
const response = await apiClient.put(provider, userId, path, operation, body, options);
```

### DELETE Request
```typescript
const response = await apiClient.delete(provider, userId, path, operation, options);
```

## Options

All methods accept these options:

```typescript
interface ApiRequestOptions {
  headers?: Record<string, string>;
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
```

## Error Handling

The helpers provide standardized error types:

```typescript
import { ApiError, ApiErrorCode } from "@/lib/external-api-helpers";

try {
  const response = await apiClient.get(...);
} catch (error) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ApiErrorCode.UNAUTHORIZED:
      case ApiErrorCode.TOKEN_EXPIRED:
        // Handle auth errors
        break;
      case ApiErrorCode.RATE_LIMITED:
        // Handle rate limiting
        console.log(`Retry after: ${error.details.retryAfter}s`);
        break;
      case ApiErrorCode.NOT_FOUND:
        // Handle not found
        break;
    }
  }
}
```

## Monitoring

Get system status:

```typescript
const status = apiClient.getStatus();
// Returns rate limiter status, circuit breaker states, and provider info
```

## Best Practices

1. **Always check provider connection** before making API calls
2. **Enable caching** for GET requests when appropriate
3. **Handle authentication errors** gracefully with connection URLs
4. **Use descriptive operation names** for better logging/monitoring
5. **Let errors bubble up** to the global error handler (Sentry)

## Environment Variables

Each provider requires environment variables:

```env
# HubSpot
HUBSPOT_CLIENT_ID=xxx
HUBSPOT_CLIENT_SECRET=xxx

# PandaDoc
PANDADOC_CLIENT_ID=xxx
PANDADOC_CLIENT_SECRET=xxx
```

## Creating a New Tool

Here's a complete example of how to create a new tool using these helpers:

```typescript
import { z } from "zod";
import type { ToolContext } from "@/lib/tools/register-tool";
import { apiClient, ApiError, ApiErrorCode, isProviderConnected } from "@/lib/external-api-helpers";

// Define your tool's input schema
export const searchContactsSchema = {
  query: z.string().describe("Search query for contacts")
};

export const searchContactsHandler = async (
  { query }: { query: string },
  context: ToolContext
) => {
  // Check if provider is connected
  const isConnected = await isProviderConnected(context.session.userId, 'hubspot');
  
  if (!isConnected) {
    const connectionsUrl = `${context.auth.options.baseURL}/connections`;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          authenticated: false,
          message: "HubSpot account not connected.",
          connectionsUrl
        }, null, 2)
      }],
    };
  }
  
  try {
    // Make API call with automatic rate limiting, retries, etc.
    const response = await apiClient.post(
      'hubspot',
      context.session.userId,
      '/crm/v3/objects/contacts/search',
      'search_contacts',
      { 
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "CONTAINS_TOKEN",
            value: query
          }]
        }],
        limit: 10
      },
      {
        cache: {
          enabled: true,
          ttlMs: 60000
        }
      }
    );
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          results: response.data.results,
          cached: response.cached
        }, null, 2)
      }],
    };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === ApiErrorCode.UNAUTHORIZED) {
        // Handle auth errors
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              authenticated: false,
              message: "Token expired. Please reconnect."
            }, null, 2)
          }],
        };
      }
    }
    throw error;
  }
};
```