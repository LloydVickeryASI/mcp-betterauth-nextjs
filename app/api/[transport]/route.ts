import { z } from "zod";
import { createMcpHandler } from "mcp-handler";
import { withMcpAuth } from "better-auth/plugins";
import { auth } from "@/lib/auth";

const handler = withMcpAuth(auth, (req, session) =>
  createMcpHandler(
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
        "get_user_info",
        "Get current user information",
        {},
        async () => ({
          content: [{
            type: "text",
            text: `Current user: ${session?.user?.email || 'Unknown'}`
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
  )(req),
);

export { handler as GET, handler as POST };