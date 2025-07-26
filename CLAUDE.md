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

1. **Authentication**: Better Auth (`/lib/auth.ts`) with MCP plugin for OAuth flows
   - Uses SQLite database for development
   - Sign-in page at `/sign-in`
   - Session management with MCP-specific auth tokens

2. **MCP Endpoints**:
   - **Public**: `/api/mcp` - Exposes `roll_dice` tool without authentication
   - **Secured**: `/api/[transport]` - Requires OAuth bearer token, supports SSE and streamable-http transports
     - Tools: `echo`, `get_auth_status`
     - Uses `withMcpAuth` wrapper for token verification

3. **OAuth Discovery**: Well-known endpoints for OAuth metadata
   - `/.well-known/oauth-authorization-server`
   - `/.well-known/oauth-protected-resource`

### File Structure

- `/app` - Next.js App Router pages and API routes
- `/lib/auth.ts` - Better Auth configuration with MCP plugin
- Database: SQLite (`sqlite.db`) for local dev, configurable for production

### Environment Variables

Required in `.env.local`:
- `BETTER_AUTH_SECRET` - Secure secret key for auth
- `DATABASE_URL` - Database connection (SQLite for dev)
- `AUTH_ISSUER` - Base URL for auth (auto-detected on Vercel)
- `REDIS_URL` - Optional, for SSE session resumability

### TypeScript Configuration

- Strict mode enabled
- Path alias: `@/*` maps to root directory
- Target: ES2017

## Important Notes

- Always build before pushing to git
- The secured MCP endpoint verifies tokens using Better Auth's `getMcpSession` API
- MCP handlers use `mcp-handler` package for Vercel deployment compatibility