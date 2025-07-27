import { auth } from "@/lib/auth";
import { createMcpHandler } from "mcp-handler";
import { withMcpAuth } from "better-auth/plugins";
import Database from "better-sqlite3";
import { z } from "zod";

const handler = withMcpAuth(auth, async (req, session) => {
    // The session from withMcpAuth contains the MCP access token session
    console.log("MCP Session:", JSON.stringify(session, null, 2));
    
    return createMcpHandler(
        (server) => {
            server.tool(
                "echo",
                "Echo back a string",
                {
                    message: z.string().describe("The message to echo back")
                },
                async ({ message }) => {
                    return {
                        content: [{ type: "text", text: `Echo: ${message}` }],
                    };
                },
            );
            
            server.tool(
                "search_hubspot_contacts",
                "Search HubSpot contacts by email",
                {
                    query: z.string().describe("The email address to search for (supports partial matches)")
                },
                async ({ query }) => {
                    try {
                        // Validate query
                        if (!query || query.trim() === '') {
                            return {
                                content: [{
                                    type: "text",
                                    text: JSON.stringify({
                                        error: true,
                                        message: "Please provide an email address to search for"
                                    }, null, 2)
                                }],
                            };
                        }
                        
                        // Check if user has HubSpot account linked
                        const db = auth.options.database as any;
                        const hubspotAccount = db.prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?').get(session.userId, 'hubspot');
                        
                        if (!hubspotAccount || !hubspotAccount.accessToken) {
                            // User needs to authenticate with HubSpot
                            const connectionsUrl = `${auth.options.baseURL}/connections`;
                            return {
                                content: [{
                                    type: "text",
                                    text: JSON.stringify({
                                        authenticated: false,
                                        message: "HubSpot account not connected. Please visit the connections page to link your HubSpot account.",
                                        connectionsUrl: connectionsUrl,
                                        provider: "hubspot"
                                    }, null, 2)
                                }],
                            };
                        }
                        
                        // Search contacts using HubSpot API
                        const searchUrl = "https://api.hubapi.com/crm/v3/objects/contacts/search";
                        
                        // Determine if query looks like a complete email
                        const isCompleteEmail = query.includes('@') && query.includes('.');
                        
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
                                                operator: isCompleteEmail ? "EQ" : "CONTAINS_TOKEN",
                                                value: query.trim()
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
                                const connectionsUrl = `${auth.options.baseURL}/connections`;
                                return {
                                    content: [{
                                        type: "text",
                                        text: JSON.stringify({
                                            authenticated: false,
                                            message: "HubSpot token expired. Please reconnect your HubSpot account on the connections page.",
                                            connectionsUrl: connectionsUrl,
                                            provider: "hubspot"
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
                "list_pandadoc_documents",
                "List documents from PandaDoc",
                {
                    status: z.enum(["draft", "sent", "completed", "expired", "declined", "voided"]).optional().describe("Filter documents by status"),
                    count: z.number().min(1).max(100).default(20).optional().describe("Number of documents to return (default: 20, max: 100)"),
                    page: z.number().min(1).default(1).optional().describe("Page number for pagination (default: 1)"),
                    order_by: z.enum(["name", "-name", "date_created", "-date_created", "date_modified", "-date_modified"]).optional().describe("Sort order (prefix with - for descending)")
                },
                async ({ status, count = 20, page = 1, order_by }) => {
                    try {
                        // Check if user has PandaDoc account linked
                        const db = auth.options.database as any;
                        const pandadocAccount = db.prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?').get(session.userId, 'pandadoc');
                        
                        if (!pandadocAccount || !pandadocAccount.accessToken) {
                            // User needs to authenticate with PandaDoc
                            const connectionsUrl = `${auth.options.baseURL}/connections`;
                            return {
                                content: [{
                                    type: "text",
                                    text: JSON.stringify({
                                        authenticated: false,
                                        message: "PandaDoc account not connected. Please visit the connections page to link your PandaDoc account.",
                                        connectionsUrl: connectionsUrl,
                                        provider: "pandadoc"
                                    }, null, 2)
                                }],
                            };
                        }
                        
                        // Build query parameters
                        const params = new URLSearchParams({
                            count: count.toString(),
                            page: page.toString()
                        });
                        
                        if (status) {
                            params.append('status', status);
                        }
                        
                        if (order_by) {
                            params.append('order_by', order_by);
                        }
                        
                        // List documents using PandaDoc API
                        const response = await fetch(`https://api.pandadoc.com/public/v1/documents?${params.toString()}`, {
                            headers: {
                                "Authorization": `Bearer ${pandadocAccount.accessToken}`,
                                "Content-Type": "application/json"
                            }
                        });
                        
                        if (!response.ok) {
                            // Token might be expired, provide auth URL
                            if (response.status === 401) {
                                const connectionsUrl = `${auth.options.baseURL}/connections`;
                                return {
                                    content: [{
                                        type: "text",
                                        text: JSON.stringify({
                                            authenticated: false,
                                            message: "PandaDoc token expired. Please reconnect your PandaDoc account on the connections page.",
                                            connectionsUrl: connectionsUrl,
                                            provider: "pandadoc"
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
                                        message: `PandaDoc API error: ${response.status} ${response.statusText}`
                                    }, null, 2)
                                }],
                            };
                        }
                        
                        const data = await response.json();
                        
                        // Format the response with relevant document information
                        const formattedResults = data.results.map((doc: any) => ({
                            id: doc.id,
                            name: doc.name,
                            status: doc.status,
                            date_created: doc.date_created,
                            date_modified: doc.date_modified,
                            created_by: doc.created_by,
                            recipients: doc.recipients
                        }));
                        
                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify({
                                    authenticated: true,
                                    results: formattedResults,
                                    total_count: data.count,
                                    page: page,
                                    page_size: count,
                                    total_pages: Math.ceil(data.count / count)
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