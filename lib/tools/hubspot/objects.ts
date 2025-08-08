import { z } from "zod";
import { createProviderTool } from "../create-provider-tool";
import type { ProviderToolContext } from "../create-provider-tool";
import { ProviderApiHelper } from "../provider-api-helper";

// Supported objects (expanded)
const hubspotObjectEnum = z.enum([
  "deals",
  "contacts",
  "companies",
  "invoices",
  "tickets",
]).describe("HubSpot CRM object. Supported: deals, contacts, companies, invoices, tickets");

// Common types
const sortSchema = z.object({
  propertyName: z.string().describe("Property to sort by (e.g., createdate)"),
  direction: z.enum(["ASCENDING", "DESCENDING"]).default("ASCENDING").describe("Sort direction"),
});

const filterSchema = z.object({
  propertyName: z.string().describe("Property name (e.g., email, dealname, domain)"),
  operator: z.string().describe("HubSpot operator (e.g., EQ, CONTAINS_TOKEN, IN, GTE, LTE, HAS_PROPERTY)"),
  value: z.union([z.string(), z.number(), z.boolean()]).describe("Comparison value"),
}).describe("Single filter (AND within the same group)");

const filterGroupSchema = z.object({
  filters: z.array(filterSchema).min(1).describe("Filters combined with AND"),
}).describe("Group of filters; multiple groups are OR'ed together");

// Search tool schema
export const searchHubspotObjectsSchema = {
  object: hubspotObjectEnum.describe("Which object to search"),
  filters: z
    .array(filterSchema)
    .optional()
    .describe("Basic AND filters. If both filters and filterGroups are provided, filterGroups take precedence."),
  filterGroups: z
    .array(filterGroupSchema)
    .optional()
    .describe("Advanced OR logic: multiple groups are OR'ed. Overrides 'filters' if provided."),
  select: z
    .array(z.string())
    .optional()
    .describe("Properties to return. If omitted, sensible defaults are used per object."),
  sorts: z
    .array(z.union([sortSchema, z.string()]))
    .optional()
    .describe("Sort order(s). Accepts objects or shorthand strings like '-createdate' or 'createdate'."),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(25)
    .optional()
    .describe("Max results per page (1-100)"),
  after: z.string().optional().describe("Paging cursor (use value from previous response.paging.next.after)"),
  includeArchived: z.boolean().optional().default(false).describe("Include archived records"),
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

  const defaultSelectByObject: Record<string, string[]> = {
    deals: ["dealname", "amount", "dealstage", "createdate"],
    contacts: ["firstname", "lastname", "email", "phone"],
    companies: ["name", "domain", "city"],
    invoices: ["hs_invoice_number", "hs_invoice_status", "amount_to_collect", "hs_createdate"],
    tickets: ["subject", "hs_pipeline", "hs_ticket_priority", "createdate"],
  };

  if (args.select?.length) {
    searchBody.properties = args.select;
  } else {
    searchBody.properties = defaultSelectByObject[args.object] ?? undefined;
  }
  if (args.sorts?.length) {
    searchBody.sorts = args.sorts.map((s: any) => {
      if (typeof s === "string") {
        const isDesc = s.startsWith("-");
        const prop = isDesc ? s.slice(1) : s;
        return { propertyName: prop, direction: isDesc ? "DESCENDING" : "ASCENDING" };
      }
      const dir = s.direction === "ASC" ? "ASCENDING" : s.direction === "DESC" ? "DESCENDING" : s.direction;
      return { propertyName: s.propertyName, direction: dir };
    });
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

// Allowed association targets per from-object
const associationTargetsByFrom: Record<z.infer<typeof hubspotObjectEnum>, string[]> = {
  deals: ["companies", "contacts", "tickets"],
  companies: ["contacts", "deals", "tickets", "invoices"],
  contacts: ["companies", "deals", "tickets", "invoices"],
  invoices: ["deals", "companies", "contacts"],
  tickets: ["contacts", "companies", "deals"],
};

const makeTargetsEnum = (from: z.infer<typeof hubspotObjectEnum>) => z.enum(associationTargetsByFrom[from] as [string, ...string[]]);

// CRUD tool schema
export const hubspotObjectsSchema = {
  action: z.enum(["get", "create", "update", "delete"]).describe("CRUD action to perform"),
  object: hubspotObjectEnum,
  id: z.string().optional().describe("Record ID (required for get/update/delete)"),
  properties: z.record(z.any()).optional().describe("Properties payload (create/update)"),
  select: z.array(z.string()).optional().describe("Properties to return for get"),
  associations: z
    .array(
      z.object({
        toObject: z.string().describe("Target object to associate with"),
        toIds: z.array(z.string()).min(1).describe("IDs of target records to associate"),
        type: z.string().optional().describe("Optional association type label; defaults to '<from>_to_<to>'"),
        typeId: z.number().optional().describe("Optional association typeId override"),
        mode: z.enum(["append", "delete", "replace"]).optional().default("append"),
      })
    )
    .optional()
    .describe("Manage associations after create/update"),
};

type CrudArgs = {
  action: "get" | "create" | "update" | "delete";
  object: z.infer<typeof hubspotObjectEnum>;
  id?: string;
  properties?: Record<string, any>;
  select?: string[];
  associations?: { toObject: string; toIds: string[]; type?: string; typeId?: number; mode?: "append"|"delete"|"replace" }[];
};

export async function hubspotObjectsHandler(
  args: CrudArgs,
  context: ProviderToolContext
) {
  const api = new ProviderApiHelper(context);

  const basePath = `/crm/v3/objects/${args.object}`;

  const singularize = (plural: string) => {
    if (plural === "deals") return "deal";
    if (plural === "companies") return "company";
    if (plural === "contacts") return "contact";
    return plural.replace(/s$/, "");
  };

  const ensureValidTargets = (from: string, to: string) => {
    const allowed = associationTargetsByFrom[from as keyof typeof associationTargetsByFrom] || [];
    if (!allowed.includes(to)) {
      throw new Error(`Associations from ${from} to ${to} not supported. Allowed: ${allowed.join(", ")}`);
    }
  };

  const manageAssociations = async (fromObject: string, fromId: string) => {
    const requested = args.associations?.filter(a => a.toIds?.length);
    if (!requested || requested.length === 0) return undefined;
    const results: any[] = [];
    for (const assoc of requested) {
      const toObject = assoc.toObject;
      ensureValidTargets(fromObject, toObject);
      const type = assoc.type ?? `${singularize(fromObject)}_to_${singularize(toObject)}`;
      const inputs = assoc.toIds.map(toId => ({ from: { id: fromId }, to: { id: toId }, type, typeId: assoc.typeId }));
      if (assoc.mode === "delete") {
        const res = await api.post(
          `/crm/v4/associations/${fromObject}/${toObject}/batch/archive`,
          `disassociate_${fromObject}_to_${toObject}`,
          { inputs }
        );
        results.push({ toObject, mode: "delete", count: inputs.length, raw: (res as any).data });
      } else if (assoc.mode === "replace") {
        // Read current
        const current = await api.post(
          `/crm/v4/associations/${fromObject}/${toObject}/batch/read`,
          `read_assoc_${fromObject}_${toObject}`,
          { inputs: [{ id: fromId }] }
        );
        const currentIds: string[] = (((current as any).data?.results?.[0]?.to || []).map((t: any) => String(t.id))) || [];
        const desired = new Set(assoc.toIds.map(String));
        const toCreate = currentIds.length ? assoc.toIds.filter(id => !currentIds.includes(String(id))) : assoc.toIds;
        const toDelete = currentIds.filter(id => !desired.has(String(id)));
        if (toCreate.length) {
          const resCreate = await api.post(
            `/crm/v4/associations/${fromObject}/${toObject}/batch/create`,
            `associate_${fromObject}_to_${toObject}`,
            { inputs: toCreate.map(id => ({ from: { id: fromId }, to: { id }, type, typeId: assoc.typeId })) }
          );
          results.push({ toObject, mode: "replace", created: toCreate.length, rawCreate: (resCreate as any).data });
        }
        if (toDelete.length) {
          const resDelete = await api.post(
            `/crm/v4/associations/${fromObject}/${toObject}/batch/archive`,
            `disassociate_${fromObject}_to_${toObject}`,
            { inputs: toDelete.map(id => ({ from: { id: fromId }, to: { id }, type, typeId: assoc.typeId })) }
          );
          results.push({ toObject, mode: "replace", deleted: toDelete.length, rawDelete: (resDelete as any).data });
        }
      } else {
        const res = await api.post(
          `/crm/v4/associations/${fromObject}/${toObject}/batch/create`,
          `associate_${fromObject}_to_${toObject}`,
          { inputs }
        );
        results.push({ toObject, mode: "append", count: inputs.length, raw: (res as any).data });
      }
    }
    return results;
  };

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
    const created = (res as any).data;
    let assocResults: any | undefined;
    if (created?.id && args.associations && args.associations.length) {
      assocResults = await manageAssociations(args.object, created.id);
    }
    return { content: [{ type: "text", text: JSON.stringify({ authenticated: true, object: args.object, result: created, associations: assocResults }, null, 2) }] };
  }

  if (args.action === "update") {
    if (!args.id) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "id is required for update" }, null, 2) }] };
    }
    if (!args.properties || Object.keys(args.properties).length === 0) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "properties are required for update" }, null, 2) }] };
    }
    const res = await api.patch(`${basePath}/${args.id}`, `update_${args.object}`, { properties: args.properties });
    const updated = (res as any).data;
    let assocResults: any | undefined;
    if (args.associations && args.associations.length) {
      assocResults = await manageAssociations(args.object, args.id);
    }
    return { content: [{ type: "text", text: JSON.stringify({ authenticated: true, object: args.object, result: updated, associations: assocResults }, null, 2) }] };
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


