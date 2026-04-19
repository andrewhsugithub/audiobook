import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DATABASE_URL } from "@audiobook/shared-libs/config/env.js";

const queryClient = postgres(DATABASE_URL);
const db = drizzle({ client: queryClient });

export { db };
