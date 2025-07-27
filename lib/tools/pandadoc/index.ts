import { registerTool } from "../register-tool";
import { listDocumentsHandler, listDocumentsSchema } from "./list-documents";

export function registerPandaDocTools(server: any) {
  registerTool(
    server,
    "list_pandadoc_documents",
    "List PandaDoc documents with optional status filter, pagination (count/page), and ordering",
    listDocumentsSchema,
    listDocumentsHandler
  );
  
  // Add more PandaDoc tools here as needed
}