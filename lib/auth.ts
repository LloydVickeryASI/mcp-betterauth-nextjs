import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "@neondatabase/serverless";
import { getBaseUrl } from "./get-base-url";
import { OAUTH_SCOPES } from "./oauth-scopes";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
  }),
  baseURL: getBaseUrl(),
  trustHost: true, // Required for Vercel deployment (behind reverse proxy)
  emailAndPassword: {
    enabled: true
  },
  // Enable account linking so users can connect multiple OAuth providers
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["hubspot", "pandadoc", "xero"] // Trust these providers for linking
    }
  },
  // Force secure cookies in production for proper OAuth state handling
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/'
    }
  },
  socialProviders: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
      prompt: "select_account",
      scopes: [...OAUTH_SCOPES.microsoft],
      // Use static redirect URI for OAuth hub pattern
      redirectURI: process.env.AUTH_HUB_URL 
        ? `${process.env.AUTH_HUB_URL}/api/auth/callback/microsoft`
        : undefined,
      mapProfileToUser: async (profile) => {
        return {
          email: profile.email || profile.mail || profile.userPrincipalName || profile.upn || profile.preferred_username || "",
          name: profile.name || profile.displayName || `${profile.given_name || ""} ${profile.family_name || ""}`.trim() || "",
          image: profile.picture || null,
        };
      },
    },
  },
  plugins: [
    mcp({
      loginPage: "/sign-in",
    }),
    genericOAuth({
      config: [
        {
          providerId: "hubspot",
          clientId: process.env.HUBSPOT_CLIENT_ID!,
          clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
          authorizationUrl: "https://app.hubspot.com/oauth/authorize",
          tokenUrl: "https://api.hubapi.com/oauth/v1/token",
          userInfoUrl: "https://api.hubapi.com/oauth/v1/access-tokens",
          scopes: [...OAUTH_SCOPES.hubspot],
          accessType: "offline",
          authentication: "post" as const,
          getUserInfo: async (tokens) => {
            // Get access token info to retrieve user details
            const tokenInfoResponse = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${tokens.accessToken}`);
            
            if (!tokenInfoResponse.ok) {
              return null;
            }
            
            const tokenData = await tokenInfoResponse.json();
            
            // Get account info using the account API
            const accountResponse = await fetch(`https://api.hubapi.com/account-info/v3/details`, {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
              },
            });
            
            let accountData = null;
            if (accountResponse.ok) {
              accountData = await accountResponse.json();
            }
            
            return {
              id: tokenData.user_id.toString(),
              email: tokenData.user || accountData?.accountEmail || "",
              name: accountData?.accountName || tokenData.user || "",
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
        {
          providerId: "pandadoc",
          clientId: process.env.PANDADOC_CLIENT_ID!,
          clientSecret: process.env.PANDADOC_CLIENT_SECRET!,
          authorizationUrl: "https://app.pandadoc.com/oauth2/authorize",
          tokenUrl: "https://api.pandadoc.com/oauth2/access_token",
          scopes: [...OAUTH_SCOPES.pandadoc],
          accessType: "offline",
          authentication: "post" as const,
          getUserInfo: async (tokens) => {
            // Get current user info from PandaDoc API
            const userResponse = await fetch("https://api.pandadoc.com/public/v1/members/current", {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                "Content-Type": "application/json",
              },
            });
            
            if (!userResponse.ok) {
              return null;
            }
            
            const userData = await userResponse.json();
            
            return {
              id: userData.user_id || userData.membership_id,
              email: userData.email || "",
              name: `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || userData.email || "",
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
        {
          providerId: "xero",
          clientId: process.env.XERO_CLIENT_ID!,
          clientSecret: process.env.XERO_CLIENT_SECRET!,
          authorizationUrl: "https://login.xero.com/identity/connect/authorize?prompt=select_account",
          tokenUrl: "https://identity.xero.com/connect/token",
          scopes: [...OAUTH_SCOPES.xero],
          accessType: "offline",
          authentication: "basic" as const,
          getUserInfo: async (tokens) => {
            // First, try to get user info from the OpenID Connect endpoint
            let userEmail = "";
            let userName = "";
            
            try {
              const userInfoResponse = await fetch("https://identity.xero.com/connect/userinfo", {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              });
              
              if (userInfoResponse.ok) {
                const userInfo = await userInfoResponse.json();
                userEmail = userInfo.email || "";
                userName = userInfo.name || `${userInfo.given_name || ""} ${userInfo.family_name || ""}`.trim();
              }
            } catch (error) {
              console.error("Failed to fetch Xero user info:", error);
              // Continue with connections fetch even if user info fails
            }
            
            // Get the Xero connections to find the user's tenant
            let connectionsResponse;
            try {
              connectionsResponse = await fetch("https://api.xero.com/connections", {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                  "Content-Type": "application/json",
                },
              });
            } catch (error) {
              console.error("Failed to fetch Xero connections:", error);
              return null;
            }
            
            if (!connectionsResponse || !connectionsResponse.ok) {
              console.error("Xero connections request failed:", connectionsResponse?.status);
              return null;
            }
            
            let connections;
            try {
              connections = await connectionsResponse.json();
            } catch (error) {
              console.error("Failed to parse Xero connections response:", error);
              return null;
            }
            
            // TODO: For users with multiple Xero organizations, consider allowing tenant selection
            const primaryConnection = connections?.[0]; // Use the first connection as primary
            
            if (!primaryConnection) {
              console.error("No Xero connections found for user");
              return null;
            }
            
            return {
              id: primaryConnection.tenantId,
              email: userEmail || `xero-user-${primaryConnection.tenantId}@xero.local`, // Fallback email if OpenID doesn't provide one
              name: userName || primaryConnection.tenantName || "Xero User",
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              // Store tenant ID in providerAccountId for later use
              providerAccountId: primaryConnection.tenantId,
            };
          },
        },
      ],
    }),
    nextCookies(),
  ]
});