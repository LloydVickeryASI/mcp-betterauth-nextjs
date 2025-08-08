import { createProviderTool } from "../create-provider-tool";
import { createSearchNotesWithAttachmentsTool } from "./search-notes-with-attachments";
import { registerHubspotObjectsTools } from "./objects";

export function registerHubSpotTools(server: any) {
  // Search notes with attachments tool
  createSearchNotesWithAttachmentsTool(server);
  
  // Generic HubSpot objects tools (deals only for now)
  registerHubspotObjectsTools(server);
  
  // Add more HubSpot tools here as needed
}