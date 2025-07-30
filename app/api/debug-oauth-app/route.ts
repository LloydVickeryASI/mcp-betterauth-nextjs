import { Pool } from "@neondatabase/serverless";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("client_id");
  
  if (!clientId) {
    return Response.json({ error: "Missing client_id parameter" }, { status: 400 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    const result = await pool.query(
      'SELECT "clientId", "redirectUris", "name", "createdAt" FROM "oauthApplication" WHERE "clientId" = $1',
      [clientId]
    );
    
    if (result.rows.length === 0) {
      return Response.json({ error: "OAuth application not found" }, { status: 404 });
    }
    
    const app = result.rows[0];
    return Response.json({
      clientId: app.clientId,
      redirectUris: app.redirectUris,
      name: app.name,
      createdAt: app.createdAt
    });
  } catch (error) {
    return Response.json({ 
      error: "Failed to fetch OAuth application", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  } finally {
    await pool.end();
  }
}