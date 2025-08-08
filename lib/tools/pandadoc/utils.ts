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


