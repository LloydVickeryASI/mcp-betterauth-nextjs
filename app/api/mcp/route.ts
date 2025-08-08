import { auth } from "@/lib/auth";
import { createMcpHandler } from "mcp-handler";
import { withMcpAuth } from "better-auth/plugins";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { registerTool } from "@/lib/tools/register-tool";
import { registerHubSpotTools } from "@/lib/tools/hubspot";
import { registerPandaDocTools } from "@/lib/tools/pandadoc";
import { registerXeroTools } from "@/lib/tools/xero";
import { isNoAuthMode, TEST_USER_EMAIL } from "@/lib/auth-mode";
import { logSystemApiKeyStatus } from "@/lib/providers/validate";
import { getUserById, getAccountByUserIdAndProvider, getUserByEmail, getSessionByUserId } from "@/lib/db-queries";
import { Pool } from "@neondatabase/serverless";
import { mcpLogger } from "@/lib/logger";

// Log system API key status on startup (only once)
let hasLoggedApiKeyStatus = false;
if (!hasLoggedApiKeyStatus && process.env.NODE_ENV === 'development') {
    logSystemApiKeyStatus();
    hasLoggedApiKeyStatus = true;
}

const mcpHandlerFunction = async (req: Request, session: any) => {
    // The session from withMcpAuth contains the MCP access token session
    mcpLogger.info(mcpLogger.fmt`MCP Request received from user ${session?.userId}`, {
        userId: session?.userId,
        clientId: session?.clientId,
        method: req.method,
        url: req.url,
    });
    
    // Create a trace for the entire MCP request
    return await Sentry.startSpan(
        {
            op: "mcp.request",
            name: "MCP Request Handler",
            attributes: {
                "mcp.session.user_id": session?.userId,
                "mcp.session.client_id": session?.clientId,
                "http.method": req.method,
                "http.url": req.url,
            }
        },
        async () => {
            // Wrap the entire MCP handler in a Sentry scope
            return await Sentry.withScope(async (scope) => {
        // Set user context for the entire MCP session
        if (session?.userId) {
            scope.setUser({ id: session.userId });
            scope.setContext("mcp_session", {
                userId: session.userId,
                clientId: session.clientId,
                scopes: session.scopes || [],
            });
        }
        
        return createMcpHandler(
            async (server) => {
                // Get database instance
                const db = auth.options.database as Pool;
                
                // Try to get user profile information
                let userProfile;
                try {
                    const user = await getUserById(db, session.userId);
                    if (user) {
                        userProfile = {
                            id: user.id,
                            email: user.email,
                            name: user.name,
                            image: user.image
                        };
                        
                        // Update Sentry user context with profile info
                        scope.setUser({
                            id: user.id,
                            email: user.email,
                            username: user.name,
                        });
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
            
            
            // Register test trace tool to diagnose Sentry
            registerTool(
                server,
                "test_sentry_trace",
                "Test Sentry trace capture",
                {},
                async () => {
                    // Log to console to verify tool is called
                    console.log("test_sentry_trace called");
                    
                    // Use the new startSpan API for Sentry v9
                    return await Sentry.startSpan(
                        {
                            op: "mcp.test",
                            name: "Test Sentry Trace",
                            attributes: {
                                "mcp.tool": "test_sentry_trace",
                                "test.type": "manual",
                            }
                        },
                        async (span) => {
                            // Add breadcrumb
                            Sentry.addBreadcrumb({
                                message: "Test trace started",
                                category: "test",
                                level: "info",
                                data: {
                                    tool: "test_sentry_trace",
                                    timestamp: new Date().toISOString()
                                }
                            });
                            
                            // Simulate some async work with a child span
                            await Sentry.startSpan(
                                {
                                    op: "test.operation",
                                    name: "Test async operation",
                                    attributes: {
                                        "operation.type": "sleep",
                                        "operation.duration": 100
                                    }
                                },
                                async () => {
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                }
                            );
                            
                            // Capture a test message
                            Sentry.captureMessage("Test trace message from MCP", "info");
                            
                            // Add another breadcrumb
                            Sentry.addBreadcrumb({
                                message: "Test trace completed",
                                category: "test",
                                level: "info",
                                data: {
                                    duration: 100,
                                    status: "success"
                                }
                            });
                            
                            return {
                                content: [{
                                    type: "text",
                                    text: "Test trace sent to Sentry. Check your Sentry dashboard for:\n" +
                                          "1. Transaction: 'Test Sentry Trace' with span 'Test async operation'\n" +
                                          "2. Message: 'Test trace message from MCP'\n" +
                                          "3. Breadcrumbs: 'Test trace started' and 'Test trace completed'\n" +
                                          "4. Trace should show up in Performance monitoring"
                                }],
                            };
                        }
                    );
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
                        const account = await getAccountByUserIdAndProvider(context.db, context.session.userId, 'microsoft');
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
            
            // Register OAuth-based tools
            registerHubSpotTools(server);
            registerPandaDocTools(server);
            registerXeroTools(server);
        },
        {
            capabilities: {
                tools: {
                    test_sentry_trace: {
                        description: "Test Sentry trace capture and logging",
                    },
                    list_pandadoc_documents: {
                        description: "List PandaDoc documents with optional status filter, pagination (count/page), and ordering",
                    },
                    get_auth_status: {
                        description: "Get authentication status with Microsoft profile information",
                    },
                    search_xero_contacts: {
                        description: "Search Xero accounting contacts by name or email address",
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
        }
    );
};

// Create the handler with conditional authentication
const handler = isNoAuthMode() 
    ? async (req: Request) => {
        // In no-auth mode, load the test user from the database
        const db = auth.options.database as Pool;
        
        // Add warning headers
        const response = new Response(null, { status: 200 });
        response.headers.set('X-No-Auth-Mode', 'true');
        response.headers.set('X-Test-User', TEST_USER_EMAIL);
        
        // Find the test user
        let user;
        try {
            user = await getUserByEmail(db, TEST_USER_EMAIL);
        } catch (error) {
            console.error('Database error fetching test user:', error);
            return new Response(
                JSON.stringify({ 
                    error: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}` 
                }), 
                { 
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
        if (!user) {
            return new Response(
                JSON.stringify({ 
                    error: `Test user ${TEST_USER_EMAIL} not found in database. Please ensure this user exists with active OAuth connections.` 
                }), 
                { 
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
        // Create a mock session similar to what withMcpAuth would provide
        const mockSession = {
            userId: user.id,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
            }
        };
        
        console.warn('🚨 NO_AUTH MODE: Auto-authenticating as', TEST_USER_EMAIL);
        
        // Call the handler with the mock session
        return mcpHandlerFunction(req, mockSession);
    }
    : withMcpAuth(auth, mcpHandlerFunction);

export { handler as GET, handler as POST, handler as DELETE };