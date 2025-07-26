import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";

export const auth = betterAuth({
  database: new Database("./sqlite.db"),
  basePath: "/api/auth",
  baseURL: process.env.AUTH_ISSUER || "http://localhost:3000",
  emailAndPassword: {
    enabled: true
  },
  socialProviders: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
      prompt: "select_account",
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
          scopes: ["crm.objects.contacts.read"],
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
      ],
    }),
    nextCookies(),
  ]
});