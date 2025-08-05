import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthCookieOptions, AUTH_COOKIE_NAMES } from "@/lib/cookie-config";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const next = request.nextUrl.searchParams.get("next") || "/";

  if (!token) {
    return NextResponse.json({ error: "No token provided" }, { status: 400 });
  }

  try {
    // Verify the token is valid by getting the session
    const headers = new Headers();
    headers.set("authorization", `Bearer ${token}`);
    
    const session = await auth.api.getSession({
      headers: headers,
    });

    if (!session) {
      throw new Error("Invalid session token");
    }

    // Create response with redirect
    const response = NextResponse.redirect(new URL(next, request.url));

    // Set the session cookie for this domain using standardized config
    response.cookies.set(
      AUTH_COOKIE_NAMES.SESSION_TOKEN, 
      token, 
      getAuthCookieOptions()
    );

    return response;
  } catch (error) {
    console.error("Session handoff failed:", error);
    // Redirect to sign-in page on error
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
}