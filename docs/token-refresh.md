# OAuth Token Refresh Implementation

This document describes the automatic token refresh implementation for generic OAuth providers in the MCP Better Auth project.

## Overview

Generic OAuth providers (HubSpot, PandaDoc, Xero) now support automatic token refresh when access tokens expire. This ensures uninterrupted API access without requiring users to re-authenticate.

## Key Features

1. **Automatic Token Refresh**: When an API call detects an expired access token, it automatically attempts to refresh it using the stored refresh token.

2. **Provider-Specific Authentication**: Each provider's refresh endpoint respects their specific authentication method:
   - HubSpot: POST authentication
   - PandaDoc: POST authentication
   - Xero: Basic authentication

3. **Graceful Degradation**: If token refresh fails, the system continues with the expired token, allowing the API call to fail naturally with proper error handling.

## Implementation Details

### Database Schema

The `account` table already includes the necessary fields:
- `refreshToken`: Stores the refresh token
- `accessTokenExpiresAt`: Tracks when the access token expires
- `refreshTokenExpiresAt`: Tracks when the refresh token expires (if known)

### Token Refresh Endpoint

A new endpoint `/api/auth/refresh/[provider]` handles token refresh:
- Verifies the user's session
- Checks if the token is expired
- Calls the provider's token endpoint with the refresh token
- Updates the database with new tokens

### Automatic Refresh in API Client

The `SimplifiedApiClient` automatically checks token expiration before making API calls:
- If expired and a refresh token exists, it calls the refresh endpoint
- Updates the request with the new access token
- Logs the refresh attempt for debugging

### Provider Configuration

Each generic OAuth provider has been configured with:
- `accessType: "offline"` to request refresh tokens
- `authentication` method (basic or post) for the token endpoint
- Proper scopes to include offline access

## Usage

No changes are required in existing tools. The token refresh happens automatically:

```typescript
// This will automatically refresh the token if expired
const api = new ProviderApiHelper(context);
const response = await api.get('/endpoint', 'operation');
```

## Error Handling

When token refresh fails:
1. A warning is logged but the request continues
2. The API call proceeds with the expired token
3. If the API rejects the expired token, users see a message to reconnect via `/connections`

## Security Considerations

- Refresh tokens are stored encrypted in the database
- The refresh endpoint requires a valid session token
- Each refresh request is authenticated and authorized
- Refresh tokens are never exposed to the client

## Testing

To test token refresh:
1. Set a short `expires_in` value when connecting a provider
2. Wait for the token to expire
3. Make an API call through an MCP tool
4. Verify the token is automatically refreshed

## Provider-Specific Notes

### HubSpot
- Uses POST authentication with client credentials in the body
- Refresh tokens don't expire

### PandaDoc
- Uses POST authentication with client credentials in the body
- Refresh tokens may expire after extended periods

### Xero
- Uses Basic authentication with base64-encoded credentials
- Refresh tokens expire after 60 days of non-use
- Includes `offline_access` scope for refresh token support