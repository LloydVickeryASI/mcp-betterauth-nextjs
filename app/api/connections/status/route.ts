import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountsByUserId } from "@/lib/db-queries";
import { Pool } from "@neondatabase/serverless";
import { OAUTH_SCOPES } from "@/lib/oauth-scopes";

export async function GET(req: Request) {
  try {
    // Get the session using Better Auth
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query the database for connected accounts
    const db = auth.options.database as Pool;
    
    // Get all accounts linked to this user
    const accounts = await getAccountsByUserId(db, session.user.id);
    
    // Format the connection status for each provider
    const connections = [
      {
        provider: 'hubspot',
        connected: false,
        email: '',
        connectedAt: '',
        scopes: [...OAUTH_SCOPES.hubspot]
      },
      {
        provider: 'pandadoc',
        connected: false,
        email: '',
        connectedAt: '',
        scopes: [...OAUTH_SCOPES.pandadoc]
      },
      {
        provider: 'xero',
        connected: false,
        email: '',
        name: '',
        connectedAt: '',
        scopes: [...OAUTH_SCOPES.xero]
      }
    ];

    // Update connection status based on actual accounts
    for (const account of accounts) {
      const connection = connections.find(c => c.provider === account.providerId);
      if (connection) {
        connection.connected = true;
        connection.connectedAt = account.createdAt;
        
        // Since the account table doesn't store provider-specific emails,
        // we show the main user's email for all connections
        // This is correct because all these accounts are linked to the same user
        connection.email = session.user.email;
        
        // For Xero, we can show the organization name if needed
        if (account.providerId === 'xero') {
          // The accountId for Xero is the tenant ID
          // We could fetch the tenant name from Xero API if needed
          connection.name = session.user.name || 'Xero Account';
        }
      }
    }

    return NextResponse.json({ connections });
  } catch (error) {
    console.error('Error fetching connection status:', error);
    return NextResponse.json(
      { error: "Failed to fetch connection status" },
      { status: 500 }
    );
  }
}