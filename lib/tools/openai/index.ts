import { z } from "zod";
import { createProviderTool } from "../create-provider-tool";
import { ProviderApiHelper } from "../provider-api-helper";

export function registerOpenAITools(server: any) {
  // Generate text completion
  createProviderTool(server, {
    name: "openai_generate_text",
    description: "Generate text using OpenAI's GPT models",
    provider: "openai",
    authMethod: "system",
    requiresUserAuth: false,
    schema: {
      prompt: z.string().describe("The prompt to generate text from"),
      model: z.string().default("gpt-3.5-turbo").describe("The model to use (e.g., gpt-3.5-turbo, gpt-4)"),
      max_tokens: z.number().optional().describe("Maximum number of tokens to generate"),
      temperature: z.number().min(0).max(2).default(0.7).describe("Sampling temperature (0-2)")
    },
    handler: async ({ prompt, model, max_tokens, temperature }, context) => {
      const api = new ProviderApiHelper(context);
      
      try {
        const response = await api.post("/chat/completions", "generate_text", {
          model,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens,
          temperature
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              model: response.data.model,
              text: response.data.choices[0].message.content,
              usage: response.data.usage
            }, null, 2)
          }]
        };
      } catch (error: any) {
        throw error;
      }
    }
  });

  // List available models
  createProviderTool(server, {
    name: "openai_list_models",
    description: "List available OpenAI models",
    provider: "openai",
    authMethod: "system",
    requiresUserAuth: false,
    schema: {},
    handler: async (args, context) => {
      const api = new ProviderApiHelper(context);
      
      try {
        const response = await api.get("/models", "list_models");
        
        // Filter and sort models
        const models = response.data.data
          .filter((model: any) => model.id.startsWith('gpt'))
          .sort((a: any, b: any) => a.id.localeCompare(b.id))
          .map((model: any) => ({
            id: model.id,
            owned_by: model.owned_by,
            created: new Date(model.created * 1000).toISOString()
          }));
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: models.length,
              models
            }, null, 2)
          }]
        };
      } catch (error: any) {
        throw error;
      }
    }
  });
}