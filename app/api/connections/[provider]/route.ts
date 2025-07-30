import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/db-queries";
import { Pool } from "@neondatabase/serverless";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    // Get the session using Better Auth
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await context.params;
    
    // Validate provider
    if (!['hubspot', 'pandadoc'].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    // Delete the account connection from the database
    const db = auth.options.database as Pool;
    
    const deletedCount = await deleteAccount(db, session.user.id, provider);

    if (deletedCount > 0) {
      return NextResponse.json({ success: true, message: `${provider} disconnected successfully` });
    } else {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
  } catch (error) {
    console.error('Error disconnecting account:', error);
    return NextResponse.json(
      { error: "Failed to disconnect account" },
      { status: 500 }
    );
  }
}