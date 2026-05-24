import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export * from "drizzle-orm";

export type DatabaseInstance = ReturnType<typeof drizzle>;

export function getDb(connectionString: string): DatabaseInstance {
  // prepare: false is required for certain serverless connection poolers like Supabase/Neon
  const queryClient = postgres(connectionString, { prepare: false });
  return drizzle({ client: queryClient });
}
