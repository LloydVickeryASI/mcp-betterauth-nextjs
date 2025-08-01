import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
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
  recipient_email: z.string().email().optional().describe("Recipient email address (optional)")
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
  recipient_email?: string;
};

export async function createQuoteHandler(
  args: CreateQuoteArgs,
  context: ProviderToolContext
) {
  // Create API helper with context
  const api = new ProviderApiHelper(context);
  
  // First, get template ID if not provided
  let templateId = args.template_id;
  
  if (!templateId) {
    // List templates to find a default one
    const templatesResponse = await api.get('/templates', 'list_templates');
    const templates = templatesResponse.data.results || [];
    
    if (templates.length === 0) {
      throw new Error("No templates available. Please create a template in PandaDoc first.");
    }
    
    // Look for a template with "quote" in the name, or use the first one
    const quoteTemplate = templates.find((t: any) => 
      t.name.toLowerCase().includes('quote')
    );
    
    templateId = quoteTemplate?.id || templates[0].id;
  }
  
  // Create document from template
  const createData = {
    template_uuid: templateId,
    name: `${args.client_name} - ${args.opportunity_name}`,
    recipients: [{
      email: args.recipient_email || "placeholder@example.com",
      role: "Client"
    }],
    pricing_tables: [{
      name: "Quote",
      sections: args.sections.map(section => ({
        title: section.title,
        default: true,
        rows: section.items.map(item => ({
          options: {
            qty_editable: true,
            optional: false
          },
          data: {
            name: item.name,
            description: item.description || "",
            price: item.sell_price,
            cost: item.cost_price,
            qty: item.quantity || 1,
            unit: item.unit || "ea",
            custom_fields: {
              supplier_ref: item.supplier_ref || ""
            }
          }
        }))
      }))
    }]
  };
  
  const response = await api.post('/documents', 'create_document', createData);
  
  const pandadocUrl = `https://app.pandadoc.com/a/#/documents/${response.data.id}`;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        authenticated: true,
        document_id: response.data.id,
        name: response.data.name,
        status: response.data.status,
        date_created: response.data.date_created,
        pandadoc_url: pandadocUrl,
        message: `Quote document created successfully. View at: ${pandadocUrl}`
      }, null, 2)
    }],
  };
}