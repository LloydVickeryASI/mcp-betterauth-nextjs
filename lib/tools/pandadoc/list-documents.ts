import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
import type { ProviderToolContext } from "../create-provider-tool";

export const listDocumentsSchema = {
  status: z.enum(["draft", "sent", "completed", "expired", "declined", "voided"])
    .optional()
    .describe("Filter documents by status"),
  count: z.number()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .describe("Number of documents to return (default: 20, max: 100)"),
  page: z.number()
    .min(1)
    .default(1)
    .optional()
    .describe("Page number for pagination (default: 1)"),
  order_by: z.enum(["name", "-name", "date_created", "-date_created", "date_modified", "-date_modified"])
    .optional()
    .describe("Sort order (prefix with - for descending)")
};

type ListDocumentsArgs = {
  status?: "draft" | "sent" | "completed" | "expired" | "declined" | "voided";
  count?: number;
  page?: number;
  order_by?: "name" | "-name" | "date_created" | "-date_created" | "date_modified" | "-date_modified";
};

export async function listDocumentsHandler(
  { status, count = 20, page = 1, order_by }: ListDocumentsArgs,
  context: ProviderToolContext
) {
  // Create API helper with context
  const api = new ProviderApiHelper(context);
  
  // Build query parameters
  const params: any = {
    count: count,
    page: page
  };
  
  if (status) {
    params.status = status;
  }
  
  if (order_by) {
    params.order_by = order_by;
  }
  
  // List documents using PandaDoc API
  const response = await api.get(
    '/documents',
    'list_documents',
    { 
      query: params,
      cache: {
        enabled: true,
        ttlMs: 300000 // 5 minute cache
      }
    }
  );
  
  // Format the response with relevant document information
  const formattedResults = response.data.results.map((doc: any) => ({
    id: doc.id,
    name: doc.name,
    status: doc.status,
    date_created: doc.date_created,
    date_modified: doc.date_modified,
    created_by: doc.created_by,
    recipients: doc.recipients
  }));
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        authenticated: true,
        results: formattedResults,
        total_count: response.data.count,
        page: page,
        page_size: count,
        total_pages: Math.ceil(response.data.count / count)
      }, null, 2)
    }],
  };
}