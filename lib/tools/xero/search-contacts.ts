import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
import type { ProviderToolContext } from "../create-provider-tool";
import { getAccountByUserIdAndProvider } from "@/lib/db-queries";
import { Pool } from "@neondatabase/serverless";
import { getBaseUrl } from "@/lib/get-base-url";

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
  
  // Resolve a valid access token and tenant ID
  const db = context.db as Pool;
  const account = await getAccountByUserIdAndProvider(db, context.session.userId, 'xero');

  // Ensure we have an access token (refresh if needed)
  let accessToken = account?.accessToken as string | undefined;
  if (!accessToken) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: true, message: "No Xero access token found. Please reconnect your Xero account." }, null, 2)
      }],
    };
  }

  if (account?.accessTokenExpiresAt && new Date(account.accessTokenExpiresAt) <= new Date() && account?.refreshToken) {
    try {
      const refreshResponse = await fetch(`${getBaseUrl()}/api/auth/refresh/xero`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${context.session.token}`,
          'Content-Type': 'application/json',
        },
      });
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        accessToken = data.accessToken;
      }
    } catch {}
  }

  // Fetch tenant connections from Xero to determine the correct tenant ID
  let tenantId: string | undefined;
  try {
    const connectionsRes = await fetch('https://api.xero.com/connections', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    if (connectionsRes.ok) {
      const connections = await connectionsRes.json();
      tenantId = connections?.[0]?.tenantId;
    }
  } catch {}

  if (!tenantId) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: true,
          message: "No Xero tenant found for this user. Please reconnect your Xero account.",
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