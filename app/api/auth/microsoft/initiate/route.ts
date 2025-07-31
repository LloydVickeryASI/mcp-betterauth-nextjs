import { NextRequest, NextResponse } from "next/server";
import { generateOAuthState } from "@/lib/auth/oauth-helpers";

export async function GET(request: NextRequest) {
  // Get the callback URL from query params
  const callbackURL = request.nextUrl.searchParams.get("callbackURL") || "/connections";
  
  // Generate state with current origin
  const origin = request.headers.get("referer") || request.nextUrl.origin;
  const state = generateOAuthState({
    origin,
    next: callbackURL,
  });

  // Build Microsoft OAuth URL
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", process.env.AUTH_HUB_URL 
    ? `${process.env.AUTH_HUB_URL}/api/auth/callback/microsoft`
    : `${origin}/api/auth/callback/microsoft`
  );
  authUrl.searchParams.set("scope", "openid email profile offline_access");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl.toString());
}