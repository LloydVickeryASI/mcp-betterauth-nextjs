import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import { getBaseUrl } from "@/lib/get-base-url";

const handler = protectedResourceHandler({
  authServerUrls: [getBaseUrl()],
});

export { handler as GET, metadataCorsOptionsRequestHandler as OPTIONS };