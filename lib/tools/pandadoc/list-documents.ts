import { z } from "zod";
import type { ToolContext } from "../register-tool";

export const listDocumentsSchema = z.object({
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
});

export const listDocumentsHandler = async (
  { status, count = 20, page = 1, order_by }: z.infer<typeof listDocumentsSchema>,
  context: ToolContext
) => {
  // Check if user has PandaDoc account linked
  const pandadocAccount = context.db.prepare('SELECT * FROM account WHERE userId = ? AND providerId = ?')
    .get(context.session.userId, 'pandadoc');
  
  if (!pandadocAccount || !pandadocAccount.accessToken) {
    // User needs to authenticate with PandaDoc
    const connectionsUrl = `${context.auth.options.baseURL}/connections`;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          authenticated: false,
          message: "PandaDoc account not connected. Please visit the connections page to link your PandaDoc account.",
          connectionsUrl: connectionsUrl,
          provider: "pandadoc"
        }, null, 2)
      }],
    };
  }
  
  // Build query parameters
  const params = new URLSearchParams({
    count: count.toString(),
    page: page.toString()
  });
  
  if (status) {
    params.append('status', status);
  }
  
  if (order_by) {
    params.append('order_by', order_by);
  }
  
  // List documents using PandaDoc API
  const response = await fetch(`https://api.pandadoc.com/public/v1/documents?${params.toString()}`, {
    headers: {
      "Authorization": `Bearer ${pandadocAccount.accessToken}`,
      "Content-Type": "application/json"
    }
  });
  
  if (!response.ok) {
    // Token might be expired, provide auth URL
    if (response.status === 401) {
      const connectionsUrl = `${context.auth.options.baseURL}/connections`;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            authenticated: false,
            message: "PandaDoc token expired. Please reconnect your PandaDoc account on the connections page.",
            connectionsUrl: connectionsUrl,
            provider: "pandadoc"
          }, null, 2)
        }],
      };
    }
    
    // Get error details
    const errorText = await response.text();
    let errorDetails;
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      errorDetails = errorText;
    }
    
    throw new Error(`PandaDoc API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorDetails)}`);
  }
  
  const data = await response.json();
  
  // Format the response with relevant document information
  const formattedResults = data.results.map((doc: any) => ({
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
        total_count: data.count,
        page: page,
        page_size: count,
        total_pages: Math.ceil(data.count / count)
      }, null, 2)
    }],
  };
};