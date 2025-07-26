import { auth } from "@/lib/auth";
import { createMcpHandler } from "mcp-handler";
import { withMcpAuth } from "better-auth/plugins";
import Database from "better-sqlite3";

const handler = withMcpAuth(auth, async (req, session) => {
    // The session from withMcpAuth contains the MCP access token session
    console.log("MCP Session:", JSON.stringify(session, null, 2));
    
    return createMcpHandler(
        (server) => {
            server.tool(
                "echo",
                "Echo back a string",
                {
                    message: {
                        type: "string",
                        description: "The message to echo back"
                    }
                },
                async ({ message }) => {
                    return {
                        content: [{ type: "text", text: `Echo: ${message}` }],
                    };
                },
            );
            
            server.tool(
                "search_hubspot_contacts",
                "Search HubSpot contacts by exact email address",
                {
                    query: {
                        type: "string",
                        description: "The exact email address to search for"
                    }
                },
                async ({ query }) => {
                    try {
                        // Check if user has HubSpot account linked
                        const db = auth.options.database as any;
                        const hubspotAccount = db.prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?').get(session.userId, 'hubspot');
                        
                        if (!hubspotAccount || !hubspotAccount.accessToken) {
                            // User needs to authenticate with HubSpot
                            const authUrl = `${auth.options.baseURL}/sign-in`;
                            return {
                                content: [{
                                    type: "text",
                                    text: JSON.stringify({
                                        authenticated: false,
                                        message: "You need to authenticate with HubSpot first. Please visit the sign-in page and click 'Continue with HubSpot'",
                                        authUrl: authUrl
                                    }, null, 2)
                                }],
                            };
                        }
                        
                        // Search contacts using HubSpot API
                        const searchUrl = "https://api.hubapi.com/crm/v3/objects/contacts/search";
                        const response = await fetch(searchUrl, {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${hubspotAccount.accessToken}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                filterGroups: [
                                    {
                                        filters: [
                                            {
                                                propertyName: "email",
                                                operator: "EQ",
                                                value: query
                                            }
                                        ]
                                    }
                                ],
                                properties: ["firstname", "lastname", "email", "phone", "company"],
                                limit: 10
                            })
                        });
                        
                        if (!response.ok) {
                            // Token might be expired, provide auth URL
                            if (response.status === 401) {
                                const authUrl = `${auth.options.baseURL}/sign-in`;
                                return {
                                    content: [{
                                        type: "text",
                                        text: JSON.stringify({
                                            authenticated: false,
                                            message: "HubSpot token expired. Please re-authenticate by visiting the sign-in page and clicking 'Continue with HubSpot'",
                                            authUrl: authUrl
                                        }, null, 2)
                                    }],
                                };
                            }
                            
                            // Get error details
                            const errorText = await response.text();
                            let errorDetails;
                            try {
                                errorDetails = JSON.parse(errorText);
                            } catch {
                                errorDetails = errorText;
                            }
                            
                            return {
                                content: [{
                                    type: "text",
                                    text: JSON.stringify({
                                        error: true,
                                        status: response.status,
                                        statusText: response.statusText,
                                        details: errorDetails,
                                        message: `HubSpot API error: ${response.status} ${response.statusText}`
                                    }, null, 2)
                                }],
                            };
                        }
                        
                        const data = await response.json();
                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify({
                                    authenticated: true,
                                    results: data.results,
                                    total: data.total
                                }, null, 2)
                            }],
                        };
                        
                    } catch (error) {
                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify({
                                    error: true,
                                    message: error instanceof Error ? error.message : "Unknown error occurred"
                                }, null, 2)
                            }],
                        };
                    }
                },
            );
            
            server.tool(
                "get_auth_status",
                "Get authentication status with user profile",
                {},
                async () => {
                    // Display all available session information
                    const sessionInfo: any = {
                        authenticated: true,
                        mcpSession: session,
                        provider: "Microsoft"
                    };

                    // Try to get user info using the userId from MCP session
                    try {
                        // Query the database directly for user information
                        const db = auth.options.database as any;
                        const user = db.prepare('SELECT * FROM user WHERE id = ?').get(session.userId);
                        
                        if (user) {
                            sessionInfo.userProfile = {
                                id: user.id,
                                email: user.email,
                                name: user.name,
                                image: user.image,
                                emailVerified: user.emailVerified,
                                createdAt: user.createdAt,
                                updatedAt: user.updatedAt
                            };
                        }
                        
                        // Also try to get the account information for Microsoft provider details
                        const account = db.prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?').get(session.userId, 'microsoft');
                        if (account) {
                            sessionInfo.providerAccount = {
                                providerId: account.providerId,
                                accountId: account.accountId,
                                createdAt: account.createdAt
                            };
                        }
                    } catch (error) {
                        console.error("Error fetching user data:", error);
                    }

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(sessionInfo, null, 2)
                        }],
                    };
                },
            );
        },
        {
            capabilities: {
                tools: {
                    echo: {
                        description: "Echo a message",
                    },
                    search_hubspot_contacts: {
                        description: "Search HubSpot contacts by exact email address",
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


// import { auth } from "@/lib/auth";
// import { createMcpHandler } from "mcp-handler";
// import { withMcpAuth } from "better-auth/plugins";
// import { z } from "zod";

// const handler = withMcpAuth(auth, (req, session) => {
//     // session contains the access token record with scopes and user ID
//     return createMcpHandler(
//         (server) => {
//             server.tool(
//                 "roll_dice",
//                 "Rolls an N-sided die",
//                 { sides: z.number().int().min(2) },
//                 async ({ sides }) => ({
//                     content: [{ type: "text", text: `You rolled a ${1 + Math.floor(Math.random()*sides)}!` }],
//                 }),
//             );
//         },
//         {},
//         { basePath: "/api" },
//     )(req);
// });

// export { handler as GET, handler as POST, handler as DELETE };