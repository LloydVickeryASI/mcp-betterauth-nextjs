import { z } from "zod";
import type { ToolContext } from "../register-tool";
import { apiClient, ApiError, ApiErrorCode, isProviderConnected } from "@/lib/external-api-helpers";

export const searchContactsSchema = {
  query: z.string().describe("The email address to search for (supports partial matches)")
};

export const searchContactsHandler = async ({ query }: { query: string }, context: ToolContext) => {
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
  const isConnected = await isProviderConnected(context.session.userId, 'hubspot');
  
  if (!isConnected) {
    // User needs to authenticate with HubSpot
    const connectionsUrl = `${context.auth.options.baseURL}/connections`;
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
  
  try {
    // Determine if query looks like a complete email
    const isCompleteEmail = query.includes('@') && query.includes('.');
    
    // Use the unified API client
    const response = await apiClient.post(
      'hubspot',
      context.session.userId,
      '/crm/v3/objects/contacts/search',
      'search_contacts',
      {
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
      },
      {
        cache: {
          enabled: true,
          ttlMs: 60000, // Cache for 1 minute
          key: `contacts:search:${query.trim().toLowerCase()}`
        }
      }
    );
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          authenticated: true,
          results: response.data.results,
          total: response.data.total,
          cached: response.cached || false
        }, null, 2)
      }],
    };
  } catch (error) {
    // Handle specific error cases
    if (error instanceof ApiError) {
      if (error.code === ApiErrorCode.UNAUTHORIZED || error.code === ApiErrorCode.TOKEN_EXPIRED) {
        const connectionsUrl = `${context.auth.options.baseURL}/connections`;
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
      
      // Re-throw other API errors to be handled by the error handler
      throw error;
    }
    
    // Re-throw unexpected errors
    throw error;
  }
};