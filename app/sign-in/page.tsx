'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3000",
  plugins: [genericOAuthClient()]
});

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
        window.location.href = '/';
      }
    }
  };

  const handleMicrosoftSignIn = async () => {
    // For MCP OAuth flow, we need to handle social sign-in differently
    // We'll use Better Auth's social sign-in but preserve the MCP OAuth state
    const mcpParams = searchParams.toString();
    
    await authClient.signIn.social({
      provider: "microsoft",
      callbackURL: mcpParams ? `/api/auth/mcp/authorize?${mcpParams}` : "/",
    });
  };

  const handleHubSpotSignIn = async () => {
    const mcpParams = searchParams.toString();
    
    await authClient.signIn.social({
      provider: "hubspot",
      callbackURL: mcpParams ? `/api/auth/mcp/authorize?${mcpParams}` : "/",
    });
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

        <button
          onClick={handleHubSpotSignIn}
          className="w-full bg-orange-500 text-white py-2 px-4 rounded-md hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 mb-6"
        >
          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 11.5V8C22.5 6.34315 21.1569 5 19.5 5C17.8431 5 16.5 6.34315 16.5 8V11.5C16.5 13.1569 17.8431 14.5 19.5 14.5C21.1569 14.5 22.5 13.1569 22.5 11.5Z" fill="white"/>
            <path d="M22.5 22.5C22.5 23.8807 21.3807 25 20 25C18.6193 25 17.5 23.8807 17.5 22.5C17.5 21.1193 18.6193 20 20 20C21.3807 20 22.5 21.1193 22.5 22.5Z" fill="white"/>
            <path d="M9.5 12C10.8807 12 12 10.8807 12 9.5C12 8.11929 10.8807 7 9.5 7C8.11929 7 7 8.11929 7 9.5C7 10.8807 8.11929 12 9.5 12Z" fill="white"/>
            <path d="M10.5 15.5H8.5C7.39543 15.5 6.5 16.3954 6.5 17.5V24C6.5 24.2761 6.72386 24.5 7 24.5H12C12.2761 24.5 12.5 24.2761 12.5 24V17.5C12.5 16.3954 11.6046 15.5 10.5 15.5Z" fill="white"/>
            <path d="M15.5 9.5H11.5M11.5 9.5L20 22.5M11.5 9.5L20 11.5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Continue with HubSpot
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