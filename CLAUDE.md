# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm start

# Run linting
pnpm run lint

# Run TypeScript type checking
pnpm run typecheck
```

## Vercel CLI Commands

Claude Code can use the Vercel CLI to check deployment logs:

```bash
# View runtime logs (live streaming)
vercel logs <deployment-url>

# View build logs (historical)
vercel inspect --logs <deployment-url>

# List recent deployments
vercel ls
```

## Claude Code Hooks

This project has automated quality checks configured in `.claude/settings.json`:
- **Type checking** runs automatically after editing TypeScript/JavaScript files
- **Linting, type checking, and build** run automatically before commits
- Commit is blocked if any of these checks fail

## Package Manager

- We are using pnpm as the package manager for this project

## Architecture Overview

This is a Next.js 15 application that implements an MCP (Model Context Protocol) server with OAuth authentication using Better Auth.

### Key Components

1. **Authentication**: Better Auth (`/lib/auth.ts`) with multi-provider OAuth
   - **Primary**: Microsoft OAuth for main authentication
   - **Secondary**: HubSpot, PandaDoc, and Xero for tool-specific connections
   - Uses PostgreSQL database with Neon serverless driver
   - Sign-in page at `/sign-in` (Microsoft only)
   - Connections page at `/connections` for managing tool integrations

2. **MCP Endpoints**:
   - **Secured**: `/api/mcp` - Requires OAuth bearer token
     - Tools: 
       - `echo` - Echoes back a string message
       - `get_auth_status` - Returns authentication status with full Microsoft profile information
       - **OAuth-based tools:**
         - `search_hubspot_contacts` - Search HubSpot contacts (requires HubSpot connection)
         - `list_pandadoc_documents` - List PandaDoc documents (requires PandaDoc connection)
         - `search_xero_contacts` - Search Xero accounting contacts (requires Xero connection)
     - Uses `withMcpAuth` wrapper for token verification
     - Tools check for specific OAuth connections or system API keys before executing
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
  - `/db-queries.ts` - PostgreSQL query helpers for database operations
  - `/sentry-error-handler.ts` - Centralized Sentry error handling
  - `/external-api-helpers` - Reusable API client with rate limiting, caching, and circuit breakers
  - `/providers` - Provider configuration and validation
    - `/config.ts` - Provider configuration with auth methods and API settings
    - `/validate.ts` - System API key validation helpers
  - `/tools` - MCP tool implementations
    - `/register-tool.ts` - Tool registration helper with Sentry integration
    - `/create-provider-tool.ts` - Higher-order function for creating provider-specific tools
    - `/provider-api-helper.ts` - Simplified API helper for provider tools
    - `/hubspot` - HubSpot integration tools (OAuth)
    - `/pandadoc` - PandaDoc integration tools (OAuth)
    - `/xero` - Xero integration tools (OAuth)
- Database: PostgreSQL (Neon serverless driver for Vercel deployment)

### Database Setup

This project uses PostgreSQL with the Neon serverless driver for optimal performance on Vercel:

1. **Create a Neon database** at [neon.tech](https://neon.tech) or use Vercel Postgres
2. **Copy the connection string** to your `.env.local` as `DATABASE_URL`
3. **Better Auth will automatically create tables** on first run

#### Testing Database with psql

You can use `psql` to directly query the database for debugging:

```bash
# Using the connection string from .env.local
psql $DATABASE_URL

# Or using individual parameters from .env.local
PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDATABASE

# Example queries:
# List all tables
\dt

# Check OAuth applications
SELECT "clientId", "name", "createdAt" FROM "oauthApplication" ORDER BY "createdAt" DESC;

# Check user accounts
SELECT id, email, name FROM "user";

# Check OAuth connections
SELECT "userId", "providerId", "createdAt" FROM account;
```

### Environment Variables

Required in `.env.local`:
- `BETTER_AUTH_SECRET` - Secure secret key for auth
- `DATABASE_URL` - PostgreSQL connection string (Neon or Vercel Postgres)
- `AUTH_URL` - **IMPORTANT for Vercel**: Set this to your full deployment URL (e.g., `https://mcp-betterauth-nextjs.vercel.app`) to fix OAuth metadata discovery. Without this, MCP Inspector will fail with "failed to discover OAuth metadata"
- `MICROSOFT_CLIENT_ID` - Microsoft OAuth app client ID
- `MICROSOFT_CLIENT_SECRET` - Microsoft OAuth app client secret
- `MICROSOFT_TENANT_ID` - Microsoft tenant ID (default: "common")
- `HUBSPOT_CLIENT_ID` - HubSpot OAuth app client ID (optional)
- `HUBSPOT_CLIENT_SECRET` - HubSpot OAuth app client secret (optional)
- `PANDADOC_CLIENT_ID` - PandaDoc OAuth app client ID (optional)
- `PANDADOC_CLIENT_SECRET` - PandaDoc OAuth app client secret (optional)
- `XERO_CLIENT_ID` - Xero OAuth app client ID (optional)
- `XERO_CLIENT_SECRET` - Xero OAuth app client secret (optional)
- `REDIS_URL` - Optional, for SSE session resumability
- `SENTRY_AUTH_TOKEN` - For Sentry error tracking (optional)
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error tracking (optional)
- `NO_AUTH` - Set to `true` to enable no-auth mode for testing (development only)

System API Keys (optional):
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude models
- `SENDGRID_API_KEY` - SendGrid API key for email services
- `SLACK_API_KEY` - Slack API key for Slack integration
- `HUBSPOT_API_KEY` - HubSpot API key (alternative to OAuth)
- `PANDADOC_API_KEY` - PandaDoc API key (alternative to OAuth)
- `XERO_API_KEY` - Xero API key (alternative to OAuth)

### TypeScript Configuration

- Strict mode enabled
- Path alias: `@/*` maps to root directory
- Target: ES2017

### Tool Architecture

The project uses an elegant abstraction for provider-specific tools that supports both OAuth and system API keys:

1. **`createProviderTool`** - Higher-order function that:
   - Automatically checks provider authentication (OAuth or system API key)
   - Supports multiple auth methods: `oauth`, `system`, or `auto`
   - Handles token expiration gracefully
   - Provides consistent error responses
   - Wraps tools with provider context

2. **`ProviderApiHelper`** - Simplifies API calls by:
   - Automatically including userId, accountId, and provider
   - Providing typed methods for all HTTP verbs
   - Integrating with caching, rate limiting, and circuit breakers
   - Handling both OAuth tokens and system API keys

3. **Provider Configuration** (`/lib/providers/config.ts`):
   - Centralized provider settings
   - Defines auth methods, base URLs, and header formats
   - Supports OAuth, system API keys, or both

4. **Benefits**:
   - Tools focus only on business logic (~30 lines vs ~110 lines)
   - Authentication errors handled uniformly
   - Easy to add new tools and providers
   - Seamless support for both OAuth and API keys
   - Full TypeScript support throughout

Example of creating a new OAuth tool:
```typescript
createProviderTool(server, {
  name: "tool_name",
  description: "Tool description",
  provider: "hubspot",
  authMethod: "oauth", // Default for existing providers
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

Example of creating a system API key tool:
```typescript
createProviderTool(server, {
  name: "openai_generate",
  description: "Generate text with OpenAI",
  provider: "openai",
  authMethod: "system", // Uses system API key
  requiresUserAuth: false, // No user connection needed
  schema: {
    prompt: z.string().describe("The prompt")
  },
  handler: async ({ prompt }, context) => {
    const api = new ProviderApiHelper(context);
    const response = await api.post('/chat/completions', 'generate', {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    });
    return {
      content: [{
        type: "text",
        text: response.data.choices[0].message.content
      }]
    };
  }
});
```

## No-Auth Mode (Development Only)

For testing the MCP server without bearer token authentication, you can enable no-auth mode:

1. Set `NO_AUTH=true` in your `.env.local` file
2. Ensure the test user `lvickery@asi.co.nz` exists in your database
3. The test user should have active OAuth connections for HubSpot/PandaDoc/Xero if you want to test those tools

**Important:**
- No-auth mode only works in development environment (`NODE_ENV=development`)
- It bypasses bearer token verification but still maintains tool authentication
- The server automatically authenticates as the test user
- Response headers include `X-No-Auth-Mode: true` and `X-Test-User: lvickery@asi.co.nz`
- Console warnings will appear when running in this mode

## Important Notes

- The secured MCP endpoint verifies tokens using Better Auth's `withMcpAuth` middleware
- MCP handlers use `mcp-handler` package for Vercel deployment compatibility
- Microsoft is the only provider that creates user accounts - all other providers are linked
- Tools requiring HubSpot/PandaDoc/Xero will prompt users to connect via `/connections` page
- Web sessions and MCP OAuth sessions are separate by design
- Sentry error tracking is integrated into all MCP tools automatically
- Tool schemas must be plain objects with Zod validators, not Zod objects (e.g., `{ message: z.string() }` not `z.object({ message: z.string() })`)

## Vercel Deployment Troubleshooting

### "State Mismatch. Verification not found" Error

If you encounter this error on Vercel but not locally, follow these steps:

1. **Set the `AUTH_URL` environment variable on Vercel**
   - Go to your Vercel project settings → Environment Variables
   - Add `AUTH_URL` with your production URL (e.g., `https://mcp-betterauth-nextjs.vercel.app`)
   - This is CRITICAL for OAuth state matching to work properly

2. **Ensure auth routes use Node.js runtime**
   - The auth route already includes `export const runtime = "nodejs"`
   - This prevents Edge runtime issues with database connections

3. **Verify Microsoft redirect URIs in Azure**
   - Go to Azure Portal → App registrations → Your app → Authentication
   - Add your production redirect URI: `https://your-domain.vercel.app/api/auth/callback/microsoft`
   - Remove any localhost URIs for production apps

4. **Check your database**
   ```sql
   -- Run this while attempting sign-in to verify verification table is working
   SELECT * FROM verification ORDER BY "createdAt" DESC LIMIT 5;
   ```
   - You should see a new row created when starting OAuth flow
   - The row should be deleted after successful callback

5. **Required Vercel environment variables:**
   - `BETTER_AUTH_SECRET` - Your auth secret
   - `DATABASE_URL` - PostgreSQL connection string
   - `AUTH_URL` - Your production URL (most common missing variable)
   - `MICROSOFT_CLIENT_ID` - From Azure app registration
   - `MICROSOFT_CLIENT_SECRET` - From Azure app registration
   - `MICROSOFT_TENANT_ID` - Usually "common"

### Common Vercel Issues

- **OAuth metadata discovery fails**: Set `AUTH_URL` environment variable
- **State mismatch errors**: Ensure `AUTH_URL` matches your actual deployment URL
- **Database connection issues**: Auth routes must use Node.js runtime (already configured)
- **Preview deployments**: Each preview gets a unique URL; consider using OAuth proxy plugin

## Testing Patterns

### Live Testing with MCP Inspector

Before writing formal tests, use MCP Inspector to verify functionality:

1. **Enable no-auth mode for easier testing:**
   ```bash
   # Add to .env.local
   NO_AUTH=true
   
   # Start the dev server
   pnpm run dev
   ```

2. **Test with MCP Inspector CLI:**
   ```bash
   # List available tools
   npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --transport http --method tools/list
   
   # Call a simple tool
   npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --transport http --method tools/call --tool-name echo --tool-arg message="Hello world"
   
   # Get authentication status
   npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --transport http --method tools/call --tool-name get_auth_status
   
   # Test OAuth-required tools (will show connection status)
   npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --transport http --method tools/call --tool-name search_hubspot_contacts --tool-arg query="test@example.com"
   ```

3. **Verify expected behaviors:**
   - Tools list without authentication in no-auth mode
   - Simple tools execute successfully
   - OAuth-required tools properly check for valid connections
   - Error messages guide users to connect accounts when needed

### Testing External API Access

When developing or debugging integrations, you can extract OAuth tokens from the BetterAuth database to test API calls directly:

```bash
# Using psql with your DATABASE_URL connection string
# 1. Find user ID by email
psql $DATABASE_URL -c "SELECT id, email FROM \"user\" WHERE email = 'user@example.com';"

# 2. Extract access token for a specific provider (e.g., hubspot, pandadoc)
psql $DATABASE_URL -c "SELECT \"accessToken\", \"accessTokenExpiresAt\" FROM account WHERE \"userId\" = 'USER_ID' AND \"providerId\" = 'PROVIDER_ID';"

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

## Vercel Deployment Checklist

Before deploying to Vercel:

1. **Copy `.env.example` to `.env.local`** and fill in all required values
2. **Set all environment variables in Vercel project settings**
3. **Most important**: Set `AUTH_URL` to your production URL
4. **Update redirect URIs** in all OAuth providers (Microsoft, HubSpot, etc.)
5. **Run database migrations** if not using automatic migrations
6. **Test OAuth flow** after deployment using MCP Inspector