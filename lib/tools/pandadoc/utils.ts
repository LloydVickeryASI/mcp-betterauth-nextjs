type QuoteItem = {
  name: string;
  description?: string;
  cost_price: number;
  sell_price: number;
  quantity?: number;
  unit?: string;
  supplier_ref?: string;
};

type QuoteSection = {
  title: string;
  items: QuoteItem[];
};

// Maps business-level quote items into PandaDoc pricing table rows
export function mapItemsToRows(items: QuoteItem[]) {
  return items.map(item => ({
    options: {
      qty_editable: true,
      optional: false,
    },
    data: {
      name: item.name,
      description: item.description || "",
      price: item.sell_price,
      cost: item.cost_price,
      qty: item.quantity || 1,
      unit: item.unit || "ea",
      custom_fields: {
        supplier_ref: item.supplier_ref || "",
      },
    },
  }));
}

// Builds PandaDoc pricing table sections from business-level sections
export function buildPricingTableSections(sections: QuoteSection[]) {
  return sections.map(section => ({
    title: section.title,
    default: true,
    rows: mapItemsToRows(section.items),
  }));
}

// Advanced Quotes (CPQ) mappers
// See: https://developers.pandadoc.com/docs/update-quotes
type PandaDocQuoteItem = {
  sku?: string;
  name: string;
  description?: string;
  qty: string | number;
  price: string | number;
  cost?: string | number;
  type?: 'product';
  options?: { qty_editable?: boolean; selected?: boolean };
};

type PandaDocQuoteSection = {
  name: string;
  items: PandaDocQuoteItem[];
  settings?: { selection_type?: 'custom' | 'single' | 'multiple'; optional?: boolean; selected?: boolean };
};

export function mapItemsToQuoteItems(items: QuoteItem[]): PandaDocQuoteItem[] {
  return items.map(item => ({
    sku: item.supplier_ref || undefined,
    name: item.name,
    description: item.description || "",
    qty: item.quantity ?? 1,
    price: item.sell_price,
    cost: item.cost_price,
    type: 'product',
    options: { qty_editable: true, selected: true }
  }));
}

export function buildQuoteSections(sections: QuoteSection[]): PandaDocQuoteSection[] {
  return sections.map(section => ({
    name: section.title,
    items: mapItemsToQuoteItems(section.items),
    settings: { selection_type: 'custom', optional: false, selected: true }
  }));
}


