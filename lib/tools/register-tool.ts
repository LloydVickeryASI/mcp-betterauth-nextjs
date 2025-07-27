import * as Sentry from "@sentry/nextjs";
import { handleMcpError } from "@/lib/sentry-error-handler";

export interface ToolContext {
  session: {
    userId: string;
    scopes: string[];
    clientId: string;
    active: boolean;
    expiresAt: Date;
    createdAt: Date;
    token: string;
  };
  db: any; // Better SQLite database instance
  auth: any; // Better Auth instance
  userProfile?: {
    id: string;
    email: string;
    name: string;
    image?: string;
  };
}

export function registerTool(
  server: any, // Using any to avoid type issues with mcp-handler
  name: string,
  description: string,
  schema: any,
  handler: (args: any, context: ToolContext) => Promise<any>
) {
  server.tool(
    name,
    description,
    schema,
    async (args: any) => {
      // Get the context from the server's stored session
      const context = (server as any).context as ToolContext;
      
      // Set Sentry user context
      if (context.userProfile) {
        Sentry.setUser({
          id: context.userProfile.id,
          email: context.userProfile.email,
          username: context.userProfile.name,
        });
      }
      
      // Add additional context
      Sentry.setContext("mcp_session", {
        userId: context.session.userId,
        clientId: context.session.clientId,
        scopes: context.session.scopes,
      });
      
      Sentry.setTag("mcp.tool", name);

      try {
        return await handler(args, context);
      } catch (err) {
        // Clear sensitive data before sending to Sentry
        Sentry.setContext("mcp_session", {
          userId: context.session.userId,
          clientId: context.session.clientId,
          scopes: context.session.scopes,
        });
        
        const errorMessage = handleMcpError(err);
        return {
          content: [{
            type: "text",
            text: errorMessage
          }],
        };
      } finally {
        // Clear user context after each tool execution
        Sentry.setUser(null);
        Sentry.setContext("mcp_session", null);
      }
    }
  );
}