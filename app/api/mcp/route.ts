import { auth } from "@/lib/auth";
import { createMcpHandler } from "mcp-handler";
import { withMcpAuth } from "better-auth/plugins";
import { z } from "zod";
import { registerTool } from "@/lib/tools/register-tool";
import { registerHubSpotTools } from "@/lib/tools/hubspot";
import { registerPandaDocTools } from "@/lib/tools/pandadoc";

const handler = withMcpAuth(auth, async (req, session) => {
    // The session from withMcpAuth contains the MCP access token session
    console.log("MCP Session:", JSON.stringify(session, null, 2));
    
    return createMcpHandler(
        (server) => {
            // Get database instance
            const db = auth.options.database as any;
            
            // Try to get user profile information
            let userProfile;
            try {
                const user = db.prepare('SELECT * FROM user WHERE id = ?').get(session.userId);
                if (user) {
                    userProfile = {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        image: user.image
                    };
                }
            } catch (error) {
                console.error("Error fetching user profile:", error);
            }
            
            // Store context in server for tools to access
            (server as any).context = {
                session,
                db,
                auth,
                userProfile
            };
            
            // Register simple echo tool
            registerTool(
                server,
                "echo",
                "Echo back a string",
                {
                    message: z.string().describe("The message to echo back")
                },
                async ({ message }) => {
                    return {
                        content: [{ type: "text", text: `Echo: ${message}` }],
                    };
                }
            );
            
            // Register auth status tool
            registerTool(
                server,
                "get_auth_status",
                "Get authentication status with user profile",
                {},
                async (_, context) => {
                    // Display all available session information
                    const sessionInfo: any = {
                        authenticated: true,
                        mcpSession: context.session,
                        provider: "Microsoft"
                    };

                    if (context.userProfile) {
                        sessionInfo.userProfile = context.userProfile;
                    }
                    
                    // Also try to get the account information for Microsoft provider details
                    try {
                        const account = context.db.prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?')
                            .get(context.session.userId, 'microsoft');
                        if (account) {
                            sessionInfo.providerAccount = {
                                providerId: account.providerId,
                                accountId: account.accountId,
                                createdAt: account.createdAt
                            };
                        }
                    } catch (error) {
                        console.error("Error fetching account data:", error);
                    }

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(sessionInfo, null, 2)
                        }],
                    };
                }
            );
            
            // Register integration-specific tools
            registerHubSpotTools(server);
            registerPandaDocTools(server);
        },
        {
            capabilities: {
                tools: {
                    echo: {
                        description: "Echo a message",
                    },
                    search_hubspot_contacts: {
                        description: "Search HubSpot contacts by email (exact match for full emails, partial match for fragments)",
                    },
                    list_pandadoc_documents: {
                        description: "List PandaDoc documents with optional status filter, pagination (count/page), and ordering",
                    },
                    get_auth_status: {
                        description: "Get authentication status with Microsoft profile information",
                    },
                },
            },
        },
        {
            // redisUrl: process.env.REDIS_URL,
            basePath: "/api",
            verboseLogs: true,            
            maxDuration: 60,
        },
    )(req);
});

export { handler as GET, handler as POST, handler as DELETE };