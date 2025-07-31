# MCP OAuth Fix for Preview Deployments

## The Issue

When using MCP Inspector with preview deployments, the OAuth metadata URLs are incorrectly constructed, causing authentication to fail with:
```
"www-authenticate":"Bearer resource_metadata=https://mcp-betterauth-nextjs.vercel.app/api/auth/api/auth/.well-known/oauth-authorization-server"
```

Note the duplicate `/api/auth` in the path.

## Update: Better Auth MCP Plugin Bug

This is a known bug in the Better Auth MCP plugin (see [issue #2703](https://github.com/better-auth/better-auth/issues/2703)).

### The Bug
In Better Auth v1.3.4, the MCP plugin constructs the WWW-Authenticate header incorrectly:
- It appends `/api/auth/.well-known/oauth-authorization-server` to the base URL
- If your base URL already includes `/api/auth`, you get a duplicate path
- The fix exists in the main branch but hasn't been released yet

### What Works vs What Doesn't
- ✅ `/.well-known/oauth-authorization-server` returns correct data
- ✅ Web OAuth flow works perfectly
- ❌ MCP plugin WWW-Authenticate header has wrong URL

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

## Workaround Options

### Option 1: Use Production MCP Endpoint (Recommended)
Instead of connecting to the preview URL's MCP endpoint, connect directly to production:
```
https://mcp-betterauth-nextjs.vercel.app/api/mcp
```

This works because:
- Production has the correct OAuth setup
- Your web session from preview testing doesn't affect MCP sessions
- Avoids the Better Auth plugin bug

### Option 2: Wait for Better Auth Fix
The issue needs to be fixed in the Better Auth MCP plugin to correctly construct the WWW-Authenticate header.

### Option 3: Custom MCP Handler
We could create a custom MCP handler that doesn't use the Better Auth plugin, but this would require significant work.

## Testing

1. **Web OAuth**: Visit `/test-oauth` - ✅ Works (as you've confirmed)
2. **MCP OAuth**: 
   - ❌ Preview URL's `/api/mcp` - Fails due to plugin bug
   - ✅ Production URL's `/api/mcp` - Should work correctly

## Why This Works

- `AUTH_HUB_URL`: Used by our custom OAuth flow for web sessions
- `AUTH_URL`: Used by Better Auth as the base URL, affects MCP metadata URLs
- Setting both ensures both flows work correctly on preview deployments