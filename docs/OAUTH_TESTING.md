# OAuth Hub Testing Guide

This guide helps you test the OAuth hub pattern implementation to ensure it's working correctly on Vercel preview deployments.

## Quick Test

1. **Visit the test page**: Go to `/test-oauth` on your deployment
2. **Check environment**: Verify the environment information shows correctly
3. **Test authentication**: Click "Test Microsoft OAuth Flow"
4. **Verify flow**: Watch the redirects and ensure you return authenticated

## Environment Check

Visit `/api/test/env-check` to see your environment configuration status.

## Test Scenarios

### 1. Local Development (No Hub)

**Setup**:
- Don't set `AUTH_HUB_URL` in `.env.local`
- Ensure redirect URI in Azure: `http://localhost:3000/api/auth/callback/microsoft`

**Expected behavior**:
1. Click sign in → Microsoft OAuth
2. Callback directly to `localhost:3000`
3. Session established immediately

### 2. Preview Deployment (With Hub)

**Setup**:
```env
# In Vercel environment variables
AUTH_HUB_URL=https://mcp-betterauth-nextjs.vercel.app
NEXT_PUBLIC_AUTH_HUB_URL=https://mcp-betterauth-nextjs.vercel.app
STATE_SECRET=<your-secret>
```

**Expected behavior**:
1. From preview URL (e.g., `mcp-preview-123.vercel.app`)
2. Click sign in → Redirect to `/api/auth/microsoft/initiate`
3. Redirect to Microsoft with state parameter
4. After login → Callback to production hub
5. Hub redirects to preview's `/api/auth/session/handoff`
6. Session established on preview domain

### 3. Production Hub

**Expected behavior**:
- Same as local, but handles callbacks for all preview deployments
- Should process state parameters and redirect appropriately

## Debugging Tips

### Check OAuth Flow

1. **Open browser DevTools Network tab**
2. **Preserve log** to track redirects
3. **Look for**:
   - Initial request to `/api/auth/microsoft/initiate`
   - Redirect to Microsoft with `state` parameter
   - Callback to hub URL
   - Redirect back to preview with token
   - Final session establishment

### Common Issues

**"Invalid redirect URI" from Microsoft**
- Ensure Azure AD has: `https://your-hub-domain.vercel.app/api/auth/callback/microsoft`
- Check `AUTH_HUB_URL` matches exactly

**Session not persisting**
- Check cookies are being set
- Verify `BETTER_AUTH_SECRET` is same across deployments
- Check for HTTPS/secure cookie issues

**State parameter errors**
- Ensure `STATE_SECRET` is set and consistent
- Check for URL encoding issues
- Verify JWT expiration (10 minutes)

## Test Checklist

- [ ] Environment check endpoint shows correct configuration
- [ ] Test page displays current environment correctly
- [ ] Local development works without hub
- [ ] Preview deployment redirects through hub
- [ ] State parameter is validated correctly
- [ ] Session persists after redirect
- [ ] Sign out works properly
- [ ] Multiple sign in/out cycles work
- [ ] Works across different preview deployments

## Manual URL Test

You can also test the flow manually:

1. **Generate state** (in browser console):
```javascript
// This would normally be done server-side
const state = btoa(JSON.stringify({
  origin: window.location.origin,
  next: '/test-oauth'
}));
```

2. **Construct OAuth URL**:
```
https://login.microsoftonline.com/common/oauth2/v2.0/authorize?
client_id=YOUR_CLIENT_ID&
response_type=code&
redirect_uri=https://your-hub.vercel.app/api/auth/callback/microsoft&
scope=openid email profile offline_access&
state=YOUR_STATE&
prompt=select_account
```

3. **Follow the flow** and verify redirects

## Security Verification

1. **Try tampering with state** - Should fail
2. **Try old state (>10 min)** - Should fail  
3. **Try redirect to unauthorized domain** - Should fail
4. **Verify no tokens in URLs** after handoff

## Monitoring

Watch for these in logs:
- "OAuth state verification failed" - Invalid states
- "Session handoff failed" - Token issues
- "Invalid redirect origin" - Security blocks

The test page at `/test-oauth` provides real-time feedback on all these aspects.