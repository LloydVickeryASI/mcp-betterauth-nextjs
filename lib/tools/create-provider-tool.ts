import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { registerTool, type ToolContext } from "./register-tool";
import { getProviderConfig, hasSystemApiKey, type ProviderConfig } from "@/lib/providers/config";
import { auth } from "@/lib/auth";

// Helper function to check if a provider is connected via OAuth
async function isProviderConnected(userId: string, providerId: string) {
  try {
    const accounts = await auth.api.listUserAccounts({
      query: {
        userId,
      }
    });
    
    console.log(`[DEBUG] Checking ${providerId} connection for user ${userId}`);
    console.log(`[DEBUG] Total accounts found: ${accounts?.length || 0}`);
    console.log(`[DEBUG] Account providers:`, accounts?.map(acc => acc.provider));
    
    // Filter for the specific provider
    const account = accounts?.filter(acc => acc.provider === providerId);
    
    console.log(`[DEBUG] Filtered accounts for ${providerId}:`, account?.length || 0);
    
    if (account && account.length > 0) {
      const acc = account[0];
      console.log(`[DEBUG] Found ${providerId} account with ID:`, acc.accountId);
      return {
        connected: true,
        accountId: acc.accountId,
      };
    }
    
    console.log(`[DEBUG] No ${providerId} account found`);
    return { connected: false };
  } catch (error) {
    console.error(`Failed to check ${providerId} connection:`, error);
    return { connected: false };
  }
}

export type AuthMethod = 'oauth' | 'system' | 'auto';

export interface ProviderToolConfig<TArgs = any> {
  name: string;
  description: string;
  provider: string;
  authMethod?: AuthMethod;
  requiresUserAuth?: boolean;
  schema: Record<string, z.ZodType>;
  handler: (args: TArgs, context: ProviderToolContext) => Promise<any>;
}

export interface ProviderToolContext extends ToolContext {
  accountId?: string;
  provider: string;
  authMethod: 'oauth' | 'system';
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
  const authMethod = config.authMethod || 'auto';
  const requiresUserAuth = config.requiresUserAuth ?? (authMethod === 'oauth');
  
  const wrappedHandler = async (args: TArgs, context: ToolContext) => {
    try {
        const providerConfig = getProviderConfig(config.provider);
        
        if (!providerConfig) {
          throw new Error(`Unknown provider: ${config.provider}`);
        }
        
        let connectionStatus: { connected: boolean; accountId?: string; authMethod?: 'oauth' | 'system' } = { connected: false };
        let actualAuthMethod: 'oauth' | 'system' | undefined;
        
        // Determine which auth method to use
        if (authMethod === 'oauth' || authMethod === 'auto') {
          // Check OAuth connection
          const oauthStatus = await isProviderConnected(context.session.userId, config.provider);
          if (oauthStatus.connected) {
            connectionStatus = { ...oauthStatus, authMethod: 'oauth' };
            actualAuthMethod = 'oauth';
          }
        }
        
        if (!actualAuthMethod && (authMethod === 'system' || authMethod === 'auto')) {
          // Check system API key
          if (hasSystemApiKey(config.provider)) {
            connectionStatus = { connected: true, authMethod: 'system' };
            actualAuthMethod = 'system';
          }
        }
        
        // Handle authentication failure
        if (!connectionStatus.connected || !actualAuthMethod) {
          const errorMessage = generateAuthErrorMessage(
            config.provider,
            authMethod,
            providerConfig
          );
          
          const connectionsUrl = `${context.auth.options.baseURL}/connections`;
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: true,
                authenticated: false,
                message: errorMessage,
                connectionsUrl: authMethod !== 'system' ? connectionsUrl : undefined,
                provider: config.provider,
                authMethod: authMethod
              }, null, 2)
            }],
            isError: true
          } satisfies AuthRequiredResponse;
        }
        
        // Create enhanced context with provider info
        const providerContext: ProviderToolContext = {
          ...context,
          accountId: connectionStatus.accountId,
          provider: config.provider,
          authMethod: actualAuthMethod
        };
        
        try {
          // Add breadcrumb for provider tool execution
          Sentry.addBreadcrumb({
            message: `Executing provider tool: ${config.provider}/${config.name}`,
            category: "mcp.provider",
            level: "info",
            data: {
              provider: config.provider,
              authType: actualAuthMethod,
              tool: config.name,
            },
          });
          
          // Call the actual tool handler
          const result = await config.handler(args, providerContext);
          return result;
        } catch (error: any) {
          // Handle token expiration errors consistently (OAuth only)
          if (actualAuthMethod === 'oauth' && 
              (error?.code === 'UNAUTHORIZED' || error?.code === 'TOKEN_EXPIRED' || 
               error?.response?.status === 401 || error?.status === 401)) {
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
      } catch (outerError) {
        // Log unexpected errors but still throw them
        console.error("Error in createProviderTool:", outerError);
        throw outerError;
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
    anthropic: "Anthropic",
    sendgrid: "SendGrid",
    slack: "Slack",
    xero: "Xero",
  };
  return providerNames[provider.toLowerCase()] || provider;
}

function generateAuthErrorMessage(
  provider: string,
  authMethod: AuthMethod,
  providerConfig: ProviderConfig
): string {
  const providerName = capitalizeProvider(provider);
  
  if (authMethod === 'oauth') {
    return `${providerName} account not connected. Please visit the connections page to link your ${providerName} account.`;
  } else if (authMethod === 'system') {
    return `System API key for ${providerName} not configured. Please contact your administrator.`;
  } else {
    // Auto mode - provide more detailed message
    const hasOAuth = providerConfig.authMethods.oauth;
    const hasSystemKey = providerConfig.authMethods.systemApiKey;
    
    if (hasOAuth && !hasSystemKey) {
      return `${providerName} account not connected. Please visit the connections page to link your ${providerName} account.`;
    } else if (!hasOAuth && hasSystemKey) {
      return `System API key for ${providerName} not configured. Please contact your administrator.`;
    } else {
      return `${providerName} authentication not available. You can either connect your account on the connections page or contact your administrator to configure a system API key.`;
    }
  }
}