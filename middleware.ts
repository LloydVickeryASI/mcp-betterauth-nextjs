import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Get allowed origins from environment variable
 * Defaults to localhost development origins if not configured
 */
function getAllowedOrigins(): string[] {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  
  if (allowedOrigins) {
    return allowedOrigins.split(',').map(origin => origin.trim());
  }
  
  // Default allowed origins for development
  // In production, ALLOWED_ORIGINS should be explicitly set
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://localhost:3000',
    'https://127.0.0.1:3000'
  ];
}

/**
 * Check if the origin is allowed based on the whitelist
 */
function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

/**
 * Get the appropriate origin header value
 */
function getAllowedOriginHeader(requestOrigin: string | null, allowedOrigins: string[]): string | null {
  if (isOriginAllowed(requestOrigin, allowedOrigins)) {
    return requestOrigin;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  // Let the connections page handle its own authentication
  // The MCP OAuth flow might use different session management

  // Handle CORS for /api/auth/* routes
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    // Debug logging
    console.log(`[Middleware] ${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}`)
    
    // Special logging for token exchange
    if (request.nextUrl.pathname === '/api/auth/mcp/token' && request.method === 'POST') {
      const clonedRequest = request.clone();
      try {
        const contentType = request.headers.get('content-type');
        let body;
        
        if (contentType?.includes('application/x-www-form-urlencoded')) {
          const text = await clonedRequest.text();
          body = Object.fromEntries(new URLSearchParams(text));
        } else if (contentType?.includes('application/json')) {
          body = await clonedRequest.json();
        } else {
          body = await clonedRequest.text();
        }
        
        console.log('[Token Exchange Body]:', body);
      } catch (error) {
        console.log('[Token Exchange] Error reading body:', error);
      }
    }
    
    const allowedOrigins = getAllowedOrigins();
    const requestOrigin = request.headers.get('origin');
    const allowedOriginHeader = getAllowedOriginHeader(requestOrigin, allowedOrigins);
    
    const response = NextResponse.next()
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const corsHeaders: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      };
      
      // Only set origin header if the origin is allowed
      if (allowedOriginHeader) {
        corsHeaders['Access-Control-Allow-Origin'] = allowedOriginHeader;
        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
      }
      
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders
      })
    }
    
    // Add CORS headers to all responses only if origin is allowed
    if (allowedOriginHeader) {
      response.headers.set('Access-Control-Allow-Origin', allowedOriginHeader);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return response
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*']
}