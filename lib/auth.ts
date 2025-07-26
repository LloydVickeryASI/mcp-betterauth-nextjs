import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";
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
    nextCookies(),
  ]
});