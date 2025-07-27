import { z } from "zod";
import type { ToolContext } from "../register-tool";

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
  const hubspotAccount = context.db.prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?')
    .get(context.session.userId, 'hubspot');
  
  if (!hubspotAccount || !hubspotAccount.accessToken) {
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
    
    // Get error details
    const errorText = await response.text();
    let errorDetails;
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      errorDetails = errorText;
    }
    
    throw new Error(`HubSpot API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorDetails)}`);
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
};