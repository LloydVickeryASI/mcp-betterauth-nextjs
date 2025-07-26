import { z } from "zod";
import { createMcpHandler } from "mcp-handler";

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "roll_dice",
      "Rolls an N-sided die",
      { sides: z.number().int().min(2) },
      async ({ sides }) => ({
        content: [{ type: "text", text: `You rolled a ${1 + Math.floor(Math.random()*sides)}!` }],
      }),
    );
  },
  {},
  { basePath: "/api" },
);

export { handler as GET, handler as POST, handler as DELETE };