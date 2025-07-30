import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountsByUserId } from "@/lib/db-queries";
import { Pool } from "@neondatabase/serverless";

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
        scopes: ['crm.objects.contacts.read']
      },
      {
        provider: 'pandadoc',
        connected: false,
        email: '',
        connectedAt: '',
        scopes: ['read+write']
      }
    ];

    // Update connection status based on actual accounts
    for (const account of accounts) {
      const connection = connections.find(c => c.provider === account.providerId);
      if (connection) {
        connection.connected = true;
        connection.connectedAt = account.createdAt;
        
        // Try to get email from the user's account data
        if (account.providerId === 'hubspot' || account.providerId === 'pandadoc') {
          // You might need to fetch this from the provider's API or store it during auth
          connection.email = account.email || session.user.email;
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