import { cors } from "hono/cors";
import { ALLOWED_ORIGINS } from "../constants/cors";

/**
 * Hono built-in CORS middleware.
 * `credentials: true` is required because the HLS session uses httpOnly cookies.
 */
export const corsMiddleware = cors({
  origin: (origin) => (ALLOWED_ORIGINS.includes(origin as any) ? origin : ""),
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Range"],
  exposeHeaders: ["Content-Range", "Accept-Ranges", "X-Cache-Status"],
  credentials: true,
  maxAge: 86_400,
});
