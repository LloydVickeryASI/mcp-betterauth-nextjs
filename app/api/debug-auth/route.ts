import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  // Only allow debug endpoints in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Get the session using Better Auth
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let accounts;
    let accountsError;
    
    // Try to get user accounts
    try {
      accounts = await auth.api.listUserAccounts({
        query: {
          userId: session.user.id,
        }
      });
    } catch (err) {
      accountsError = {
        message: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : 'Unknown',
        stack: err instanceof Error ? err.stack : undefined,
      };
    }

    // Also try direct database query
    const db = auth.options.database as any;
    let dbAccounts;
    try {
      const result = await db.query(
        'SELECT "providerId", "accountId", "createdAt" FROM account WHERE "userId" = $1',
        [session.user.id]
      );
      dbAccounts = result.rows;
    } catch (err) {
      dbAccounts = { error: String(err) };
    }

    // Debug information
    const debugInfo = {
      userId: session.user.id,
      userEmail: session.user.email,
      apiAccounts: {
        success: !accountsError,
        error: accountsError,
        data: accounts ? {
          totalAccounts: accounts.length,
          accounts: accounts.map(acc => ({
            provider: acc.provider,
            providerId: (acc as any).providerId,
            accountId: acc.accountId,
            createdAt: acc.createdAt,
          })),
        } : null,
      },
      dbAccounts: dbAccounts,
    };

    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('Debug auth error:', error);
    return NextResponse.json(
      { 
        error: "Failed to get debug info", 
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}