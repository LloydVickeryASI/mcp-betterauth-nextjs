import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
import type { ProviderToolContext } from "../create-provider-tool";
import { getAccountByUserIdAndProvider } from "@/lib/db-queries";
import { Pool } from "@neondatabase/serverless";

export const searchContactsSchema = {
  query: z.string().describe("The search query for contacts (name, email, or contact number)")
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
          message: "Please provide a search query for contacts"
        }, null, 2)
      }],
    };
  }
  
  // Create API helper with context
  const api = new ProviderApiHelper(context);
  
  // Get the tenant ID from the account
  const db = context.db as Pool;
  const account = await getAccountByUserIdAndProvider(db, context.session.userId, 'xero');
  
  // Xero stores the tenant ID in the account ID field
  const tenantId = account?.accountId;
  if (!tenantId) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: true,
          message: "No Xero tenant ID found. Please reconnect your Xero account."
        }, null, 2)
      }],
    };
  }
  
  // Build query parameters for Xero API
  const queryParams: Record<string, any> = {
    page: 1
  };
  
  // Add where clause if query is provided
  if (query.trim()) {
    // Escape quotes to prevent API errors
    const escapedQuery = query.trim().replace(/"/g, '\\"');
    queryParams.where = `Name.Contains("${escapedQuery}") OR EmailAddress.Contains("${escapedQuery}")`;
  }
  
  // Make the API call with Xero tenant header
  const response = await api.get(
    '/Contacts',
    'search_contacts',
    {
      query: queryParams,
      headers: {
        'xero-tenant-id': tenantId
      },
      cache: {
        enabled: true,
        ttlMs: 60000, // Cache for 1 minute
        key: `contacts:search:${query.trim().toLowerCase()}`
      }
    }
  );
  
  // Extract contacts from response
  const contacts = response.data.Contacts || [];
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        authenticated: true,
        results: contacts.map((contact: any) => ({
          contactId: contact.ContactID,
          name: contact.Name,
          emailAddress: contact.EmailAddress,
          firstName: contact.FirstName,
          lastName: contact.LastName,
          phones: contact.Phones,
          addresses: contact.Addresses,
          isSupplier: contact.IsSupplier,
          isCustomer: contact.IsCustomer,
          contactStatus: contact.ContactStatus
        })),
        total: contacts.length,
        cached: response.cached || false
      }, null, 2)
    }],
  };
}