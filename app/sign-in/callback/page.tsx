'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInCallback() {
  const router = useRouter();

  useEffect(() => {
    // Check if we have MCP OAuth parameters stored
    const mcpParams = sessionStorage.getItem('mcp-oauth-params');
    
    if (mcpParams) {
      // Clear the stored parameters
      sessionStorage.removeItem('mcp-oauth-params');
      
      // Redirect to MCP authorize endpoint with the original parameters
      router.push(`/api/auth/mcp/authorize?${mcpParams}`);
    } else {
      // Regular sign-in, redirect to home
      router.push('/');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Completing sign in...</h2>
        <p className="text-gray-600">Please wait while we redirect you.</p>
      </div>
    </div>
  );
}