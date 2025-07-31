import * as Sentry from "@sentry/nextjs";
import { handleMcpError } from "@/lib/sentry-error-handler";
import { createLogger } from "@/lib/logger";

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
      try {
        // Get the context from the server's stored session
        const context = (server as any).context as ToolContext;
        
        // Use startSpan to create a trace for this tool execution
        return await Sentry.startSpan(
          {
            op: `mcp.tool`,
            name: `MCP Tool: ${name}`,
            attributes: {
              "mcp.tool.name": name,
              "mcp.session.user_id": context.session?.userId,
              "mcp.session.client_id": context.session?.clientId,
              ...extractMcpParameters(args),
            }
          },
          async () => {
            // Use withScope to isolate context changes to this specific tool execution
            return await Sentry.withScope(async (scope) => {
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
              
              // Create tool-specific logger
              const toolLogger = createLogger({
                component: 'mcp.tool',
                tool: name,
                userId: context.session?.userId,
              });
              
              // Log tool execution
              toolLogger.info(toolLogger.fmt`Executing MCP tool: ${name}`, extractMcpParameters(args));

              try {
                const startTime = Date.now();
                const result = await handler(args, context);
                
                // Log successful completion
                const duration = Date.now() - startTime;
                toolLogger.info(toolLogger.fmt`MCP tool completed: ${name} in ${duration}ms`, {
                  duration_ms: duration,
                  success: true,
                });
                
                return result;
              } catch (err) {
                const errorMessage = handleMcpError(err);
                
                // Log error
                toolLogger.error(toolLogger.fmt`MCP tool failed: ${name} - ${errorMessage}`, {
                  error: err instanceof Error ? err.message : String(err),
                  errorMessage,
                  toolArgs: args,
                });
                
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
            });
          }
        );
      } catch (outerErr) {
        // Fallback error handling if Sentry itself fails
        console.error("Error in registerTool wrapper:", outerErr);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: true,
              message: "Internal server error",
              details: outerErr instanceof Error ? outerErr.message : String(outerErr)
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
}