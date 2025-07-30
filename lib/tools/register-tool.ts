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

/**
 * Extract MCP parameters in an OpenTelemetry-safe format
 */
function extractMcpParameters(args: Record<string, any>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      try {
        // Attempt to stringify, but limit depth to avoid circular references
        return [`mcp.param.${key}`, JSON.stringify(value)];
      } catch (error) {
        // Fallback to String() for circular references or other stringify errors
        return [`mcp.param.${key}`, String(value)];
      }
    })
  );
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
      // Start a new trace for each tool call
      return await Sentry.startSpan(
        {
          name: `mcp.tool/${name}`,
          op: "mcp.tool",
          forceTransaction: true, // This creates a new transaction/trace
          attributes: {
            "mcp.tool.name": name,
            ...extractMcpParameters(args),
          },
        },
        async (span) => {
            // Use withScope to isolate context changes to this specific tool execution
            return await Sentry.withScope(async (scope) => {
              // Get the context from the server's stored session
              const context = (server as any).context as ToolContext;
              
              // Set Sentry user context on the isolated scope
              if (context.userProfile) {
                scope.setUser({
                  id: context.userProfile.id,
                  email: context.userProfile.email,
                  username: context.userProfile.name,
                });
              }
              
              // Add additional context to the isolated scope
              scope.setContext("mcp_session", {
                userId: context.session.userId,
                clientId: context.session.clientId,
                scopes: context.session.scopes,
              });
              
              scope.setTag("mcp.tool", name);

              try {
                const result = await handler(args, context);
                span.setStatus({ code: 1 }); // success
                return result;
              } catch (err) {
                span.setStatus({ code: 2 }); // error
                span.recordException(err as Error);
                
                const errorMessage = handleMcpError(err);
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      error: true,
                      message: errorMessage,
                      details: err instanceof Error ? err.message : String(err)
                    }, null, 2)
                  }],
                  isError: true
                };
              }
              // No need for finally block - scope is automatically cleaned up
            });
        }
      );
    }
  );
}