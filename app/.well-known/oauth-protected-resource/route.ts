import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import { NextResponse } from "next/server";

const baseUrl = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : "http://localhost:3000";

const handler = protectedResourceHandler({
  resource: baseUrl,
  authServerUrls: [process.env.AUTH_ISSUER || baseUrl],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export const GET = handler;
export async function OPTIONS() {
  return corsHandler();
}