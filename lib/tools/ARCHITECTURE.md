# Elegant Tool Architecture

## Overview

This architecture eliminates boilerplate code for provider-specific tools by abstracting authentication, error handling, and API calls into reusable components.

## Key Components

### 1. `createProviderTool` Function
- Wraps tool handlers with automatic authentication checking
- Provides consistent error responses for auth failures
- Handles token expiration gracefully
- Eliminates need for each tool to check connection status

### 2. `ProviderApiHelper` Class
- Simplifies API calls by automatically including context (userId, accountId, provider)
- Provides typed methods for all HTTP verbs
- Integrates with existing caching, rate limiting, and circuit breaker functionality

### 3. `ProviderToolContext` Interface
- Extends base `ToolContext` with provider-specific information
- Includes `accountId` and `provider` for easy access

## Benefits

1. **Reduced Boilerplate**: Tools focus only on their core business logic
2. **Consistent Error Handling**: Authentication errors handled uniformly
3. **Type Safety**: Full TypeScript support with proper typing
4. **Easy to Add Tools**: New tools can be added with minimal code
5. **Maintainability**: Changes to auth flow only need updates in one place

## Usage Example

```typescript
// Before: ~110 lines with boilerplate
export const searchContactsHandler = async ({ query }, context) => {
  // Check connection (15 lines)
  // Handle auth errors (20 lines)
  // Make API call with full context
  // Handle token expiration (15 lines)
  // Return results
};

// After: ~30 lines of pure business logic
createProviderTool(server, {
  name: "search_hubspot_objects",
  provider: "hubspot",
  schema: { query: z.string() },
  handler: async ({ query }, context) => {
    const api = new ProviderApiHelper(context);
    const response = await api.post('/objects/contacts/search', 'search_contacts', {
      filterGroups: [/* search logic */]
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
  }
});
```

## Migration Path

1. Keep existing tools working
2. Gradually migrate tools to new architecture
3. Once all migrated, remove old boilerplate code

## Adding New Providers

To add a new provider (e.g., Salesforce):

1. Add provider config to `external-api-helpers`
2. Create provider-specific tools using `createProviderTool`
3. Register tools in MCP endpoint

No changes needed to the core abstractions!