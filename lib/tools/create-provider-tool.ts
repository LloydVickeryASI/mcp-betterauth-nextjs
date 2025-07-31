import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { registerTool, type ToolContext } from "./register-tool";
import { getProviderConfig, hasSystemApiKey, type ProviderConfig } from "@/lib/providers/config";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { getAccountByUserIdAndProvider } from "@/lib/db-queries";

// Helper function to check if a provider is connected via OAuth
async function isProviderConnected(userId: string, providerId: string, db: any) {
  const logger = createLogger({ 
    component: 'provider.auth',
    provider: providerId,
    userId 
  });
  
  try {
    const account = await getAccountByUserIdAndProvider(db, userId, providerId);
    
    logger.debug(logger.fmt`Checking ${providerId} connection for user ${userId}`, {
      hasAccount: !!account,
      hasAccessToken: !!(account && account.accessToken),
    });
    
    if (account && account.accessToken) {
      logger.info(logger.fmt`Found ${providerId} connection with account ${account.id}`, {
        accountId: account.id,
      });
      return {
        connected: true,
        accountId: account.id,
      };
    }
    
    logger.debug(logger.fmt`No ${providerId} connection found for user ${userId}`);
    return { connected: false };
  } catch (error) {
    logger.error(logger.fmt`Failed to check ${providerId} connection for user ${userId}`, {
      error: error instanceof Error ? error.message : String(error),
      provider: providerId,
      userId,
    });
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

// Type for auth required response
interface AuthRequiredResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError: true;
}

function capitalizeProvider(provider: string): string {
  // Special cases for provider names
  const specialCases: Record<string, string> = {
    'hubspot': 'HubSpot',
    'pandadoc': 'PandaDoc',
    'xero': 'Xero',
    'sendgrid': 'SendGrid',
    'anthropic': 'Anthropic',
  };
  
  return specialCases[provider.toLowerCase()] || 
    provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
}

function generateAuthErrorMessage(
  provider: string, 
  authMethod: AuthMethod, 
  providerConfig: ProviderConfig | null
): string {
  const providerName = capitalizeProvider(provider);
  
  if (authMethod === 'system') {
    return `${providerName} system API key not configured. Please contact your administrator to configure the system API key.`;
  }
  
  if (authMethod === 'oauth') {
    return `${providerName} authentication required. Please connect your ${providerName} account on the connections page.`;
  }
  
  // For 'auto' mode, provide both options
  const hasSystemSupport = providerConfig?.authMethods?.includes('system');
  if (hasSystemSupport) {
    return `${providerName} authentication not available. You can either connect your account on the connections page or contact your administrator to configure a system API key.`;
  }
  
  return `${providerName} authentication required. Please connect your ${providerName} account on the connections page.`;
}

export function createProviderTool<TArgs = any>(
  server: any,
  config: ProviderToolConfig<TArgs>
) {
  // Default auth method to 'auto' if not specified
  const authMethod = config.authMethod || 'auto';
  
  // Create the wrapped handler
  const wrappedHandler = async (args: TArgs, context: ToolContext) => {
      try {
        // Get provider configuration to check supported auth methods
        const providerConfig = getProviderConfig(config.provider);
        
        // Skip auth check if requiresUserAuth is false
        if (config.requiresUserAuth === false) {
          const providerContext: ProviderToolContext = {
            ...context,
            provider: config.provider,
            authMethod: 'system', // Default to system for no-user-auth tools
          };
          return await config.handler(args, providerContext);
        }
        
        let connectionStatus: { connected: boolean; accountId?: string; authMethod?: 'oauth' | 'system' } = { connected: false };
        let actualAuthMethod: 'oauth' | 'system' | undefined;
        
        // Determine which auth method to use
        if (authMethod === 'oauth' || authMethod === 'auto') {
          // Check OAuth connection
          const oauthStatus = await isProviderConnected(context.session.userId, config.provider, context.db);
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
          // Log provider tool execution
          const providerLogger = createLogger({
            component: 'mcp.provider',
            provider: config.provider,
            tool: config.name,
            authMethod: actualAuthMethod,
            userId: context.session?.userId,
          });
          
          providerLogger.info(providerLogger.fmt`Executing provider tool: ${config.provider}/${config.name}`);
          
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