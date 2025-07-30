#!/usr/bin/env node

import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";
import { spawn } from "child_process";
import { TEST_USER_EMAIL } from "../lib/auth-mode.js";

// Initialize auth with same config as your app
const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }),
  basePath: "/api/auth",
  baseURL: process.env.AUTH_ISSUER || "http://localhost:3000",
});

async function getOrCreateTestToken() {
  // Check for existing test user
  const db = auth.options.database;
  const testUserResult = await db.query('SELECT * FROM "user" WHERE email = $1', [TEST_USER_EMAIL]);
  const testUser = testUserResult.rows[0];
  
  if (!testUser) {
    console.log(`No test user found. Please sign in with ${TEST_USER_EMAIL} first.`);
    process.exit(1);
  }

  // Get MCP session
  const sessionResult = await db.query(`
    SELECT "mcpAccessToken" 
    FROM session 
    WHERE "userId" = $1 
    ORDER BY "createdAt" DESC 
    LIMIT 1
  `, [testUser.id]);
  const session = sessionResult.rows[0];

  if (!session?.mcpAccessToken) {
    console.log("No MCP token found. Please authenticate via OAuth flow first.");
    process.exit(1);
  }

  return session.mcpAccessToken;
}

async function runMcpInspector(token, args) {
  const inspectorArgs = [
    "@modelcontextprotocol/inspector",
    "--cli",
    "http://localhost:3000/api/mcp",
    "--transport", "http",
    "--header", `Authorization: Bearer ${token}`,
    ...args
  ];

  const inspector = spawn("npx", inspectorArgs, {
    stdio: "inherit"
  });

  inspector.on("error", (err) => {
    console.error("Failed to start MCP Inspector:", err);
  });

  inspector.on("exit", (code) => {
    process.exit(code);
  });
}

// Main
(async () => {
  try {
    const token = await getOrCreateTestToken();
    const args = process.argv.slice(2);
    
    console.log("Running MCP Inspector with authenticated token...");
    await runMcpInspector(token, args);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
})();