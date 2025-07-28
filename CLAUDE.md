# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm run dev

# Build for production (always run before pushing to git)
pnpm run build

# Start production server
pnpm start

# Run linting
pnpm run lint

# Run TypeScript type checking
pnpm run typecheck
```

## Package Manager

- We are using pnpm as the package manager for this project

## Architecture Overview

This is a Next.js 15 application that implements an MCP (Model Context Protocol) server with OAuth authentication using Better Auth.

### Key Components

1. **Authentication**: Better Auth (`/lib/auth.ts`) with multi-provider OAuth
   - **Primary**: Microsoft OAuth for main authentication
   - **Secondary**: HubSpot and PandaDoc for tool-specific connections
   - Uses SQLite database for development
   - Sign-in page at `/sign-in` (Microsoft only)
   - Connections page at `/connections` for managing tool integrations

2. **MCP Endpoints**:
   - **Secured**: `/api/mcp` - Requires OAuth bearer token
     - Tools: 
       - `echo` - Echoes back a string message
       - `get_auth_status` - Returns authentication status with full Microsoft profile information
       - `search_hubspot_contacts` - Search HubSpot contacts (requires HubSpot connection)
       - `list_pandadoc_documents` - List PandaDoc documents (requires PandaDoc connection)
     - Uses `withMcpAuth` wrapper for token verification
     - Tools check for specific OAuth connections before executing
     - All tools have automatic Sentry error tracking with user context

3. **OAuth Discovery**: Well-known endpoints for OAuth metadata
   - `/.well-known/oauth-authorization-server`
   - `/.well-known/oauth-protected-resource`

4. **Connection Management**:
   - `/api/connections/status` - Get connection status for all providers
   - `/api/connections/[provider]` - Disconnect specific provider

### File Structure

- `/app` - Next.js App Router pages and API routes
  - `/sign-in` - Microsoft-only authentication page
  - `/connections` - Tool integration management page
  - `/api/mcp` - MCP server endpoint with tools
  - `/api/connections` - Connection management APIs
- `/lib` - Library code
  - `/auth.ts` - Better Auth configuration with all OAuth providers
  - `/auth-client.ts` - Better Auth client for React components
  - `/sentry-error-handler.ts` - Centralized Sentry error handling
  - `/external-api-helpers` - Reusable API client with rate limiting, caching, and circuit breakers
  - `/tools` - MCP tool implementations
    - `/register-tool.ts` - Tool registration helper with Sentry integration
    - `/create-provider-tool.ts` - Higher-order function for creating provider-specific tools
    - `/provider-api-helper.ts` - Simplified API helper for provider tools
    - `/hubspot` - HubSpot integration tools
    - `/pandadoc` - PandaDoc integration tools
- Database: SQLite (`sqlite.db`) for local dev, configurable for production

### Environment Variables

Required in `.env.local`:
- `BETTER_AUTH_SECRET` - Secure secret key for auth
- `DATABASE_URL` - Database connection (SQLite for dev)
- `AUTH_ISSUER` - Base URL for auth (auto-detected on Vercel)
- `MICROSOFT_CLIENT_ID` - Microsoft OAuth app client ID
- `MICROSOFT_CLIENT_SECRET` - Microsoft OAuth app client secret
- `MICROSOFT_TENANT_ID` - Microsoft tenant ID (default: "common")
- `HUBSPOT_CLIENT_ID` - HubSpot OAuth app client ID (optional)
- `HUBSPOT_CLIENT_SECRET` - HubSpot OAuth app client secret (optional)
- `PANDADOC_CLIENT_ID` - PandaDoc OAuth app client ID (optional)
- `PANDADOC_CLIENT_SECRET` - PandaDoc OAuth app client secret (optional)
- `REDIS_URL` - Optional, for SSE session resumability
- `SENTRY_AUTH_TOKEN` - For Sentry error tracking (optional)
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error tracking (optional)
- `NO_AUTH` - Set to `true` to enable no-auth mode for testing (development only)

### TypeScript Configuration

- Strict mode enabled
- Path alias: `@/*` maps to root directory
- Target: ES2017

### Tool Architecture

The project uses an elegant abstraction for provider-specific tools:

1. **`createProviderTool`** - Higher-order function that:
   - Automatically checks provider authentication
   - Handles token expiration gracefully
   - Provides consistent error responses
   - Wraps tools with provider context

2. **`ProviderApiHelper`** - Simplifies API calls by:
   - Automatically including userId, accountId, and provider
   - Providing typed methods for all HTTP verbs
   - Integrating with caching, rate limiting, and circuit breakers

3. **Benefits**:
   - Tools focus only on business logic (~30 lines vs ~110 lines)
   - Authentication errors handled uniformly
   - Easy to add new tools and providers
   - Full TypeScript support throughout

Example of creating a new tool:
```typescript
createProviderTool(server, {
  name: "tool_name",
  description: "Tool description",
  provider: "hubspot", // or "pandadoc"
  schema: {
    param: z.string().describe("Parameter description")
  },
  handler: async ({ param }, context) => {
    const api = new ProviderApiHelper(context);
    const response = await api.get('/endpoint', 'operation_name');
    return {
      content: [{
        type: "text",
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }
});
```

## No-Auth Mode (Development Only)

For testing the MCP server without bearer token authentication, you can enable no-auth mode:

1. Set `NO_AUTH=true` in your `.env.local` file
2. Ensure the test user `lvickery@asi.co.nz` exists in your database
3. The test user should have active OAuth connections for HubSpot/PandaDoc if you want to test those tools

**Important:**
- No-auth mode only works in development environment (`NODE_ENV=development`)
- It bypasses bearer token verification but still maintains tool authentication
- The server automatically authenticates as the test user
- Response headers include `X-No-Auth-Mode: true` and `X-Test-User: lvickery@asi.co.nz`
- Console warnings will appear when running in this mode

## Important Notes

- Always build before pushing to git
- The secured MCP endpoint verifies tokens using Better Auth's `withMcpAuth` middleware
- MCP handlers use `mcp-handler` package for Vercel deployment compatibility
- Microsoft is the only provider that creates user accounts - all other providers are linked
- Tools requiring HubSpot/PandaDoc will prompt users to connect via `/connections` page
- Web sessions and MCP OAuth sessions are separate by design
- Sentry error tracking is integrated into all MCP tools automatically
- Tool schemas must be plain objects with Zod validators, not Zod objects (e.g., `{ message: z.string() }` not `z.object({ message: z.string() })`)

## Testing External API Access

When developing or debugging integrations, you can extract OAuth tokens from the BetterAuth database to test API calls directly:

```bash
# 1. Find user ID by email
sqlite3 sqlite.db "SELECT id, email FROM user WHERE email = 'user@example.com';"

# 2. Extract access token for a specific provider (e.g., hubspot, pandadoc)
sqlite3 sqlite.db "SELECT accessToken, accessTokenExpiresAt FROM account WHERE userId = 'USER_ID' AND providerId = 'PROVIDER_ID';"

# 3. Test API call with the token
curl -X GET "https://api.hubapi.com/account-info/v3/details" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" | jq .

# Example: Search HubSpot contacts
curl -X POST "https://api.hubapi.com/crm/v3/objects/contacts/search" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filterGroups": [{
      "filters": [{
        "propertyName": "email",
        "operator": "EQ",
        "value": "user@example.com"
      }]
    }],
    "properties": ["email", "firstname", "lastname", "company"],
    "limit": 10
  }' | jq .
```

Note: If the token has expired, you'll need to refresh it through the `/connections` page or use the refresh token if available.