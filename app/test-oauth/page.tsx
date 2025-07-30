'use client';

import { useState, useEffect } from 'react';
import { authClient } from "@/lib/auth-client";

export default function TestOAuth() {
  const [environment, setEnvironment] = useState<{
    authHubUrl?: string;
    currentUrl: string;
    isPreview: boolean;
    isProduction: boolean;
    isLocal: boolean;
  }>({
    currentUrl: '',
    isPreview: false,
    isProduction: false,
    isLocal: false,
  });
  
  const [oauthFlow, setOauthFlow] = useState<{
    redirectUri?: string;
    stateGenerated?: boolean;
    callbackExpected?: string;
  }>({});
  
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check environment
    const url = window.location.origin;
    setEnvironment({
      authHubUrl: process.env.NEXT_PUBLIC_AUTH_HUB_URL,
      currentUrl: url,
      isPreview: url.includes('.vercel.app') && !url.includes('mcp-betterauth-nextjs.vercel.app'),
      isProduction: url === process.env.NEXT_PUBLIC_AUTH_HUB_URL,
      isLocal: url.includes('localhost'),
    });

    // Check session
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const session = await authClient.getSession();
      setSession(session);
    } catch (error) {
      console.error('Session check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const testOAuthFlow = async () => {
    // Determine expected flow
    if (process.env.NEXT_PUBLIC_AUTH_HUB_URL) {
      setOauthFlow({
        redirectUri: `${process.env.NEXT_PUBLIC_AUTH_HUB_URL}/api/auth/callback/microsoft`,
        stateGenerated: true,
        callbackExpected: `${window.location.origin}/api/auth/session/handoff`,
      });
    } else {
      setOauthFlow({
        redirectUri: `${window.location.origin}/api/auth/callback/microsoft`,
        stateGenerated: false,
        callbackExpected: 'Direct callback to current domain',
      });
    }

    // Initiate OAuth
    window.location.href = `/api/auth/microsoft/initiate?callbackURL=/test-oauth`;
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">OAuth Hub Flow Test</h1>
      
      {/* Environment Info */}
      <div className="bg-gray-100 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">Environment Information</h2>
        <dl className="space-y-2">
          <div className="flex">
            <dt className="font-medium w-48">Current URL:</dt>
            <dd className="text-blue-600">{environment.currentUrl}</dd>
          </div>
          <div className="flex">
            <dt className="font-medium w-48">Environment Type:</dt>
            <dd>
              {environment.isLocal && <span className="px-2 py-1 bg-green-100 text-green-800 rounded">Local</span>}
              {environment.isPreview && <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">Preview</span>}
              {environment.isProduction && <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">Production Hub</span>}
            </dd>
          </div>
          <div className="flex">
            <dt className="font-medium w-48">AUTH_HUB_URL:</dt>
            <dd className={environment.authHubUrl ? 'text-green-600' : 'text-red-600'}>
              {environment.authHubUrl || 'Not configured'}
            </dd>
          </div>
        </dl>
      </div>

      {/* OAuth Flow Info */}
      {oauthFlow.redirectUri && (
        <div className="bg-blue-50 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Expected OAuth Flow</h2>
          <dl className="space-y-2">
            <div className="flex">
              <dt className="font-medium w-48">Redirect URI:</dt>
              <dd className="text-sm font-mono">{oauthFlow.redirectUri}</dd>
            </div>
            <div className="flex">
              <dt className="font-medium w-48">State Parameter:</dt>
              <dd>{oauthFlow.stateGenerated ? '✓ Will be generated with origin' : '✗ Standard flow'}</dd>
            </div>
            <div className="flex">
              <dt className="font-medium w-48">Callback Route:</dt>
              <dd className="text-sm">{oauthFlow.callbackExpected}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Session Info */}
      <div className="bg-green-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">Session Status</h2>
        {loading ? (
          <p>Loading...</p>
        ) : session ? (
          <div>
            <p className="text-green-700 font-semibold mb-2">✓ Authenticated</p>
            <dl className="space-y-2 text-sm">
              <div className="flex">
                <dt className="font-medium w-32">User ID:</dt>
                <dd>{session.user?.id}</dd>
              </div>
              <div className="flex">
                <dt className="font-medium w-32">Email:</dt>
                <dd>{session.user?.email}</dd>
              </div>
              <div className="flex">
                <dt className="font-medium w-32">Name:</dt>
                <dd>{session.user?.name}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-red-700">✗ Not authenticated</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        {!session ? (
          <button
            onClick={testOAuthFlow}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Test Microsoft OAuth Flow
          </button>
        ) : (
          <button
            onClick={signOut}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Sign Out
          </button>
        )}
      </div>

      {/* Test Instructions */}
      <div className="mt-8 p-6 bg-yellow-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Test Instructions</h2>
        <ol className="list-decimal list-inside space-y-2">
          <li>Check the environment information above</li>
          <li>Click &quot;Test Microsoft OAuth Flow&quot; to initiate authentication</li>
          <li>Watch the URL changes during the flow</li>
          <li>Verify you&apos;re redirected back to this page after authentication</li>
          <li>Check that session is established</li>
        </ol>
        
        <div className="mt-4 p-4 bg-white rounded border border-yellow-300">
          <h3 className="font-semibold mb-2">Expected Flow for Preview URLs:</h3>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Click button → Redirect to <code>/api/auth/microsoft/initiate</code></li>
            <li>Redirect to Microsoft with state parameter</li>
            <li>After login → Callback to production hub</li>
            <li>Hub validates state → Redirect to preview <code>/api/auth/session/handoff</code></li>
            <li>Session established → Redirect back here</li>
          </ol>
        </div>
      </div>
    </div>
  );
}