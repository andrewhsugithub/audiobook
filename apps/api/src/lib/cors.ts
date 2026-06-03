import { ALLOWED_ORIGINS } from "../constants/cors";

export function resolveCorsOrigin(origin: string): string {
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : "";
}

/** For public resources (covers) a wildcard is acceptable */
export function resolvePublicCorsOrigin(origin: string): string {
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : "*";
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveCorsOrigin(origin),
    "Access-Control-Allow-Credentials": "true",
  };
}
