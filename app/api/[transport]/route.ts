import { z } from "zod";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { auth } from "@/lib/auth";

const baseHandler = createMcpHandler(
  (server) => {
    server.tool(
      "echo",
      "Echo back a string",
      { message: z.string() },
      async ({ message }) => ({
        content: [{ type: "text", text: `Echo: ${message}` }],
      }),
    );
    
    server.tool(
      "get_auth_status",
      "Get authentication status",
      {},
      async () => ({
        content: [{
          type: "text",
          text: "Authenticated via Better Auth MCP"
        }],
      }),
    );
  },
  {},
  {
    basePath: "/api",
    redisUrl: process.env.REDIS_URL,
    verboseLogs: true,
    maxDuration: 60,
  },
);

const verifyToken = async (
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;

  try {
    const session = await auth.api.getMcpSession({
      headers: req.headers
    });
    
    if (session) {
      return {
        token: bearerToken,
        scopes: Array.isArray(session.scopes) ? session.scopes : [],
        clientId: session.clientId || "unknown",
        extra: { session }
      };
    }
  } catch (error) {
    console.error("Token verification failed:", error);
  }
  
  return undefined;
};

const handler = withMcpAuth(baseHandler, verifyToken, {
  required: true
});

export { handler as GET, handler as POST };