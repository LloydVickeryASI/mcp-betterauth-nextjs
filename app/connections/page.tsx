'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from "@/lib/auth-client";
import * as Sentry from "@sentry/nextjs";

interface ConnectionStatus {
  provider: string;
  connected: boolean;
  email?: string;
  name?: string;
  connectedAt?: string;
  scopes?: string[];
}

function ConnectionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const session = authClient.useSession();

  useEffect(() => {
    if (session.isPending) return;
    
    if (!session.data) {
      router.push('/sign-in');
      return;
    }
    
    // Check for query parameters that indicate OAuth callback status
    const provider = searchParams.get('provider');
    const status = searchParams.get('status');
    const connected = searchParams.get('connected');
    
    if (provider && status === 'error') {
      setNotification({
        type: 'error',
        message: `There was an issue connecting ${provider}. Please check if the connection was successful below or try again.`
      });
    } else if (provider && status === 'check') {
      setNotification({
        type: 'info',
        message: `Verifying ${provider} connection status...`
      });
    } else if (connected) {
      setNotification({
        type: 'success',
        message: `Successfully connected to ${connected}!`
      });
    }
    
    fetchConnectionStatus();
  }, [session.isPending, session.data, router, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchConnectionStatus = async () => {
    try {
      const response = await fetch('/api/connections/status', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setConnections(data.connections);
      } else if (response.status === 401) {
        // If unauthorized, redirect to sign-in
        router.push('/sign-in');
      }
    } catch (error) {
      console.error('Failed to fetch connection status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider: string) => {
    // For generic OAuth providers, we need to ensure the user is already authenticated
    // and then link the new provider to their existing account
    if (!session.data?.user) {
      router.push('/sign-in');
      return;
    }

    try {
      // Log to both console and Sentry for production debugging
      const message = `User ${session.data.user.email} initiating OAuth link for ${provider}`;
      console.log(`[Connections] ${message}`);
      
      Sentry.addBreadcrumb({
        category: 'connections',
        message: message,
        level: 'info',
        data: {
          userEmail: session.data.user.email,
          userId: session.data.user.id,
          provider: provider,
        }
      });
      
      // Better Auth recommends using oauth2.link() for generic OAuth providers
      // This ensures the provider is linked to the existing session rather than
      // creating a new authentication session
      await authClient.oauth2.link({
        providerId: provider,
        callbackURL: `/connections?connected=${provider}`,
      });
    } catch (error) {
      console.error(`Failed to connect ${provider}:`, error);
      
      // Capture connection errors in Sentry
      Sentry.captureException(error, {
        tags: {
          'connection.provider': provider,
          'connection.user': session.data?.user?.email,
        },
        extra: {
          userId: session.data?.user?.id,
          provider: provider,
        }
      });
      
      setNotification({
        type: 'error',
        message: `Failed to connect to ${provider}. Please try again.`
      });
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      const response = await fetch(`/api/connections/${provider}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        fetchConnectionStatus();
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'hubspot':
        return (
          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 11.5V8C22.5 6.34315 21.1569 5 19.5 5C17.8431 5 16.5 6.34315 16.5 8V11.5C16.5 13.1569 17.8431 14.5 19.5 14.5C21.1569 14.5 22.5 13.1569 22.5 11.5Z" fill="currentColor"/>
            <path d="M22.5 22.5C22.5 23.8807 21.3807 25 20 25C18.6193 25 17.5 23.8807 17.5 22.5C17.5 21.1193 18.6193 20 20 20C21.3807 20 22.5 21.1193 22.5 22.5Z" fill="currentColor"/>
            <path d="M9.5 12C10.8807 12 12 10.8807 12 9.5C12 8.11929 10.8807 7 9.5 7C8.11929 7 7 8.11929 7 9.5C7 10.8807 8.11929 12 9.5 12Z" fill="currentColor"/>
            <path d="M10.5 15.5H8.5C7.39543 15.5 6.5 16.3954 6.5 17.5V24C6.5 24.2761 6.72386 24.5 7 24.5H12C12.2761 24.5 12.5 24.2761 12.5 24V17.5C12.5 16.3954 11.6046 15.5 10.5 15.5Z" fill="currentColor"/>
            <path d="M15.5 9.5H11.5M11.5 9.5L20 22.5M11.5 9.5L20 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        );
      case 'pandadoc':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor"/>
            <path d="M8 12.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5z" fill="white"/>
            <path d="M13 12.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5z" fill="white"/>
            <path d="M7 16c0 2.21 1.79 4 4 4h2c2.21 0 4-1.79 4-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        );
      case 'xero':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 12L12 22L22 12L12 2Z" fill="currentColor"/>
            <path d="M7 12L12 7L17 12L12 17L7 12Z" fill="white"/>
          </svg>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Connected Accounts</h1>
          <p className="text-gray-600">
            Manage your integrations with third-party services. These connections allow MCP tools to access your accounts.
          </p>
        </div>

        {session.data?.user && (
          <div className="bg-blue-50 p-4 rounded-lg mb-8">
            <p className="text-sm text-blue-800">
              Signed in as <strong>{session.data.user.email}</strong> with Microsoft
            </p>
          </div>
        )}

        {notification && (
          <div className={`p-4 rounded-lg mb-6 ${
            notification.type === 'error' ? 'bg-red-50 text-red-800' :
            notification.type === 'success' ? 'bg-green-50 text-green-800' :
            'bg-yellow-50 text-yellow-800'
          }`}>
            <div className="flex justify-between items-start">
              <p className="text-sm">{notification.message}</p>
              <button
                onClick={() => setNotification(null)}
                className="ml-4 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* HubSpot Connection */}
          <div className="border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="text-orange-500">
                  {getProviderIcon('hubspot')}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">HubSpot</h3>
                  <p className="text-sm text-gray-600">
                    Access your HubSpot CRM data and contacts
                  </p>
                  {connections.find(c => c.provider === 'hubspot')?.connected && (
                    <p className="text-sm text-green-600 mt-1">
                      Connected as {connections.find(c => c.provider === 'hubspot')?.email}
                    </p>
                  )}
                </div>
              </div>
              <div>
                {connections.find(c => c.provider === 'hubspot')?.connected ? (
                  <button
                    onClick={() => handleDisconnect('hubspot')}
                    className="px-4 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect('hubspot')}
                    className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* PandaDoc Connection */}
          <div className="border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="text-green-600">
                  {getProviderIcon('pandadoc')}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">PandaDoc</h3>
                  <p className="text-sm text-gray-600">
                    Manage your documents and contracts
                  </p>
                  {connections.find(c => c.provider === 'pandadoc')?.connected && (
                    <p className="text-sm text-green-600 mt-1">
                      Connected as {connections.find(c => c.provider === 'pandadoc')?.email}
                    </p>
                  )}
                </div>
              </div>
              <div>
                {connections.find(c => c.provider === 'pandadoc')?.connected ? (
                  <button
                    onClick={() => handleDisconnect('pandadoc')}
                    className="px-4 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect('pandadoc')}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Xero Connection */}
          <div className="border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="text-blue-600">
                  {getProviderIcon('xero')}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Xero</h3>
                  <p className="text-sm text-gray-600">
                    Access your Xero accounting data and contacts
                  </p>
                  {connections.find(c => c.provider === 'xero')?.connected && (
                    <p className="text-sm text-green-600 mt-1">
                      Connected{connections.find(c => c.provider === 'xero')?.email ? ` as ${connections.find(c => c.provider === 'xero')?.email}` : connections.find(c => c.provider === 'xero')?.name ? ` to ${connections.find(c => c.provider === 'xero')?.name}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div>
                {connections.find(c => c.provider === 'xero')?.connected ? (
                  <button
                    onClick={() => handleDisconnect('xero')}
                    className="px-4 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect('xero')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-700 mb-2">About Connections</h4>
          <p className="text-sm text-gray-600">
            These connections are used by MCP tools to access your data. When you use a tool that requires
            authentication, it will use the connected account associated with your Microsoft login.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Connections() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading connections...</div>
      </div>
    }>
      <ConnectionsContent />
    </Suspense>
  );
}