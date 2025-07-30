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
   - Microsoft OAuth: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
   - HubSpot OAuth: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`
   - PandaDoc OAuth: `PANDADOC_CLIENT_ID`, `PANDADOC_CLIENT_SECRET`
   
   **Note**: The base URL is automatically detected:
   - Local development: `http://localhost:3000`
   - Vercel deployments: Uses `VERCEL_URL` automatically
   - Override local URL with `LOCAL_URL` in `.env.local` if needed

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
   - `REDIS_URL` (optional, for SSE resumability)
   - Microsoft OAuth credentials
   - HubSpot OAuth credentials (optional, for HubSpot tools)
   - PandaDoc OAuth credentials (optional, for PandaDoc tools)
   
   **Note**: Vercel automatically sets `VERCEL_URL` for preview and production deployments. The application will use this to construct the correct OAuth redirect URLs.

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

## Handling Vercel Preview Deployments

### Automatic URL Detection

The application automatically detects the correct base URL for OAuth redirects:

1. **Local Development**: Defaults to `http://localhost:3000`
   - Override with `LOCAL_URL` in `.env.local` if using a different port

2. **Vercel Preview Deployments**: Automatically uses the preview URL
   - Vercel sets `VERCEL_URL` for each deployment
   - OAuth redirects will use `https://{preview-branch}-{project}.vercel.app`

3. **Production**: Uses your production domain
   - Vercel sets `VERCEL_URL` to your production domain
   - **Important**: If using a custom domain, set `AUTH_URL` in Vercel environment variables

### Custom Domain Configuration

When using a custom domain on Vercel (e.g., `mcp-betterauth-nextjs.vercel.app` instead of the auto-generated URL), you must:

1. Set `AUTH_URL` environment variable in Vercel to your custom domain:
   ```
   AUTH_URL=https://mcp-betterauth-nextjs.vercel.app
   ```

2. This ensures OAuth metadata URLs match the domain you're accessing from

Without this, the OAuth flow will fail because:
- You access via: `https://mcp-betterauth-nextjs.vercel.app`
- But metadata points to: `https://mcp-betterauth-nextjs-[hash].vercel.app`
- This origin mismatch causes authentication to fail

### OAuth Provider Setup for Preview Deployments

Since preview URLs are dynamic, you have several options:

1. **Wildcard Redirects** (if supported by provider):
   - Add `https://*.vercel.app/api/auth/callback/{provider}` as redirect URI

2. **Multiple Redirect URIs**:
   - Add your production URL
   - Add common preview patterns
   - Add localhost for development

3. **Dynamic Registration** (advanced):
   - Use OAuth dynamic client registration
   - Automatically register new redirect URIs

### Example OAuth Redirect URIs

For Microsoft/HubSpot/PandaDoc, add these redirect URIs:
```
http://localhost:3000/api/auth/callback/{provider}
https://your-app.vercel.app/api/auth/callback/{provider}
https://*-your-org.vercel.app/api/auth/callback/{provider}
```

Replace `{provider}` with `microsoft`, `hubspot`, or `pandadoc`.

## License

MIT