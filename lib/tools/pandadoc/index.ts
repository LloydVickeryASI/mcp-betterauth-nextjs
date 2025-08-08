import { createProviderTool } from "../create-provider-tool";
import { listDocumentsHandler, listDocumentsSchema } from "./list-documents";
// import { listTemplatesHandler, listTemplatesSchema } from "./list-templates"; // Keeping for later
import { createQuoteHandler, createQuoteSchema } from "./create-quote";
import { updateQuoteHandler, updateQuoteSchema } from "./update-quote";

export function registerPandaDocTools(server: any) {
  // List documents tool
  createProviderTool(server, {
    name: "list_pandadoc_documents",
    description: "List PandaDoc documents with optional status filter, pagination (count/page), and ordering",
    provider: "pandadoc",
    schema: listDocumentsSchema,
    handler: listDocumentsHandler
  });
  
  // List templates tool - commented out for now
  // createProviderTool(server, {
  //   name: "list_pandadoc_templates",
  //   description: "Lists available PandaDoc quote templates for ASI Solutions. Use this to see what templates are available before creating a quote. The system will use a default template if none is specified, so this is mainly useful when the user wants to see template options or use a specific template.",
  //   provider: "pandadoc",
  //   schema: listTemplatesSchema,
  //   handler: listTemplatesHandler
  // });
  
  // Create quote tool
  createProviderTool(server, {
    name: "create_pandadoc_quote",
    description: "Creates a professional customer quote in PandaDoc from supplier pricing information. In normal operation, ALL quotes must be linked to a HubSpot deal (provide hubspot_deal_id). You may omit the deal ID only in emergencies to create an unlinked quote. This is the main tool for ASI Solutions staff to convert supplier quotes into customer-facing quotes with appropriate margins. The tool takes supplier cost prices and calculates sell prices with markup.",
    provider: "pandadoc",
    schema: createQuoteSchema,
    handler: createQuoteHandler
  });
  
  // Update quote tool
  createProviderTool(server, {
    name: "update_pandadoc_quote",
    description: "Updates an existing customer quote in PandaDoc. Use this to add new items from additional supplier quotes, modify pricing, update quantities, or remove items. This is useful when you receive updated pricing from suppliers or need to add/remove items from an existing quote. Supports replace mode (default) to completely replace sections, or append mode to add new sections to existing quote.",
    provider: "pandadoc",
    schema: updateQuoteSchema,
    handler: updateQuoteHandler
  });
}