'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { authClient } from "@/lib/auth-client";

function SignInContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const response = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      // For MCP OAuth flow, we need to complete the authorization
      const mcpParams = searchParams.toString();
      if (mcpParams) {
        window.location.href = `/api/auth/mcp/authorize?${mcpParams}`;
      } else {
        window.location.href = '/connections';
      }
    }
  };

  const handleMicrosoftSignIn = async () => {
    try {
      const mcpParams = searchParams.toString();
      console.log('Starting Microsoft sign-in with params:', mcpParams);
      
      // Use OAuth hub pattern if configured
      if (process.env.NEXT_PUBLIC_AUTH_HUB_URL) {
        const callbackURL = mcpParams ? `/api/auth/mcp/authorize?${mcpParams}` : "/connections";
        window.location.href = `/api/auth/microsoft/initiate?callbackURL=${encodeURIComponent(callbackURL)}`;
      } else {
        // Standard BetterAuth flow for local development
        await authClient.signIn.social({
          provider: "microsoft",
          callbackURL: mcpParams ? `/api/auth/mcp/authorize?${mcpParams}` : "/connections",
        });
      }
    } catch (error) {
      console.error('Microsoft sign-in error:', error);
    }
  };


  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-8">Sign In</h1>
        
        <button
          onClick={handleMicrosoftSignIn}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 mb-4"
        >
          <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#00A4EF"/>
            <rect x="1" y="11" width="9" height="9" fill="#7FBA00"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          Continue with Microsoft
        </button>


        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<div className="flex min-h-screen flex-col items-center justify-center p-24">Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}