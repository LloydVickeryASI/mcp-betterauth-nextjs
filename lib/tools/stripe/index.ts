import { z } from "zod";
import { createProviderTool } from "../create-provider-tool";
import { ProviderApiHelper } from "../provider-api-helper";

export function registerStripeTools(server: any) {
  // List customers
  createProviderTool(server, {
    name: "stripe_list_customers",
    description: "List Stripe customers with optional search",
    provider: "stripe",
    authMethod: "system",
    requiresUserAuth: false,
    schema: {
      email: z.string().optional().describe("Filter customers by email"),
      limit: z.number().min(1).max(100).default(10).describe("Number of customers to return"),
    },
    handler: async ({ email, limit }, context) => {
      const api = new ProviderApiHelper(context);
      
      try {
        const queryParams: any = { limit };
        if (email) {
          queryParams.email = email;
        }
        
        const response = await api.get("/customers", "list_customers", {
          query: queryParams
        });
        
        const customers = response.data.data.map((customer: any) => ({
          id: customer.id,
          email: customer.email,
          name: customer.name,
          created: new Date(customer.created * 1000).toISOString(),
          currency: customer.currency,
          balance: customer.balance
        }));
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: customers.length,
              has_more: response.data.has_more,
              customers
            }, null, 2)
          }]
        };
      } catch (error: any) {
        throw error;
      }
    }
  });

  // Get balance
  createProviderTool(server, {
    name: "stripe_get_balance",
    description: "Get current Stripe account balance",
    provider: "stripe",
    authMethod: "system",
    requiresUserAuth: false,
    schema: {},
    handler: async (args, context) => {
      const api = new ProviderApiHelper(context);
      
      try {
        const response = await api.get("/balance", "get_balance");
        
        const balance = {
          available: response.data.available.map((b: any) => ({
            amount: b.amount / 100,
            currency: b.currency.toUpperCase()
          })),
          pending: response.data.pending.map((b: any) => ({
            amount: b.amount / 100,
            currency: b.currency.toUpperCase()
          }))
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(balance, null, 2)
          }]
        };
      } catch (error: any) {
        throw error;
      }
    }
  });

  // List recent charges
  createProviderTool(server, {
    name: "stripe_list_charges",
    description: "List recent Stripe charges",
    provider: "stripe",
    authMethod: "system",
    requiresUserAuth: false,
    schema: {
      limit: z.number().min(1).max(100).default(10).describe("Number of charges to return"),
      status: z.enum(["succeeded", "pending", "failed"]).optional().describe("Filter by charge status")
    },
    handler: async ({ limit, status }, context) => {
      const api = new ProviderApiHelper(context);
      
      try {
        const queryParams: any = { limit };
        if (status) {
          queryParams.status = status;
        }
        
        const response = await api.get("/charges", "list_charges", {
          query: queryParams
        });
        
        const charges = response.data.data.map((charge: any) => ({
          id: charge.id,
          amount: charge.amount / 100,
          currency: charge.currency.toUpperCase(),
          status: charge.status,
          description: charge.description,
          customer: charge.customer,
          created: new Date(charge.created * 1000).toISOString(),
          paid: charge.paid,
          refunded: charge.refunded
        }));
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: charges.length,
              has_more: response.data.has_more,
              charges
            }, null, 2)
          }]
        };
      } catch (error: any) {
        throw error;
      }
    }
  });
}