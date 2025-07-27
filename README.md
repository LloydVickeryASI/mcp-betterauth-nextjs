# MCP Server with Better Auth

A Model Context Protocol (MCP) server built with Next.js and Better Auth for OAuth authentication, deployed on Vercel.

## Features

- 🔐 Microsoft OAuth as primary authentication
- 🔗 Tool-specific OAuth connections (HubSpot, PandaDoc)
- 🚀 MCP server endpoints with OAuth protection
- 📡 Streamable HTTP/SSE support via `mcp-handler`
- ⚡ Deployed on Vercel with serverless functions
- 🗄️ SQLite database for development (configurable for production)

## Endpoints

### MCP Endpoint (OAuth Protected)
- **URL**: `/api/mcp`
- **Tools**: 
  - `echo` - Echo back a string
  - `get_auth_status` - Get authentication status with Microsoft profile information (name, email, image, etc.)
  - `search_hubspot_contacts` - Search HubSpot contacts by email (requires HubSpot authentication)
  - `list_pandadoc_documents` - List PandaDoc documents with optional status filter and pagination (requires PandaDoc authentication)
- **Requires**: OAuth bearer token from Better Auth

### Web Interface
- `/sign-in` - Sign in with Microsoft account
- `/connections` - Manage tool integrations (requires Microsoft authentication)

### OAuth Discovery
- `/.well-known/oauth-authorization-server` - OAuth metadata
- `/.well-known/oauth-protected-resource` - Protected resource metadata

## Setup

1. Clone the repository:
```bash
git clone https://github.com/LloydVickeryASI/mcp-betterauth-nextjs.git
cd mcp-betterauth-nextjs
```

2. Install dependencies:
```bash
pnpm install
```

3. Copy environment variables:
```bash
cp .env.example .env.local
```

4. Update `.env.local` with your configuration:
   - Generate a secure `BETTER_AUTH_SECRET`
   - Configure `DATABASE_URL` (SQLite for dev, Postgres/MySQL for production)
   - Set `AUTH_ISSUER` URL
   - Microsoft OAuth: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
   - HubSpot OAuth: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`
   - PandaDoc OAuth: `PANDADOC_CLIENT_ID`, `PANDADOC_CLIENT_SECRET`

5. Run the development server:
```bash
pnpm run dev
```

### Testing with PandaDoc OAuth

PandaDoc doesn't allow localhost URLs for OAuth. Use ngrok for local testing:

```bash
# Option 1: Use the automated setup script
pnpm run tunnel
# Then in another terminal:
pnpm run dev

# Option 2: Manual ngrok setup
./start-ngrok.sh
# Update .env.local with the ngrok URL
# Then run: pnpm run dev
```

See [docs/PANDADOC_SETUP.md](docs/PANDADOC_SETUP.md) for detailed instructions.

## Deployment

### Deploy to Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Set environment variables in Vercel dashboard:
   - `BETTER_AUTH_SECRET`
   - `DATABASE_URL` (use Vercel Postgres or similar)
   - `AUTH_ISSUER` (optional, auto-detected)
   - `REDIS_URL` (optional, for SSE resumability)
   - Microsoft OAuth credentials
   - HubSpot OAuth credentials (optional, for HubSpot tools)
   - PandaDoc OAuth credentials (optional, for PandaDoc tools)

## Authentication Architecture

### Primary Authentication (Microsoft)
- Users must first authenticate with Microsoft to access the MCP server
- Microsoft is the only provider that creates user accounts
- All other OAuth providers are linked to the Microsoft account

### Tool-Specific Connections
- HubSpot and PandaDoc are secondary OAuth connections
- These connections are managed via the `/connections` page
- Users must be authenticated with Microsoft before connecting other services
- Each tool checks for its specific OAuth connection when invoked

### Authentication Flow
1. **MCP Client**: Authenticate with Microsoft via OAuth flow
2. **Web Interface**: Sign in with Microsoft at `/sign-in`
3. **Tool Connections**: Visit `/connections` to link HubSpot/PandaDoc accounts
4. **Tool Usage**: Tools automatically check for required connections

## Connecting MCP Clients

### Cursor
Add to `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "mcp-betterauth": {
      "url": "https://your-app.vercel.app/api/mcp"
    }
  }
}
```

### Claude Desktop / ChatGPT
Point to the same URL and provide OAuth token from Better Auth's sign-in flow.

## Development

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run lint` - Run ESLint
- `pnpm run typecheck` - Run TypeScript type checking
- `pnpm start` - Start production server

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Authentication**: Better Auth with MCP plugin
- **MCP Server**: mcp-handler (Vercel MCP Adapter)
- **Database**: SQLite (dev) / Postgres (prod)
- **Hosting**: Vercel Functions
- **Styling**: Tailwind CSS

## License

MIT