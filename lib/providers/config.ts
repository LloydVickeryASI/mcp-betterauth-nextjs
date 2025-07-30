export interface OAuthConfig {
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
}

export interface SystemApiKeyConfig {
  envVar: string;
  headerName: string;
  headerFormat?: string;
}

export interface UserApiKeyConfig {
  headerName: string;
  headerFormat?: string;
}

export interface ProviderConfig {
  authMethods: {
    oauth?: OAuthConfig;
    systemApiKey?: SystemApiKeyConfig;
    userApiKey?: UserApiKeyConfig;
  };
  baseUrl: string;
  headers?: Record<string, string>;
}

export const providers: Record<string, ProviderConfig> = {
  anthropic: {
    authMethods: {
      systemApiKey: {
        envVar: "ANTHROPIC_API_KEY",
        headerName: "x-api-key",
        headerFormat: "{key}"
      }
    },
    baseUrl: "https://api.anthropic.com"
  },
  hubspot: {
    authMethods: {
      oauth: {
        scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"]
      },
      systemApiKey: {
        envVar: "HUBSPOT_API_KEY",
        headerName: "Authorization",
        headerFormat: "Bearer {key}"
      }
    },
    baseUrl: "https://api.hubapi.com"
  },
  pandadoc: {
    authMethods: {
      oauth: {
        scopes: ["read+write"]
      },
      systemApiKey: {
        envVar: "PANDADOC_API_KEY",
        headerName: "Authorization",
        headerFormat: "API-Key {key}"
      }
    },
    baseUrl: "https://api.pandadoc.com/public/v1"
  },
  sendgrid: {
    authMethods: {
      systemApiKey: {
        envVar: "SENDGRID_API_KEY",
        headerName: "Authorization",
        headerFormat: "Bearer {key}"
      }
    },
    baseUrl: "https://api.sendgrid.com/v3"
  },
  slack: {
    authMethods: {
      oauth: {
        scopes: ["channels:read", "chat:write", "users:read"]
      },
      systemApiKey: {
        envVar: "SLACK_API_KEY",
        headerName: "Authorization",
        headerFormat: "Bearer {key}"
      }
    },
    baseUrl: "https://slack.com/api"
  },
  xero: {
    authMethods: {
      oauth: {
        scopes: ["accounting.contacts.read", "offline_access"]
      },
      systemApiKey: {
        envVar: "XERO_API_KEY",
        headerName: "Authorization",
        headerFormat: "Bearer {key}"
      }
    },
    baseUrl: "https://api.xero.com/api.xro/2.0",
    headers: {
      "Accept": "application/json"
    }
  }
};

export function getProviderConfig(provider: string): ProviderConfig | undefined {
  return providers[provider.toLowerCase()];
}

export function hasSystemApiKey(provider: string): boolean {
  const config = getProviderConfig(provider);
  if (!config?.authMethods.systemApiKey) return false;
  
  const envVar = config.authMethods.systemApiKey.envVar;
  if (!envVar) return false;
  
  return !!process.env[envVar];
}

export function getSystemApiKey(provider: string): string | undefined {
  const config = getProviderConfig(provider);
  if (!config?.authMethods.systemApiKey) return undefined;
  
  const envVar = config.authMethods.systemApiKey.envVar;
  if (!envVar) return undefined;
  
  return process.env[envVar];
}

export function formatApiKeyHeader(provider: string, apiKey: string): Record<string, string> {
  const config = getProviderConfig(provider);
  if (!config?.authMethods.systemApiKey) {
    throw new Error(`No system API key configuration for provider: ${provider}`);
  }
  
  const { headerName, headerFormat = "{key}" } = config.authMethods.systemApiKey;
  const headerValue = headerFormat.replace("{key}", apiKey);
  
  return { [headerName]: headerValue };
}