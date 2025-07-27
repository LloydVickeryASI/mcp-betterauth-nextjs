# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production (always run before pushing to git)
npm run build

# Start production server
npm start

# Run linting
npm run lint
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
- `/lib/auth.ts` - Better Auth configuration with all OAuth providers
- `/lib/auth-client.ts` - Better Auth client for React components
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

### TypeScript Configuration

- Strict mode enabled
- Path alias: `@/*` maps to root directory
- Target: ES2017

## Important Notes

- Always build before pushing to git
- The secured MCP endpoint verifies tokens using Better Auth's `withMcpAuth` middleware
- MCP handlers use `mcp-handler` package for Vercel deployment compatibility
- Microsoft is the only provider that creates user accounts - all other providers are linked
- Tools requiring HubSpot/PandaDoc will prompt users to connect via `/connections` page
- Web sessions and MCP OAuth sessions are separate by design