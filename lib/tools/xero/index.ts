import { createProviderTool } from "../create-provider-tool";
import { searchContactsHandler, searchContactsSchema } from "./search-contacts";

export function registerXeroTools(server: any) {
  // Search contacts tool
  createProviderTool(server, {
    name: "search_xero_contacts",
    description: "Search Xero accounting contacts by name or email address",
    provider: "xero",
    schema: searchContactsSchema,
    handler: searchContactsHandler
  });
  
  // Add more Xero tools here as needed
}