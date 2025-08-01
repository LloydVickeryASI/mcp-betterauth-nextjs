import { createProviderTool } from "../create-provider-tool";
import { searchContactsHandler, searchContactsSchema } from "./search-contacts";
import { createSearchNotesWithAttachmentsTool } from "./search-notes-with-attachments";

export function registerHubSpotTools(server: any) {
  // Search contacts tool
  createProviderTool(server, {
    name: "search_hubspot_contacts",
    description: "Search HubSpot contacts by email (exact match for full emails, partial match for fragments)",
    provider: "hubspot",
    schema: searchContactsSchema,
    handler: searchContactsHandler
  });
  
  // Search notes with attachments tool
  createSearchNotesWithAttachmentsTool(server);
  
  // Add more HubSpot tools here as needed
}