import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for auth routes to ensure proper database handling
export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

// Wrap handlers with error handling for OAuth callbacks
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  try {
    const response = await handlers.GET(request);
    
    // Check if this was an OAuth callback that succeeded (both /callback/ and /oauth2/callback/ patterns)
    if ((pathname.includes('/callback/') || pathname.includes('/oauth2/callback/')) && response.status === 302) {
      const location = response.headers.get('location');
      
      // If the redirect location contains an error, handle it gracefully
      if (location?.includes('error=')) {
        console.error('[OAuth Callback] Redirect with error detected:', location);
        
        // Extract the provider from the pathname (handle both patterns)
        const provider = pathname.includes('/oauth2/callback/') 
          ? pathname.split('/oauth2/callback/')[1]?.split('?')[0]
          : pathname.split('/callback/')[1]?.split('?')[0];
        
        // For HubSpot and other provider callbacks, redirect to connections page
        // even if there was an error, as the connection might still be saved
        if (provider && ['hubspot', 'pandadoc', 'xero'].includes(provider)) {
          return NextResponse.redirect(new URL(`/connections?provider=${provider}&status=check`, request.url));
        }
      }
    }
    
    return response;
  } catch (error) {
    console.error('[Auth Route] Error handling request:', error);
    
    // Check if this is an OAuth callback error (handle both patterns)
    if (pathname.includes('/callback/') || pathname.includes('/oauth2/callback/')) {
      const provider = pathname.includes('/oauth2/callback/') 
        ? pathname.split('/oauth2/callback/')[1]?.split('?')[0]
        : pathname.split('/callback/')[1]?.split('?')[0];
      
      // For known providers, redirect to connections page to check status
      if (provider && ['hubspot', 'pandadoc', 'xero'].includes(provider)) {
        console.log(`[OAuth Callback] Error for ${provider}, redirecting to connections page`);
        return NextResponse.redirect(new URL(`/connections?provider=${provider}&status=error`, request.url));
      }
      
      // For Microsoft/primary auth, redirect to sign-in with error
      if (provider === 'microsoft') {
        return NextResponse.redirect(new URL('/sign-in?error=oauth_callback_failed', request.url));
      }
    }
    
    // For other errors, return a generic error response
    return NextResponse.json(
      { error: 'Authentication error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handlers.POST(request);
  } catch (error) {
    console.error('[Auth Route] POST error:', error);
    return NextResponse.json(
      { error: 'Authentication error occurred' },
      { status: 500 }
    );
  }
}