import { z } from "zod";
import { ProviderApiHelper } from "../provider-api-helper";
import type { ProviderToolContext } from "../create-provider-tool";
import { getAccountByUserIdAndProvider } from "@/lib/db-queries";
import { Pool } from "@neondatabase/serverless";
import { getBaseUrl } from "@/lib/get-base-url";

export const createUpdatePurchaseOrderSchema = {
  purchaseOrderId: z.string().optional().describe("The ID of an existing purchase order to update. If not provided, a new purchase order will be created"),
  contactId: z.string().describe("The Contact ID of the supplier (use search_xero_contacts to find contact IDs)"),
  date: z.string().describe("The date of the purchase order in YYYY-MM-DD format"),
  deliveryDate: z.string().optional().describe("The expected delivery date in YYYY-MM-DD format"),
  reference: z.string().optional().describe("Reference number or code for the purchase order"),
  lineItems: z.array(z.object({
    description: z.string().describe("Description of the item"),
    quantity: z.number().describe("Quantity of the item"),
    unitAmount: z.number().describe("Unit price of the item"),
    accountCode: z.string().optional().describe("Account code for the line item"),
    taxType: z.string().optional().describe("Tax type for the line item"),
    itemCode: z.string().optional().describe("Item code if using tracked inventory")
  })).describe("Array of line items for the purchase order"),
  status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "BILLED", "DELETED"]).optional().describe("Status of the purchase order. Defaults to DRAFT for new orders"),
  currencyCode: z.string().optional().describe("Currency code (e.g., USD, AUD). Uses organization default if not specified"),
  deliveryAddress: z.string().optional().describe("Delivery address for the purchase order"),
  deliveryInstructions: z.string().optional().describe("Special delivery instructions")
};

export async function createUpdatePurchaseOrderHandler(
  params: z.infer<z.ZodObject<typeof createUpdatePurchaseOrderSchema>>,
  context: ProviderToolContext
) {
  // Validate required fields
  if (!params.contactId?.trim()) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: true,
          message: "Contact ID is required. Use search_xero_contacts to find contact IDs."
        }, null, 2)
      }],
    };
  }

  if (!params.lineItems || params.lineItems.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: true,
          message: "At least one line item is required"
        }, null, 2)
      }],
    };
  }

  // Create API helper with context
  const api = new ProviderApiHelper(context);
  
  // Resolve a valid access token and tenant ID
  const db = context.db as Pool;
  const account = await getAccountByUserIdAndProvider(db, context.session.userId, 'xero');

  let accessToken = account?.accessToken as string | undefined;
  if (!accessToken) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: true, message: "No Xero access token found. Please reconnect your Xero account." }, null, 2)
      }],
    };
  }

  if (account?.accessTokenExpiresAt && new Date(account.accessTokenExpiresAt) <= new Date() && account?.refreshToken) {
    try {
      const refreshResponse = await fetch(`${getBaseUrl()}/api/auth/refresh/xero`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${context.session.token}`,
          'Content-Type': 'application/json',
        },
      });
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        accessToken = data.accessToken;
      }
    } catch {}
  }

  // Fetch tenant connections from Xero
  let tenantId: string | undefined;
  try {
    const connectionsRes = await fetch('https://api.xero.com/connections', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    if (connectionsRes.ok) {
      const connections = await connectionsRes.json();
      tenantId = connections?.[0]?.tenantId;
    }
  } catch {}

  if (!tenantId) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: true,
          message: "No Xero tenant found for this user. Please reconnect your Xero account.",
        }, null, 2)
      }],
    };
  }

  // Build the purchase order payload
  const purchaseOrderPayload: any = {
    Contact: {
      ContactID: params.contactId
    },
    Date: params.date,
    LineItems: params.lineItems.map(item => ({
      Description: item.description,
      Quantity: item.quantity,
      UnitAmount: item.unitAmount,
      ...(item.accountCode && { AccountCode: item.accountCode }),
      ...(item.taxType && { TaxType: item.taxType }),
      ...(item.itemCode && { ItemCode: item.itemCode })
    })),
    ...(params.deliveryDate && { DeliveryDate: params.deliveryDate }),
    ...(params.reference && { Reference: params.reference }),
    ...(params.status && { Status: params.status }),
    ...(params.currencyCode && { CurrencyCode: params.currencyCode }),
    ...(params.deliveryAddress && { DeliveryAddress: params.deliveryAddress }),
    ...(params.deliveryInstructions && { DeliveryInstructions: params.deliveryInstructions })
  };

  // If updating, add the PurchaseOrderID
  if (params.purchaseOrderId) {
    purchaseOrderPayload.PurchaseOrderID = params.purchaseOrderId;
  }

  try {
    // Make the API call to create or update the purchase order
    const endpoint = params.purchaseOrderId ? `/PurchaseOrders/${params.purchaseOrderId}` : '/PurchaseOrders';
    const method = params.purchaseOrderId ? 'post' : 'post'; // Xero uses POST for both create and update
    
    const response = await api[method](
      endpoint,
      params.purchaseOrderId ? 'update_purchase_order' : 'create_purchase_order',
      {
        PurchaseOrders: [purchaseOrderPayload]
      },
      {
        headers: {
          'Xero-Tenant-Id': tenantId
        }
      }
    );

    // Extract the purchase order from response
    const purchaseOrder = response.data.PurchaseOrders?.[0];
    
    if (!purchaseOrder) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            message: "Failed to create/update purchase order - no data returned"
          }, null, 2)
        }],
      };
    }

    // Calculate total amount
    const total = purchaseOrder.LineItems?.reduce((sum: number, item: any) => 
      sum + (item.LineAmount || 0), 0) || 0;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          authenticated: true,
          success: true,
          action: params.purchaseOrderId ? "updated" : "created",
          purchaseOrder: {
            purchaseOrderID: purchaseOrder.PurchaseOrderID,
            purchaseOrderNumber: purchaseOrder.PurchaseOrderNumber,
            contactId: purchaseOrder.Contact?.ContactID,
            contactName: purchaseOrder.Contact?.Name,
            date: purchaseOrder.Date,
            deliveryDate: purchaseOrder.DeliveryDate,
            reference: purchaseOrder.Reference,
            status: purchaseOrder.Status,
            currencyCode: purchaseOrder.CurrencyCode,
            subTotal: purchaseOrder.SubTotal,
            totalTax: purchaseOrder.TotalTax,
            total: purchaseOrder.Total || total,
            lineItems: purchaseOrder.LineItems?.map((item: any) => ({
              description: item.Description,
              quantity: item.Quantity,
              unitAmount: item.UnitAmount,
              lineAmount: item.LineAmount,
              accountCode: item.AccountCode,
              taxType: item.TaxType,
              taxAmount: item.TaxAmount
            })),
            deliveryAddress: purchaseOrder.DeliveryAddress,
            deliveryInstructions: purchaseOrder.DeliveryInstructions,
            hasAttachments: purchaseOrder.HasAttachments,
            updatedDateUTC: purchaseOrder.UpdatedDateUTC
          },
          message: `Purchase order ${params.purchaseOrderId ? 'updated' : 'created'} successfully`
        }, null, 2)
      }],
    };
  } catch (error: any) {
    // Check if it's a validation error with more details
    if (error.response?.data?.Elements) {
      const validationErrors = error.response.data.Elements
        .flatMap((el: any) => el.ValidationErrors || [])
        .map((err: any) => err.Message);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            message: "Validation error",
            details: validationErrors
          }, null, 2)
        }],
      };
    }

    // Re-throw to let the error handler deal with it
    throw error;
  }
}