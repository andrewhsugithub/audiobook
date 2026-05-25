import { defineConfig } from "drizzle-kit";
import { DATABASE_URL } from "@audiobook/shared-libs/config/env.js";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
