import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@audiobook/db/src";
import { betterAuthOptions } from "./src/lib/auth/options";
import { betterAuth } from "better-auth";
import * as schema from "@audiobook/db/src/schema/schema";
const { DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET } = process.env;

const db = getDb(DATABASE_URL!);
export const auth = betterAuth({
  ...betterAuthOptions,
  database: drizzleAdapter(db, { provider: "pg", schema }), // schema is required in order for bettter-auth to recognize
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
});
