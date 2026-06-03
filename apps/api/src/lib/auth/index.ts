import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@audiobook/db/src";
import { betterAuthOptions } from "./options";
import { ALLOWED_ORIGINS } from "../../constants/cors";

/**
 * Factory — creates a better-auth instance per-request so it has access to
 * Cloudflare bindings (HYPERDRIVE connection string, secrets, etc.)
 *
 * Pattern from: https://hono.dev/examples/better-auth-on-cloudflare
 */
export function createAuth(env: Cloudflare.Env) {
  const db = getDb(env.HYPERDRIVE.connectionString);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg" }),
    trustedOrigins: [...ALLOWED_ORIGINS],

    ...betterAuthOptions,
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
