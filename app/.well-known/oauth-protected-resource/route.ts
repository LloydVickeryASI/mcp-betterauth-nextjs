import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

const baseUrl = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : "http://localhost:3000";

const handler = protectedResourceHandler({
  authServerUrls: [process.env.AUTH_ISSUER || baseUrl],
});

export { handler as GET, metadataCorsOptionsRequestHandler as OPTIONS };