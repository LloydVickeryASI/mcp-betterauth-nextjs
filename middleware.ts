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
  
  // For development, be more permissive with localhost
  // In production, ALLOWED_ORIGINS should be explicitly set
  if (process.env.NODE_ENV === 'development') {
    return ['*']; // Special marker for dev mode
  }
  
  // Production fallback
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
  
  // In development, allow all localhost/127.0.0.1 origins
  if (process.env.NODE_ENV === 'development' && 
      (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    return true;
  }
  
  return allowedOrigins.includes(origin) || allowedOrigins.includes('*');
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

  // Handle CORS for /api/auth/* routes AND /.well-known/* routes (for OAuth metadata)
  if (request.nextUrl.pathname.startsWith('/api/auth') || 
      request.nextUrl.pathname.startsWith('/.well-known/')) {
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
    
    // For OAuth metadata endpoints, be more permissive to support MCP Inspector
    const isOAuthMetadataEndpoint = request.nextUrl.pathname.includes('/.well-known/') ||
                                   request.nextUrl.pathname.includes('/mcp/register') ||
                                   request.nextUrl.pathname.includes('/mcp/authorize') ||
                                   request.nextUrl.pathname.includes('/mcp/token');
    
    let allowedOriginHeader = getAllowedOriginHeader(requestOrigin, allowedOrigins);
    
    // For OAuth endpoints, allow MCP Inspector and other OAuth clients in production
    if (isOAuthMetadataEndpoint && !allowedOriginHeader && requestOrigin) {
      // Allow common MCP Inspector patterns and OAuth client origins
      if (requestOrigin.includes('localhost') || 
          requestOrigin.includes('127.0.0.1') ||
          requestOrigin.includes('mcp-inspector') ||
          // Allow any HTTPS origin for OAuth metadata (secure origins only)
          requestOrigin.startsWith('https://')) {
        allowedOriginHeader = requestOrigin;
      }
    }
    
    const response = NextResponse.next()
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const corsHeaders: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      };
      
      // Set origin header if the origin is allowed
      if (allowedOriginHeader) {
        corsHeaders['Access-Control-Allow-Origin'] = allowedOriginHeader;
        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
      }
      
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders
      })
    }
    
    // Add CORS headers to all responses if origin is allowed
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
  matcher: ['/api/:path*', '/.well-known/:path*']
}