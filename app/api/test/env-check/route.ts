import { NextResponse } from "next/server";

export async function GET() {
  const envCheck = {
    oauth: {
      microsoft: {
        clientId: !!process.env.MICROSOFT_CLIENT_ID,
        clientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
      },
    },
    hub: {
      authHubUrl: process.env.AUTH_HUB_URL || null,
      publicAuthHubUrl: process.env.NEXT_PUBLIC_AUTH_HUB_URL || null,
      stateSecret: !!process.env.STATE_SECRET,
      allowedDomains: process.env.ALLOWED_REDIRECT_DOMAINS || null,
    },
    deployment: {
      vercelUrl: process.env.VERCEL_URL || null,
      nodeEnv: process.env.NODE_ENV,
      authUrl: process.env.AUTH_URL || null,
    },
    database: {
      configured: !!process.env.DATABASE_URL,
    },
    auth: {
      betterAuthSecret: !!process.env.BETTER_AUTH_SECRET,
    },
  };

  // Check if hub pattern is properly configured
  const hubPatternReady = !!(
    envCheck.hub.authHubUrl &&
    envCheck.hub.publicAuthHubUrl &&
    envCheck.hub.stateSecret
  );

  // Add recommendations
  const recommendations = [];
  
  if (!hubPatternReady && process.env.VERCEL_URL?.includes('.vercel.app')) {
    recommendations.push('Configure AUTH_HUB_URL, NEXT_PUBLIC_AUTH_HUB_URL, and STATE_SECRET for OAuth on preview URLs');
  }
  
  if (!envCheck.oauth.microsoft.clientId || !envCheck.oauth.microsoft.clientSecret) {
    recommendations.push('Configure MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET');
  }
  
  if (!envCheck.auth.betterAuthSecret) {
    recommendations.push('Configure BETTER_AUTH_SECRET for secure sessions');
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: envCheck,
    status: {
      hubPatternReady,
      oauthConfigured: envCheck.oauth.microsoft.clientId && envCheck.oauth.microsoft.clientSecret,
      isPreview: !!process.env.VERCEL_URL?.includes('.vercel.app'),
    },
    recommendations,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}