import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
import { buildPricingTableSections, mapItemsToRows } from "./utils";
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

export const updateQuoteSchema = {
  document_id: z.string().describe("PandaDoc document ID"),
  quote_id: z.string().describe("Quote/opportunity ID for tracking"),
  sections: z.array(SectionSchema).describe("Updated sections with line items"),
  merge_mode: z.enum(["replace", "append"]).default("replace").describe("How to handle existing sections")
};

type UpdateQuoteArgs = {
  document_id: string;
  quote_id: string;
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
  merge_mode?: "replace" | "append";
};

export async function updateQuoteHandler(
  args: UpdateQuoteArgs,
  context: ProviderToolContext
) {
  // Create API helper with context
  const api = new ProviderApiHelper(context);
  
  // Get existing document details if we need to append
  let existingSections: any[] = [];
  
  if (args.merge_mode === "append") {
    const docResponse = await api.get(
      `/documents/${args.document_id}/details`,
      'get_document_details'
    );
    const existingPricingTable = docResponse?.data?.pricing?.tables?.[0];
    if (existingPricingTable && Array.isArray(existingPricingTable.sections)) {
      existingSections = existingPricingTable.sections;
    }
  }
  
  // Prepare sections based on merge mode
  const mappedSections = buildPricingTableSections(args.sections);
  const finalSections = args.merge_mode === "append"
    ? [...existingSections, ...mappedSections]
    : mappedSections;
  
  // Update document with new pricing tables
  const updateData = {
    pricing_tables: [{
      name: "Quote",
      sections: finalSections
    }]
  };
  
  await api.put(
    `/documents/${args.document_id}`,
    'update_document',
    updateData
  );
  
  const pandadocUrl = `https://app.pandadoc.com/a/#/documents/${args.document_id}`;
  
  // Calculate totals
  let totalCost = 0;
  let totalRevenue = 0;
  
  for (const section of args.sections) {
    for (const item of section.items) {
      const qty = item.quantity || 1;
      totalCost += item.cost_price * qty;
      totalRevenue += item.sell_price * qty;
    }
  }
  
  const margin = totalRevenue - totalCost;
  const marginPercentage = totalCost > 0 ? (margin / totalCost) * 100 : 0;
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        authenticated: true,
        document_id: args.document_id,
        quote_id: args.quote_id,
        merge_mode: args.merge_mode || "replace",
        sections_updated: args.sections.length,
        total_items: args.sections.reduce((sum, s) => sum + s.items.length, 0),
        total_cost: totalCost.toFixed(2),
        total_revenue: totalRevenue.toFixed(2),
        margin: margin.toFixed(2),
        margin_percentage: marginPercentage.toFixed(2),
        pandadoc_url: pandadocUrl,
        message: `Quote ${args.quote_id} updated successfully. View at: ${pandadocUrl}`
      }, null, 2)
    }],
  };
}