import { createProviderTool } from "../create-provider-tool";
import { searchContactsHandler, searchContactsSchema } from "./search-contacts";
import { createUpdatePurchaseOrderHandler, createUpdatePurchaseOrderSchema } from "./create-update-purchase-order";

export function registerXeroTools(server: any) {
  // Search contacts tool
  createProviderTool(server, {
    name: "search_xero_contacts",
    description: "Search Xero accounting contacts by name or email address",
    provider: "xero",
    schema: searchContactsSchema,
    handler: searchContactsHandler
  });

  // Create/Update purchase order tool
  createProviderTool(server, {
    name: "create_update_xero_purchase_order",
    description: "Create a new purchase order or update an existing one in Xero",
    provider: "xero",
    schema: createUpdatePurchaseOrderSchema,
    handler: createUpdatePurchaseOrderHandler
  });
  
  // Add more Xero tools here as needed
}