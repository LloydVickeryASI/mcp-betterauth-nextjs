import { z } from "zod";
import { registerTool, type ToolContext } from "./register-tool";
import { isProviderConnected } from "@/lib/external-api-helpers";
import { getProviderConfig, hasSystemApiKey, type ProviderConfig } from "@/lib/providers/config";

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
      // Call the actual tool handler
      return await config.handler(args, providerContext);
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
    openai: "OpenAI",
    anthropic: "Anthropic",
    stripe: "Stripe",
    sendgrid: "SendGrid",
    slack: "Slack",
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