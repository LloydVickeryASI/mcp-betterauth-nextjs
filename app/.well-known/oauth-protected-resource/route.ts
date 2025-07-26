import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

const handler = protectedResourceHandler({
  authServerUrls: [process.env.AUTH_ISSUER || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"],
});

export { handler as GET, metadataCorsOptionsRequestHandler as OPTIONS };