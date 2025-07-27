import { z } from "zod";
import { createProviderTool } from "../create-provider-tool";
import { ProviderApiHelper } from "../provider-api-helper";

/**
 * Example showing how to create multiple HubSpot tools with minimal boilerplate
 * Each tool focuses purely on its business logic
 */

export function registerAdditionalHubSpotTools(server: any) {
  // List companies
  createProviderTool(server, {
    name: "list_hubspot_companies",
    description: "List companies in HubSpot with optional filters",
    provider: "hubspot",
    schema: {
      limit: z.number().min(1).max(100).default(10).optional(),
      properties: z.array(z.string()).optional().describe("Properties to include in response"),
      after: z.string().optional().describe("Pagination cursor")
    },
    handler: async ({ limit = 10, properties, after }, context) => {
      const api = new ProviderApiHelper(context);
      
      const params: any = { limit };
      if (properties?.length) params.properties = properties.join(',');
      if (after) params.after = after;
      
      const response = await api.get(
        '/objects/companies',
        'list_companies',
        { 
          query: params,
          cache: { enabled: true, ttlMs: 300000 } // 5 minute cache
        }
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            companies: response.data.results,
            paging: response.data.paging
          }, null, 2)
        }]
      };
    }
  });

  // Get contact by ID
  createProviderTool(server, {
    name: "get_hubspot_contact",
    description: "Get a specific contact by ID",
    provider: "hubspot",
    schema: {
      contactId: z.string().describe("HubSpot contact ID"),
      properties: z.array(z.string()).optional().describe("Properties to include")
    },
    handler: async ({ contactId, properties }, context) => {
      const api = new ProviderApiHelper(context);
      
      const params: any = {};
      if (properties?.length) params.properties = properties.join(',');
      
      const response = await api.get(
        `/objects/contacts/${contactId}`,
        'get_contact',
        { query: params }
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }]
      };
    }
  });

  // Create deal
  createProviderTool(server, {
    name: "create_hubspot_deal",
    description: "Create a new deal in HubSpot",
    provider: "hubspot",
    schema: {
      dealname: z.string().describe("Deal name"),
      amount: z.number().optional().describe("Deal amount"),
      pipeline: z.string().optional().describe("Pipeline ID"),
      dealstage: z.string().optional().describe("Deal stage ID"),
      closedate: z.string().optional().describe("Expected close date (ISO format)"),
      associations: z.object({
        contacts: z.array(z.string()).optional(),
        companies: z.array(z.string()).optional()
      }).optional().describe("Associated records")
    },
    handler: async ({ dealname, amount, pipeline, dealstage, closedate, associations }, context) => {
      const api = new ProviderApiHelper(context);
      
      const properties: any = { dealname };
      if (amount !== undefined) properties.amount = amount;
      if (pipeline) properties.pipeline = pipeline;
      if (dealstage) properties.dealstage = dealstage;
      if (closedate) properties.closedate = closedate;
      
      const body: any = { properties };
      if (associations) body.associations = associations;
      
      const response = await api.post(
        '/objects/deals',
        'create_deal',
        body
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            deal: response.data
          }, null, 2)
        }]
      };
    }
  });

  // Search deals
  createProviderTool(server, {
    name: "search_hubspot_deals",
    description: "Search for deals with flexible filters",
    provider: "hubspot",
    schema: {
      filters: z.array(z.object({
        propertyName: z.string(),
        operator: z.enum(["EQ", "NEQ", "LT", "LTE", "GT", "GTE", "CONTAINS_TOKEN", "NOT_CONTAINS_TOKEN"]),
        value: z.union([z.string(), z.number()])
      })).describe("Search filters"),
      properties: z.array(z.string()).optional(),
      limit: z.number().min(1).max(100).default(10).optional(),
      sorts: z.array(z.object({
        propertyName: z.string(),
        direction: z.enum(["ASCENDING", "DESCENDING"])
      })).optional()
    },
    handler: async ({ filters, properties, limit = 10, sorts }, context) => {
      const api = new ProviderApiHelper(context);
      
      const body: any = {
        filterGroups: [{ filters }],
        limit
      };
      
      if (properties?.length) body.properties = properties;
      if (sorts?.length) body.sorts = sorts;
      
      const response = await api.post(
        '/objects/deals/search',
        'search_deals',
        body,
        {
          cache: {
            enabled: true,
            ttlMs: 60000,
            key: `deals:search:${JSON.stringify(filters)}`
          }
        }
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            results: response.data.results,
            total: response.data.total
          }, null, 2)
        }]
      };
    }
  });

  // Get contact activities
  createProviderTool(server, {
    name: "get_hubspot_contact_activities",
    description: "Get timeline activities for a contact",
    provider: "hubspot",
    schema: {
      contactId: z.string().describe("HubSpot contact ID"),
      activityTypes: z.array(z.string()).optional().describe("Filter by activity types"),
      limit: z.number().min(1).max(100).default(20).optional()
    },
    handler: async ({ contactId, activityTypes, limit = 20 }, context) => {
      const api = new ProviderApiHelper(context);
      
      const params: any = {
        limit,
        objectType: 'contact',
        objectId: contactId
      };
      
      if (activityTypes?.length) {
        params.activityTypes = activityTypes.join(',');
      }
      
      const response = await api.get(
        '/timeline/events',
        'get_contact_activities',
        { query: params }
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            activities: response.data.results,
            hasMore: response.data.hasMore
          }, null, 2)
        }]
      };
    }
  });
}