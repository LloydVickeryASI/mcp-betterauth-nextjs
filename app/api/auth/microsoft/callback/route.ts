import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

// Create a custom handler that wraps BetterAuth's handler
export async function GET(request: NextRequest) {
  // Check if this is the OAuth hub handling the callback
  const isOAuthHub = process.env.AUTH_HUB_URL && 
    request.nextUrl.origin === process.env.AUTH_HUB_URL;

  // If not the OAuth hub and we have a hub URL configured, 
  // this shouldn't be handling callbacks
  if (!isOAuthHub && process.env.AUTH_HUB_URL) {
    return NextResponse.json(
      { error: "This deployment should not handle OAuth callbacks directly" },
      { status: 400 }
    );
  }

  // Get the state parameter from the URL
  const stateParam = request.nextUrl.searchParams.get("state");
  
  // First, let BetterAuth handle the OAuth callback
  const betterAuthHandler = toNextJsHandler(auth);
  const response = await betterAuthHandler.GET(request);

  // If BetterAuth returned an error or redirect, pass it through
  if (response.status !== 200 && response.status !== 302) {
    return response;
  }

  // Now handle the state-based redirect back to preview
  if (stateParam) {
    try {
      const decoded = jwt.verify(
        stateParam,
        process.env.STATE_SECRET || "dev-secret-please-change"
      ) as { origin: string; next?: string; timestamp: number };

      // Validate the timestamp (prevent replay attacks)
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (decoded.timestamp < tenMinutesAgo) {
        throw new Error("State parameter expired");
      }

      // Validate the origin (must be a Vercel preview URL or allowed domain)
      const originUrl = new URL(decoded.origin);
      const isVercelPreview = originUrl.hostname.endsWith(".vercel.app");
      const isLocalDev = originUrl.hostname === "localhost";
      const isAllowedDomain = process.env.ALLOWED_REDIRECT_DOMAINS?.split(",")
        .some(domain => originUrl.hostname.endsWith(domain.trim()));

      if (!isVercelPreview && !isLocalDev && !isAllowedDomain) {
        throw new Error("Invalid redirect origin");
      }

      // Extract the session from the response
      const setCookieHeader = response.headers.get("set-cookie");
      let sessionToken = null;

      if (setCookieHeader) {
        // Parse the auth session cookie
        const cookies = setCookieHeader.split(", ");
        const sessionCookie = cookies.find((c: string) => c.startsWith("better-auth.session_token="));
        if (sessionCookie) {
          sessionToken = sessionCookie.split("=")[1].split(";")[0];
        }
      }

      // Build the redirect URL with session token for handoff
      const redirectUrl = new URL(decoded.origin);
      redirectUrl.pathname = "/api/auth/session/handoff";
      redirectUrl.searchParams.set("token", sessionToken || "");
      redirectUrl.searchParams.set("next", decoded.next || "/");

      return NextResponse.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("Failed to process OAuth state:", error);
      // Fall back to the default redirect
    }
  }

  // Default behavior - redirect to the app
  return NextResponse.redirect(new URL("/", request.url));
}