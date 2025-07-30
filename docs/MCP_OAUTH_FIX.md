# MCP OAuth Fix for Preview Deployments

## The Issue

When using MCP Inspector with preview deployments, the OAuth metadata URLs are incorrectly constructed, causing authentication to fail with:
```
"www-authenticate":"Bearer resource_metadata=https://mcp-betterauth-nextjs.vercel.app/api/auth/api/auth/.well-known/oauth-authorization-server"
```

Note the duplicate `/api/auth` in the path.

## The Solution

For preview deployments, you need to set the `AUTH_URL` environment variable to your production hub URL. This ensures that:
1. Web OAuth continues to work with the hub pattern
2. MCP OAuth metadata URLs are correctly formed

## Required Environment Variables

Add these to your Vercel project settings:

```env
# For ALL deployments (including preview):
AUTH_HUB_URL=https://mcp-betterauth-nextjs.vercel.app
NEXT_PUBLIC_AUTH_HUB_URL=https://mcp-betterauth-nextjs.vercel.app
STATE_SECRET=<your-secret>

# For preview deployments ONLY:
AUTH_URL=https://mcp-betterauth-nextjs.vercel.app
```

## How It Works

1. **Web OAuth Flow** (tested with `/test-oauth`):
   - Uses custom OAuth initiation endpoint
   - Redirects through hub using `AUTH_HUB_URL`
   - Works correctly as shown in your test

2. **MCP OAuth Flow** (with MCP Inspector):
   - Uses Better Auth's MCP plugin
   - Requires correct `baseURL` for OAuth metadata
   - `AUTH_URL` ensures metadata URLs point to production

## Vercel Configuration

In your Vercel project settings, configure environment variables like this:

### Production Branch
- `AUTH_HUB_URL`: (not needed, it's the hub itself)
- `NEXT_PUBLIC_AUTH_HUB_URL`: (not needed)
- `STATE_SECRET`: `<your-secret>`
- `AUTH_URL`: (not needed, uses default)

### Preview Branches
- `AUTH_HUB_URL`: `https://mcp-betterauth-nextjs.vercel.app`
- `NEXT_PUBLIC_AUTH_HUB_URL`: `https://mcp-betterauth-nextjs.vercel.app`
- `STATE_SECRET`: `<same-secret>`
- `AUTH_URL`: `https://mcp-betterauth-nextjs.vercel.app`

## Testing

1. **Web OAuth**: Visit `/test-oauth` - should show authenticated
2. **MCP OAuth**: Use MCP Inspector with the preview URL's `/api/mcp` endpoint
   - Should redirect to Microsoft OAuth
   - After auth, should connect successfully

## Why This Works

- `AUTH_HUB_URL`: Used by our custom OAuth flow for web sessions
- `AUTH_URL`: Used by Better Auth as the base URL, affects MCP metadata URLs
- Setting both ensures both flows work correctly on preview deployments