import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
import type { ProviderToolContext } from "../create-provider-tool";

export const searchContactsSchema = {
  query: z.string().describe("The email address to search for (supports partial matches)")
};

export async function searchContactsHandler(
  { query }: { query: string }, 
  context: ProviderToolContext
) {
  // Validate query
  if (!query?.trim()) {
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
  
  // Create API helper with context
  const api = new ProviderApiHelper(context);
  
  // Determine search operator
  const isCompleteEmail = query.includes('@') && query.includes('.');
  
  // Make the API call
  const response = await api.post(
    '/objects/contacts/search',
    'search_contacts',
    {
      filterGroups: [{
        filters: [{
          propertyName: "email",
          operator: isCompleteEmail ? "EQ" : "CONTAINS_TOKEN",
          value: query.trim()
        }]
      }],
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
}