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
    'https://127.0.0.1:3000',
    // Common MCP Inspector client origins
    'http://localhost:6274',
    'http://127.0.0.1:6274',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];
}

/**
 * Get pattern-based allowed origins for flexible matching (supports wildcards)
 * Examples:
 *   - https://*.openai.com
 *   - https://*.anthropic.com
 *   - http://localhost:*
 */
function getAllowedOriginPatterns(): string[] {
  const patterns = process.env.ALLOWED_ORIGIN_PATTERNS;
  if (patterns) {
    return patterns.split(',').map(p => p.trim());
  }
  return [];
}

/** Convert a simple wildcard pattern to RegExp */
function wildcardToRegExp(pattern: string): RegExp {
  // Escape regex special chars except * and :
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/:\*/g, ':[0-9]{1,5}');
  return new RegExp(`^${escaped}$`);
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
  
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    return true;
  }

  // Pattern-based allow list
  const patterns = getAllowedOriginPatterns();
  for (const pattern of patterns) {
    if (pattern === '*') return true;
    try {
      if (wildcardToRegExp(pattern).test(origin)) return true;
    } catch {
      // ignore invalid pattern
    }
  }
  return false;
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
    
    // Special logging for token exchange (sanitized for security)
    if (request.nextUrl.pathname === '/api/auth/mcp/token' && request.method === 'POST') {
      // Only log that a token exchange is happening, not the sensitive data
      console.log('[Token Exchange] Request received');
    }
    
    const allowedOrigins = getAllowedOrigins();
    const requestOrigin = request.headers.get('origin');
    
    // For OAuth metadata discovery endpoints only, we need to be more permissive
    // These are read-only endpoints that don't expose sensitive data
    const isOAuthDiscoveryEndpoint = request.nextUrl.pathname.includes('/.well-known/');
    
    // OAuth action endpoints require proper CORS validation
    const isOAuthActionEndpoint = request.nextUrl.pathname.includes('/mcp/register') ||
                                 request.nextUrl.pathname.includes('/mcp/authorize') ||
                                 request.nextUrl.pathname.includes('/mcp/token');
    
    let allowedOriginHeader = getAllowedOriginHeader(requestOrigin, allowedOrigins);
    
    // For OAuth discovery endpoints, allow any origin (read-only, no sensitive data)
    // For OAuth action endpoints, enforce CORS properly
    if (isOAuthDiscoveryEndpoint && requestOrigin) {
      // Allow any origin for read-only discovery
      allowedOriginHeader = requestOrigin;
    } else if (isOAuthActionEndpoint) {
      const allowAllForMcp = process.env.ALLOW_ALL_ORIGINS_FOR_MCP === 'true';
      const allowNullOrigin = process.env.ALLOW_NULL_ORIGIN === 'true';
      // For anonymous endpoints like registration and token, optionally allow all
      if (!allowedOriginHeader) {
        if (allowAllForMcp) {
          // Use wildcard; do not set credentials with '*'
          allowedOriginHeader = '*';
        } else if (!requestOrigin && allowNullOrigin) {
          // Desktop apps / non-browser contexts
          allowedOriginHeader = '*';
        } else if (process.env.NODE_ENV === 'development' && !requestOrigin) {
          console.log('[CORS] Development mode: Allowing request without origin header');
        } else {
          console.warn(`[CORS] Blocked OAuth action from origin: ${requestOrigin}`);
          return new NextResponse(
            JSON.stringify({ error: 'CORS: Origin not allowed' }),
            { 
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
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
        if (allowedOriginHeader !== '*') {
          corsHeaders['Access-Control-Allow-Credentials'] = 'true';
        }
      }
      
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders
      })
    }
    
    // Add CORS headers to all responses if origin is allowed
    if (allowedOriginHeader) {
      response.headers.set('Access-Control-Allow-Origin', allowedOriginHeader);
      if (allowedOriginHeader !== '*') {
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }
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