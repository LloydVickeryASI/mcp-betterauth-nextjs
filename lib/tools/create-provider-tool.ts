import { z } from "zod";
import { registerTool, type ToolContext } from "./register-tool";
import { isProviderConnected } from "@/lib/external-api-helpers";

export interface ProviderToolConfig<TArgs = any> {
  name: string;
  description: string;
  provider: string;
  schema: Record<string, z.ZodType>;
  handler: (args: TArgs, context: ProviderToolContext) => Promise<any>;
}

export interface ProviderToolContext extends ToolContext {
  accountId: string;
  provider: string;
}

interface AuthRequiredResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Creates a provider-specific tool with automatic authentication handling
 */
export function createProviderTool<TArgs = any>(
  server: any,
  config: ProviderToolConfig<TArgs>
) {
  const wrappedHandler = async (args: TArgs, context: ToolContext) => {
    // Check provider connection
    const connectionStatus = await isProviderConnected(context.session.userId, config.provider);
    
    if (!connectionStatus.connected) {
      // Return standardized auth required response
      const connectionsUrl = `${context.auth.options.baseURL}/connections`;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            authenticated: false,
            message: `${capitalizeProvider(config.provider)} account not connected. Please visit the connections page to link your ${capitalizeProvider(config.provider)} account.`,
            connectionsUrl: connectionsUrl,
            provider: config.provider
          }, null, 2)
        }],
        isError: true
      } satisfies AuthRequiredResponse;
    }
    
    // Create enhanced context with provider info
    const providerContext: ProviderToolContext = {
      ...context,
      accountId: connectionStatus.accountId!,
      provider: config.provider
    };
    
    try {
      // Call the actual tool handler
      return await config.handler(args, providerContext);
    } catch (error: any) {
      // Handle token expiration errors consistently
      if (error?.code === 'UNAUTHORIZED' || error?.code === 'TOKEN_EXPIRED' || 
          error?.response?.status === 401 || error?.status === 401) {
        const connectionsUrl = `${context.auth.options.baseURL}/connections`;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: true,
              authenticated: false,
              message: `${capitalizeProvider(config.provider)} token expired. Please reconnect your ${capitalizeProvider(config.provider)} account on the connections page.`,
              connectionsUrl: connectionsUrl,
              provider: config.provider
            }, null, 2)
          }],
          isError: true
        } satisfies AuthRequiredResponse;
      }
      
      // Re-throw other errors to be handled by registerTool's error handler
      throw error;
    }
  };
  
  // Register the tool with wrapped handler
  registerTool(
    server,
    config.name,
    config.description,
    config.schema,
    wrappedHandler
  );
}

function capitalizeProvider(provider: string): string {
  const providerNames: Record<string, string> = {
    hubspot: "HubSpot",
    pandadoc: "PandaDoc",
    microsoft: "Microsoft",
  };
  return providerNames[provider.toLowerCase()] || provider;
}