import { registerTool } from "../register-tool";
import { searchContactsHandler, searchContactsSchema } from "./search-contacts";

export function registerHubSpotTools(server: any) {
  registerTool(
    server,
    "search_hubspot_contacts",
    "Search HubSpot contacts by email (exact match for full emails, partial match for fragments)",
    searchContactsSchema,
    searchContactsHandler
  );
  
  // Add more HubSpot tools here as needed
}