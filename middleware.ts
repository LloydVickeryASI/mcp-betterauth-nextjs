import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Protect test routes in production
  if (process.env.NODE_ENV === 'production') {
    const path = request.nextUrl.pathname;
    
    // List of test routes to protect
    const testRoutes = ['/test-oauth', '/api/test'];
    
    // Check if the current path starts with any test route
    const isTestRoute = testRoutes.some(route => path.startsWith(route));
    
    if (isTestRoute) {
      // Return 404 for test routes in production
      return new NextResponse('Not Found', { status: 404 });
    }
  }

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
    
    const response = NextResponse.next()
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      })
    }
    
    // Add CORS headers to all responses
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    return response
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/test-oauth']
}