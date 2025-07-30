import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAccountByUserIdAndProvider } from '@/lib/db-queries';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const provider = params.provider;
    
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Verify the session token
    const sessionResponse = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` })
    });

    if (!sessionResponse?.session || !sessionResponse?.user) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Get the account for this provider
    const account = await getAccountByUserIdAndProvider(
      pool,
      sessionResponse.user.id,
      provider
    );

    if (!account || !account.refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token found for this provider' },
        { status: 404 }
      );
    }

    // Check if the access token is still valid
    if (account.accessTokenExpiresAt && new Date(account.accessTokenExpiresAt) > new Date()) {
      return NextResponse.json({
        accessToken: account.accessToken,
        expiresAt: account.accessTokenExpiresAt,
        refreshed: false
      });
    }

    // Get the provider configuration from the auth instance
    const genericOAuthPlugin = auth.options.plugins?.find((p: any) => p.id === 'generic-oauth') as any;
    const providerConfigs = genericOAuthPlugin?.options?.config || [];
    const providerConfig = providerConfigs.find((c: any) => c.providerId === provider);

    if (!providerConfig) {
      return NextResponse.json(
        { error: 'Provider not configured' },
        { status: 404 }
      );
    }

    // Refresh the token using Better Auth's built-in function
    try {
      // We need to call the refresh function through the auth API
      const refreshResponse = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(providerConfig.authentication === 'basic' ? {
            'Authorization': `Basic ${Buffer.from(`${providerConfig.clientId}:${providerConfig.clientSecret}`).toString('base64')}`
          } : {})
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: account.refreshToken,
          ...(providerConfig.authentication === 'post' ? {
            client_id: providerConfig.clientId,
            client_secret: providerConfig.clientSecret
          } : {})
        }).toString()
      });
      
      if (!refreshResponse.ok) {
        const errorData = await refreshResponse.json();
        throw new Error(errorData.error || 'Failed to refresh token');
      }
      
      const refreshedTokens = await refreshResponse.json();
      
      // Update the account with new tokens
      const updateQuery = `
        UPDATE account 
        SET 
          "accessToken" = $1,
          "refreshToken" = $2,
          "accessTokenExpiresAt" = $3,
          "refreshTokenExpiresAt" = $4,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE 
          "userId" = $5 
          AND "providerId" = $6
      `;

      // Calculate expiration times based on expires_in
      const now = new Date();
      const accessTokenExpiresAt = refreshedTokens.expires_in 
        ? new Date(now.getTime() + refreshedTokens.expires_in * 1000)
        : null;
      
      await pool.query(updateQuery, [
        refreshedTokens.access_token,
        refreshedTokens.refresh_token || account.refreshToken,
        accessTokenExpiresAt,
        null, // refreshTokenExpiresAt - we don't know when the refresh token expires
        sessionResponse.user.id,
        provider
      ]);

      return NextResponse.json({
        accessToken: refreshedTokens.access_token,
        expiresAt: accessTokenExpiresAt,
        refreshed: true
      });
    } catch (refreshError: any) {
      console.error(`Failed to refresh token for ${provider}:`, refreshError);
      
      // If refresh fails, the refresh token might be expired
      return NextResponse.json(
        { 
          error: 'Failed to refresh token',
          details: refreshError.message,
          requiresReauth: true 
        },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Error in refresh token endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await pool.end();
  }
}