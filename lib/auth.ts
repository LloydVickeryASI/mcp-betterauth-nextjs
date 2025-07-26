import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";

export const auth = betterAuth({
  database: {
    provider: "sqlite",
    url: "./dev.db"
  },
  emailAndPassword: {
    enabled: true
  },
  plugins: [
    mcp({
      loginPage: "/sign-in",
    }),
  ],
});