import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
import { buildPricingTableSections, buildQuoteSections } from "./utils";
import type { ProviderToolContext } from "../create-provider-tool";

const LineItemSchema = z.object({
  name: z.string().describe("Line item name"),
  description: z.string().optional().describe("Line item description"),
  cost_price: z.number().describe("Supplier cost price (what ASI pays)"),
  sell_price: z.number().describe("Customer sell price (what customer pays)"),
  quantity: z.number().default(1).describe("Quantity"),
  unit: z.string().optional().describe("Unit of measure"),
  supplier_ref: z.string().optional().describe("Supplier reference/part number")
});

const SectionSchema = z.object({
  title: z.string().describe("Section title"),
  items: z.array(LineItemSchema).describe("Line items in this section")
});

export const createQuoteSchema = {
  client_name: z.string().describe("Client/company name"),
  opportunity_name: z.string().describe("Opportunity/project name"),
  sections: z.array(SectionSchema).describe("Quote sections with line items"),
  template_id: z.string().optional().describe("PandaDoc template ID (optional)"),
  recipient_email: z.string().email().describe("Recipient email address")
};

type CreateQuoteArgs = {
  client_name: string;
  opportunity_name: string;
  sections: Array<{
    title: string;
    items: Array<{
      name: string;
      description?: string;
      cost_price: number;
      sell_price: number;
      quantity?: number;
      unit?: string;
      supplier_ref?: string;
    }>;
  }>;
  template_id?: string;
  recipient_email: string;
};

export async function createQuoteHandler(
  args: CreateQuoteArgs,
  context: ProviderToolContext
) {
  // Create API helper with context
  const api = new ProviderApiHelper(context);
  
  // Use configured template ID with fallback to default
  const templateId = process.env.PANDADOC_QUOTE_TEMPLATE_ID || "jYJNVcW7YQGeNw5gxw2vaL";
  
  // Create document from template
  const createData: any = {
    template_uuid: templateId,
    name: `${args.client_name} - ${args.opportunity_name}`,
    recipients: [{
      email: args.recipient_email,
      role: "Client"
    }],
    // Legacy pricing table support (if the template uses it)
    pricing_tables: [{
      name: "Quote",
      sections: buildPricingTableSections(args.sections)
    }]
  };
  
  const response = await api.post('/documents', 'create_document', createData);
  if (!response?.data?.id || !response?.data?.name) {
    throw new Error("Unexpected response from PandaDoc when creating document");
  }
  
  const documentId = response.data.id;
  const pandadocUrl = `https://app.pandadoc.com/a/#/documents/${documentId}`;

  // Wait for document to reach draft status before trying to update quotes
  // Poll up to ~10s (5 attempts x 2s)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const statusResp = await api.get(`/documents/${documentId}`, 'document_status');
    const status = (statusResp as any)?.data?.status;
    if (status && status !== 'document.uploaded') break;
    await new Promise(r => setTimeout(r, 2000));
  }

  // Fetch document details to detect Advanced Quote block
  const details = await api.get(`/documents/${documentId}/details`, 'get_document_details');
  const quotes = (details as any)?.data?.pricing?.quotes;

  // If an Advanced Quote exists in the template, update it via Quotes API instead of pricing_tables
  if (Array.isArray(quotes) && quotes.length > 0) {
    const quoteId = quotes[0]?.id;
    if (quoteId) {
      const sections = buildQuoteSections(args.sections);
      await api.put(
        `/documents/${documentId}/quotes/${quoteId}`,
        'update_quote',
        { sections }
      );
    }
  }
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        authenticated: true,
        document_id: documentId,
        name: response.data.name,
        status: response.data.status,
        date_created: response.data.date_created,
        pandadoc_url: pandadocUrl,
        message: `Quote document created successfully. View at: ${pandadocUrl}`
      }, null, 2)
    }],
  };
}