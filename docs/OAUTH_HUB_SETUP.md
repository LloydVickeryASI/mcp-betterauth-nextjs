# OAuth Hub Setup for Vercel Preview URLs

This guide explains how to set up the OAuth hub pattern to enable Microsoft OAuth authentication on Vercel preview deployments without registering each preview URL.

## The Problem

- Each Vercel preview deployment gets a unique URL (e.g., `my-app-pr-123.vercel.app`)
- Microsoft OAuth requires exact redirect URI matches (no wildcards)
- Registering hundreds of preview URLs is impractical

## The Solution: OAuth Hub Pattern

We use a "hub-and-spoke" pattern where:
1. All OAuth callbacks go to your production domain (the "hub")
2. The hub verifies the OAuth flow and redirects back to the preview (the "spoke")
3. A cryptographically signed state parameter prevents open redirect attacks

## Setup Instructions

### 1. Configure Microsoft Azure AD

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Select your app (or create a new one)
3. Under "Authentication", add ONE redirect URI:
   ```
   https://your-production-domain.vercel.app/api/auth/callback/microsoft
   ```
   Replace `your-production-domain.vercel.app` with your actual production domain.

### 2. Set Environment Variables

Add these to your Vercel project settings and `.env.local`:

```bash
# Your production domain that handles all OAuth callbacks
AUTH_HUB_URL=https://your-production-domain.vercel.app
NEXT_PUBLIC_AUTH_HUB_URL=https://your-production-domain.vercel.app

# Generate a secure 256-bit secret
# Run: openssl rand -base64 32
STATE_SECRET=your-generated-secret-here

# Microsoft OAuth credentials
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=common  # or your specific tenant ID

# Optional: Additional allowed domains (comma-separated)
ALLOWED_REDIRECT_DOMAINS=staging.example.com,dev.example.com
```

### 3. Deploy to Production

1. Deploy your main branch to production
2. Ensure the production deployment is accessible at your `AUTH_HUB_URL`
3. This deployment will act as the OAuth hub for all preview deployments

### 4. How It Works

When a user signs in from a preview deployment:

1. **Preview Initiation**: User clicks "Sign in with Microsoft" on `my-app-pr-123.vercel.app`
2. **State Encoding**: The preview URL is JWT-encoded into the OAuth state parameter
3. **OAuth Flow**: User is redirected to Microsoft, then back to the production hub
4. **State Verification**: Hub verifies the JWT state and extracts the preview URL
5. **Session Handoff**: Hub redirects to preview with a one-time session token
6. **Preview Session**: Preview exchanges the token for a session cookie

### 5. Security Features

- **JWT-signed state**: Prevents tampering with redirect URLs
- **Origin validation**: Only allows redirects to `*.vercel.app` and configured domains
- **Time-limited tokens**: State tokens expire after 10 minutes
- **One-time session tokens**: Prevents replay attacks

### 6. Local Development

For local development without the hub:

1. Don't set `AUTH_HUB_URL` in `.env.local`
2. Add `http://localhost:3000/api/auth/callback/microsoft` to Azure AD
3. The app will use the standard OAuth flow locally

### 7. Testing Preview Deployments

1. Create a pull request to trigger a preview deployment
2. Visit the preview URL (e.g., `oauth-preview-urls-pr-1.vercel.app`)
3. Click "Sign in with Microsoft"
4. You should be redirected to Microsoft, then back to your preview
5. Check that you're signed in on the preview deployment

### 8. Troubleshooting

**"Invalid redirect URI" error from Microsoft**
- Ensure the redirect URI in Azure AD exactly matches your `AUTH_HUB_URL` + `/api/auth/callback/microsoft`
- Check that your production deployment is accessible

**"Invalid state parameter" errors**
- Verify `STATE_SECRET` is the same on all deployments
- Check that the preview URL is properly encoded

**Session not persisting on preview**
- Ensure cookies are enabled
- Check browser console for any errors during handoff

**OAuth works locally but not on preview**
- Verify `AUTH_HUB_URL` and `NEXT_PUBLIC_AUTH_HUB_URL` are set in Vercel
- Ensure production deployment is running and accessible

## Architecture Diagram

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│  Preview Deploy │ ──1──▶ │   Microsoft     │ ──3──▶ │  Production Hub │
│  pr-123.vercel  │         │   OAuth         │         │  (AUTH_HUB_URL) │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
         ▲                                                       │
         │                                                       │
         └───────────────────────4──────────────────────────────┘
                        (Redirect with session)

1. User initiates OAuth with encoded state
2. Microsoft OAuth flow
3. Callback to production hub
4. Redirect back to preview with session
```

## Benefits

- ✅ Single redirect URI registration
- ✅ Works with unlimited preview deployments
- ✅ No wildcard domain requirements
- ✅ Cryptographically secure
- ✅ Microsoft-recommended pattern
- ✅ No changes needed for each PR

## Additional Notes

- This pattern can be extended to other OAuth providers
- The session handoff mechanism works across different domains
- Consider implementing refresh token rotation for enhanced security
- Monitor the OAuth hub for any suspicious redirect attempts