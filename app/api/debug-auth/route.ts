import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  try {
    // Get the session using Better Auth
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get user accounts
    const accounts = await auth.api.listUserAccounts({
      query: {
        userId: session.user.id,
      }
    });

    // Debug information
    const debugInfo = {
      userId: session.user.id,
      totalAccounts: accounts?.length || 0,
      accounts: accounts?.map(acc => ({
        provider: acc.provider,
        providerId: (acc as any).providerId,
        accountId: acc.accountId,
        createdAt: acc.createdAt,
        hasAccessToken: !!(acc as any).accessToken,
      })),
      rawFirstAccount: accounts?.[0],
    };

    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('Debug auth error:', error);
    return NextResponse.json(
      { error: "Failed to get debug info", details: String(error) },
      { status: 500 }
    );
  }
}