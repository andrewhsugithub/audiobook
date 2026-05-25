import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./db/schema/schema.js";

export * from "drizzle-orm";

export type DatabaseInstance = ReturnType<typeof getDb>;

export function getDb(connectionString: string) {
  // prepare: false is required for certain serverless connection poolers like Supabase/Neon
  const queryClient = postgres(connectionString, { prepare: false });
  return drizzle({ client: queryClient, schema });
}
