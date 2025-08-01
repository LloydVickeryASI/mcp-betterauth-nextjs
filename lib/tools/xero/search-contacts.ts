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
  
  // Xero stores the tenant ID in the providerAccountId field
  const tenantId = account?.providerAccountId || account?.accountId;
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
    // Escape the query to prevent injection attacks
    // Double quotes need to be escaped as \" for Xero's where clause
    const searchQuery = query.trim().replace(/"/g, '\\"');
    // Xero requires null guards for optional fields
    queryParams.where = `(Name != null AND Name.Contains("${searchQuery}")) OR (EmailAddress != null AND EmailAddress.Contains("${searchQuery}"))`;
  }
  
  // Make the API call with Xero tenant header
  const response = await api.get(
    '/Contacts',
    'search_contacts',
    {
      query: queryParams,
      headers: {
        'Xero-Tenant-Id': tenantId
      },
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
      }, null, 2)
    }],
  };
}