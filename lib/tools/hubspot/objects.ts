import { z } from "zod";
import { createProviderTool } from "../create-provider-tool";
import type { ProviderToolContext } from "../create-provider-tool";
import { ProviderApiHelper } from "../provider-api-helper";

// Supported objects (initially just deals). Expand incrementally.
const hubspotObjectEnum = z.enum([
  "deals",
]);

// Common types
const sortSchema = z.object({
  propertyName: z.string(),
  direction: z.enum(["ASC", "DESC"]).default("ASC"),
});

const filterSchema = z.object({
  propertyName: z.string(),
  operator: z.string(), // pass-through; HubSpot validates operators
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const filterGroupSchema = z.object({
  filters: z.array(filterSchema).min(1),
});

// Search tool schema
export const searchHubspotObjectsSchema = {
  object: hubspotObjectEnum.describe("HubSpot object to search (initially only 'deals')"),
  filters: z.array(filterSchema).optional().describe("AND filters for basic searches"),
  filterGroups: z.array(filterGroupSchema).optional().describe("Optional OR logic via multiple groups"),
  select: z.array(z.string()).optional().describe("Properties to return"),
  sorts: z.array(sortSchema).optional(),
  limit: z.number().min(1).max(100).default(25).optional(),
  after: z.string().optional().describe("Paging cursor"),
  includeArchived: z.boolean().optional().default(false),
};

type SearchArgs = {
  object: z.infer<typeof hubspotObjectEnum>;
  filters?: z.infer<typeof filterSchema>[];
  filterGroups?: z.infer<typeof filterGroupSchema>[];
  select?: string[];
  sorts?: z.infer<typeof sortSchema>[];
  limit?: number;
  after?: string;
  includeArchived?: boolean;
};

export async function searchHubspotObjectsHandler(
  args: SearchArgs,
  context: ProviderToolContext
) {
  const api = new ProviderApiHelper(context);
  const searchBody: any = {
    limit: args.limit ?? 25,
  };

  if (args.select?.length) {
    searchBody.properties = args.select;
  }
  if (args.sorts?.length) {
    searchBody.sorts = args.sorts.map(s => ({ propertyName: s.propertyName, direction: s.direction }));
  }
  if (args.filters?.length) {
    searchBody.filterGroups = [{ filters: args.filters }];
  }
  if (args.filterGroups?.length) {
    searchBody.filterGroups = args.filterGroups;
  }
  if (args.after) {
    searchBody.after = args.after;
  }
  if (typeof args.includeArchived === 'boolean') {
    searchBody.archived = args.includeArchived;
  }

  const response = await api.post(
    `/crm/v3/objects/${args.object}/search`,
    `search_${args.object}`,
    searchBody
  );

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        authenticated: true,
        object: args.object,
        total: (response as any)?.data?.total,
        results: (response as any)?.data?.results ?? [],
        paging: (response as any)?.data?.paging,
      }, null, 2)
    }],
  };
}

// CRUD tool schema
export const hubspotObjectsSchema = {
  action: z.enum(["get", "create", "update", "delete"]).describe("CRUD action to perform"),
  object: hubspotObjectEnum,
  id: z.string().optional().describe("Record ID (required for get/update/delete)"),
  properties: z.record(z.any()).optional().describe("Properties payload (create/update)"),
  select: z.array(z.string()).optional().describe("Properties to return for get"),
};

type CrudArgs = {
  action: "get" | "create" | "update" | "delete";
  object: z.infer<typeof hubspotObjectEnum>;
  id?: string;
  properties?: Record<string, any>;
  select?: string[];
};

export async function hubspotObjectsHandler(
  args: CrudArgs,
  context: ProviderToolContext
) {
  const api = new ProviderApiHelper(context);

  const basePath = `/crm/v3/objects/${args.object}`;

  if (args.action === "get") {
    if (!args.id) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "id is required for get" }, null, 2) }] };
    }
    const res = await api.get(`${basePath}/${args.id}`, `get_${args.object}`, {
      query: args.select?.length ? { properties: args.select.join(",") } : undefined,
    });
    return { content: [{ type: "text", text: JSON.stringify({ authenticated: true, object: args.object, result: (res as any).data }, null, 2) }] };
  }

  if (args.action === "create") {
    if (!args.properties || Object.keys(args.properties).length === 0) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "properties are required for create" }, null, 2) }] };
    }
    const res = await api.post(basePath, `create_${args.object}`, { properties: args.properties });
    return { content: [{ type: "text", text: JSON.stringify({ authenticated: true, object: args.object, result: (res as any).data }, null, 2) }] };
  }

  if (args.action === "update") {
    if (!args.id) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "id is required for update" }, null, 2) }] };
    }
    if (!args.properties || Object.keys(args.properties).length === 0) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "properties are required for update" }, null, 2) }] };
    }
    const res = await api.patch(`${basePath}/${args.id}`, `update_${args.object}`, { properties: args.properties });
    return { content: [{ type: "text", text: JSON.stringify({ authenticated: true, object: args.object, result: (res as any).data }, null, 2) }] };
  }

  if (args.action === "delete") {
    if (!args.id) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "id is required for delete" }, null, 2) }] };
    }
    const res = await api.delete(`${basePath}/${args.id}`, `delete_${args.object}`);
    return { content: [{ type: "text", text: JSON.stringify({ authenticated: true, object: args.object, id: args.id, deleted: true, raw: (res as any).data }, null, 2) }] };
  }

  return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "Unsupported action" }, null, 2) }] };
}

export function registerHubspotObjectsTools(server: any) {
  // Search tool (deals only for now)
  createProviderTool(server, {
    name: "search_hubspot_objects",
    description: "Search HubSpot objects (initially deals); supports filterGroups, select, sorts, paging",
    provider: "hubspot",
    schema: searchHubspotObjectsSchema,
    handler: searchHubspotObjectsHandler,
  });

  // CRUD tool (deals only for now)
  createProviderTool(server, {
    name: "hubspot_objects",
    description: "Perform CRUD operations on HubSpot objects (initially deals)",
    provider: "hubspot",
    schema: hubspotObjectsSchema,
    handler: hubspotObjectsHandler,
  });
}


