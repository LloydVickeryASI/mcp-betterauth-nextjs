import { createProviderTool } from "../create-provider-tool";
import { listDocumentsHandler, listDocumentsSchema } from "./list-documents";

export function registerPandaDocTools(server: any) {
  // List documents tool
  createProviderTool(server, {
    name: "list_pandadoc_documents",
    description: "List PandaDoc documents with optional status filter, pagination (count/page), and ordering",
    provider: "pandadoc",
    schema: listDocumentsSchema,
    handler: listDocumentsHandler
  });
  
  // Add more PandaDoc tools here as needed
}