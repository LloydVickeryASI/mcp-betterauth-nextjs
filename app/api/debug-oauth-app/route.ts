import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("client_id");
  
  if (!clientId) {
    return Response.json({ error: "Missing client_id parameter" }, { status: 400 });
  }

  try {
    // @ts-ignore - accessing internal API
    const app = await auth.api.getOAuthApplication({ clientId });
    
    return Response.json({
      clientId: app?.clientId,
      redirectUris: app?.redirectUris,
      name: app?.name,
      createdAt: app?.createdAt
    });
  } catch (error) {
    return Response.json({ 
      error: "Failed to fetch OAuth application", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}