import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Force Node.js runtime for auth routes to ensure proper database handling
export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);