import { createProviderTool } from "../create-provider-tool";
import { searchContactsHandler, searchContactsSchema } from "./search-contacts-v2";

export function registerHubSpotTools(server: any) {
  // Search contacts tool
  createProviderTool(server, {
    name: "search_hubspot_contacts",
    description: "Search HubSpot contacts by email (exact match for full emails, partial match for fragments)",
    provider: "hubspot",
    schema: searchContactsSchema,
    handler: searchContactsHandler
  });
  
  // Example: Create contact tool (showing how simple it becomes)
  createProviderTool(server, {
    name: "create_hubspot_contact",
    description: "Create a new contact in HubSpot",
    provider: "hubspot",
    schema: {
      email: z.string().email().describe("Contact email address"),
      firstname: z.string().optional().describe("First name"),
      lastname: z.string().optional().describe("Last name"),
      company: z.string().optional().describe("Company name"),
    },
    handler: async ({ email, firstname, lastname, company }, context) => {
      const api = new ProviderApiHelper(context);
      
      const properties: any = { email };
      if (firstname) properties.firstname = firstname;
      if (lastname) properties.lastname = lastname;
      if (company) properties.company = company;
      
      const response = await api.post(
        '/objects/contacts',
        'create_contact',
        { properties }
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            contact: response.data
          }, null, 2)
        }],
      };
    }
  });
  
  // Example: Update contact tool
  createProviderTool(server, {
    name: "update_hubspot_contact", 
    description: "Update an existing HubSpot contact",
    provider: "hubspot",
    schema: {
      contactId: z.string().describe("HubSpot contact ID"),
      properties: z.object({
        email: z.string().email().optional(),
        firstname: z.string().optional(),
        lastname: z.string().optional(),
        company: z.string().optional(),
        phone: z.string().optional(),
      }).describe("Properties to update")
    },
    handler: async ({ contactId, properties }, context) => {
      const api = new ProviderApiHelper(context);
      
      const response = await api.patch(
        `/objects/contacts/${contactId}`,
        'update_contact',
        { properties }
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            contact: response.data
          }, null, 2)
        }],
      };
    }
  });
}

// Import for the ProviderApiHelper
import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";