# External API Helpers

A streamlined set of helpers for managing external API calls that leverages Better Auth's built-in token management while adding rate limiting, retries, circuit breakers, and caching.

## Features

- 🚦 **Rate Limiting** - Prevent API overload with configurable limits per provider
- 🔄 **Automatic Retries** - Exponential backoff with jitter for transient failures
- 🔐 **OAuth Token Management** - Uses Better Auth's automatic token refresh
- 🛡️ **Circuit Breaker** - Prevent cascading failures when providers are down
- 💾 **Request Caching** - Reduce API calls with intelligent caching
- 📊 **Logging & Monitoring** - Automatic request/response logging with Sentry integration
- ⚡ **Simplified API Client** - Clean interface that integrates with Better Auth
- 🎯 **Error Standardization** - Consistent error handling across providers

## Quick Start

```typescript
import { apiClient, isProviderConnected } from "@/lib/external-api-helpers";
import { Pool } from "@neondatabase/serverless";

// Check if provider is connected (returns connection status and account ID)
const db = new Pool({ connectionString: process.env.DATABASE_URL! });
const connectionStatus = await isProviderConnected(db, userId, 'hubspot');

if (!connectionStatus.connected) {
  // Handle not connected
  return;
}

// Make an API call
const response = await apiClient.get(
  'hubspot',                      // provider
  userId,                         // user ID
  connectionStatus.accountId,     // account ID for token refresh
  '/objects/contacts',            // API path
  'list_contacts',                // operation name
  {
    cache: {
      enabled: true,
      ttlMs: 60000              // Cache for 1 minute
    }
  }
);
```

## Provider Configuration

Providers are configured in `/lib/auth.ts` using Better Auth's genericOAuth plugin:

```typescript
genericOAuth({
  config: [
    {
      providerId: "hubspot",
      clientId: process.env.HUBSPOT_CLIENT_ID!,
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
      authorizationUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      scopes: ["crm.objects.contacts.read"],
      accessType: "offline",  // Request refresh token
      getUserInfo: async (tokens) => {
        // Custom user info logic
      }
    }
  ]
})
```

To add a new provider's API endpoints, update the `providerEndpoints` in `simplified-api-client.ts`:

```typescript
const providerEndpoints: Record<string, { baseUrl: string; version?: string }> = {
  newProvider: {
    baseUrl: 'https://api.newprovider.com',
    version: 'v1',
  },
};
```

## API Client Methods

All methods now include an `accountId` parameter for Better Auth's token refresh:

### GET Request
```typescript
const response = await apiClient.get(
  provider, 
  userId, 
  accountId,  // Required for token refresh
  path, 
  operation, 
  options
);
```

### POST Request
```typescript
const response = await apiClient.post(
  provider, 
  userId, 
  accountId,
  path, 
  operation, 
  body, 
  options
);
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
  const isConnected = await isProviderConnected(context.db, context.session.userId, 'hubspot');
  
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