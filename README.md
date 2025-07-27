# MCP Server with Better Auth

A Model Context Protocol (MCP) server built with Next.js and Better Auth for OAuth authentication, deployed on Vercel.

## Features

- 🔐 OAuth authentication with Better Auth
- 🚀 MCP server endpoints with both public and secured access
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
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env.local
```

4. Update `.env.local` with your configuration:
   - Generate a secure `BETTER_AUTH_SECRET`
   - Configure `DATABASE_URL` (SQLite for dev, Postgres/MySQL for production)
   - Set `AUTH_ISSUER` URL

5. Run the development server:
```bash
npm run dev
```

### Testing with PandaDoc OAuth

PandaDoc doesn't allow localhost URLs for OAuth. Use ngrok for local testing:

```bash
# Option 1: Use the automated setup script
npm run tunnel
# Then in another terminal:
npm run dev

# Option 2: Manual ngrok setup
./start-ngrok.sh
# Update .env.local with the ngrok URL
# Then run: npm run dev
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

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm start` - Start production server

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Authentication**: Better Auth with MCP plugin
- **MCP Server**: mcp-handler (Vercel MCP Adapter)
- **Database**: SQLite (dev) / Postgres (prod)
- **Hosting**: Vercel Functions
- **Styling**: Tailwind CSS

## License

MIT