import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" 
    ? window.location.origin 
    : (process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3000"),
  basePath: "/api/auth",
  plugins: [genericOAuthClient()],
});