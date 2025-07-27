import { createProviderTool } from "../create-provider-tool";
import { listDocumentsHandler, listDocumentsSchema } from "./list-documents";
import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";

export function registerPandaDocTools(server: any) {
  // List documents tool
  createProviderTool(server, {
    name: "list_pandadoc_documents",
    description: "List PandaDoc documents with optional status filter, pagination (count/page), and ordering",
    provider: "pandadoc",
    schema: listDocumentsSchema,
    handler: listDocumentsHandler
  });
  
  // Example: Get document details
  createProviderTool(server, {
    name: "get_pandadoc_document",
    description: "Get details of a specific PandaDoc document",
    provider: "pandadoc",
    schema: {
      documentId: z.string().describe("PandaDoc document ID")
    },
    handler: async ({ documentId }, context) => {
      const api = new ProviderApiHelper(context);
      
      const response = await api.get(
        `/documents/${documentId}`,
        'get_document',
        {
          cache: {
            enabled: true,
            ttlMs: 60000 // 1 minute cache
          }
        }
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            authenticated: true,
            document: response.data
          }, null, 2)
        }],
      };
    }
  });
  
  // Example: Create document from template
  createProviderTool(server, {
    name: "create_pandadoc_document",
    description: "Create a new PandaDoc document from a template",
    provider: "pandadoc",
    schema: {
      name: z.string().describe("Document name"),
      template_uuid: z.string().describe("Template UUID to use"),
      recipients: z.array(z.object({
        email: z.string().email(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        role: z.string().optional()
      })).describe("Document recipients"),
      metadata: z.record(z.any()).optional().describe("Optional metadata")
    },
    handler: async ({ name, template_uuid, recipients, metadata }, context) => {
      const api = new ProviderApiHelper(context);
      
      const body: any = {
        name,
        template_uuid,
        recipients
      };
      
      if (metadata) {
        body.metadata = metadata;
      }
      
      const response = await api.post(
        '/documents',
        'create_document',
        body
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            document: response.data
          }, null, 2)
        }],
      };
    }
  });
  
  // Example: Send document
  createProviderTool(server, {
    name: "send_pandadoc_document",
    description: "Send a PandaDoc document for signing",
    provider: "pandadoc",
    schema: {
      documentId: z.string().describe("Document ID to send"),
      message: z.string().optional().describe("Optional message to recipients"),
      silent: z.boolean().optional().describe("Send without email notification")
    },
    handler: async ({ documentId, message, silent }, context) => {
      const api = new ProviderApiHelper(context);
      
      const body: any = {};
      if (message) body.message = message;
      if (silent !== undefined) body.silent = silent;
      
      const response = await api.post(
        `/documents/${documentId}/send`,
        'send_document',
        body
      );
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            status: response.data.status,
            message: "Document sent successfully"
          }, null, 2)
        }],
      };
    }
  });
  
  // Example: Download document
  createProviderTool(server, {
    name: "download_pandadoc_document",
    description: "Get download link for a PandaDoc document",
    provider: "pandadoc",
    schema: {
      documentId: z.string().describe("Document ID to download"),
      separate_files: z.boolean().optional().describe("Download as separate files")
    },
    handler: async ({ documentId, separate_files }, context) => {
      const api = new ProviderApiHelper(context);
      
      const params: any = {};
      if (separate_files !== undefined) {
        params.separate_files = separate_files;
      }
      
      const response = await api.get(
        `/documents/${documentId}/download`,
        'download_document',
        { query: params }
      );
      
      return {
        content: [{
          type: "text", 
          text: JSON.stringify({
            authenticated: true,
            download_url: response.data.url,
            expires_at: response.data.expires_at
          }, null, 2)
        }],
      };
    }
  });
}