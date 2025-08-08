import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
import type { ProviderToolContext } from "../create-provider-tool";

export const listTemplatesSchema = {
  folder_id: z.string()
    .optional()
    .describe("Filter templates by folder ID (optional)")
};

type ListTemplatesArgs = {
  folder_id?: string;
};

export async function listTemplatesHandler(
  { folder_id }: ListTemplatesArgs,
  context: ProviderToolContext
) {
  // Create API helper with context
  const api = new ProviderApiHelper(context);
  
  // Build query parameters
  const params: any = {};
  
  if (folder_id) {
    params.folder_uuid = folder_id;
  }
  
  // List templates using PandaDoc API
  const response = await api.get(
    '/templates',
    'list_templates',
    { 
      query: params
    }
  );
  
  // Format the response with relevant template information
  const formattedResults = response.data.results.map((template: any) => ({
    id: template.id,
    name: template.name,
    date_created: template.date_created,
    date_modified: template.date_modified,
    folder_name: template.folder_name
  }));
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        authenticated: true,
        templates: formattedResults,
        total_count: response.data.count
      }, null, 2)
    }],
  };
}