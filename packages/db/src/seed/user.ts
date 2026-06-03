//!!!!! IMPORTANT !!!!!
//! if you have manual inputs in your database that you want to preserve, DO NOT RUN THIS SCRIPT! It will reset the users tables and re-populate them with mock data, which will DELETE any existing data in those tables. Use with caution and ideally only in development environments where you don't have critical data.
//! WILL NOT create an admin user
// TODO: use better-auth's built-in seeding functionality to create a real admin user with a known password, and remove this warning, this script wont have a password

import { reset, seed } from "drizzle-seed";
import { getDb, sql } from "../index.js";
import { DATABASE_URL } from "@audiobook/shared-libs/config/env.js";
import * as schema from "../schema/schema.js";
import { user } from "../schema/schema.js";

export async function userSeed() {
  console.log("⏳ Initializing users database seed runner...");

  const db = getDb(DATABASE_URL);

  console.log("🌱 Generating 10 fake user accounts...");
  console.log(
    "⚠️ WARNING: This will reset the 'users' table and delete all existing user data. Proceeding with seeding mock user accounts... Please confirm (Y/N):",
  );

  const confirmationInput = await new Promise<string>((resolve) => {
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (data) => {
      resolve(data.toString().trim().toUpperCase());
    });
  });

  if (confirmationInput !== "Y") {
    console.log("❌ Seeding cancelled by user.");
    process.exit(1);
  }

  await reset(db, { users: schema.user });
  await seed(db, { users: schema.user }).refine((f) => ({
    users: {
      count: 10,
      columns: {
        name: f.fullName(),
        email: f.email(),
        role: f.default({ defaultValue: "user" }),
        createdAt: f.default({ defaultValue: sql`CURRENT_TIMESTAMP` }),
        updatedAt: f.default({ defaultValue: sql`CURRENT_TIMESTAMP` }),
      },
    },
  }));

  console.log(
    "✓ Mock user accounts successfully populated. Example entry:",
    await db.select().from(user).limit(1),
  );

  console.log("🚀 User database initialization steps complete!");
  process.exit(0);
}

userSeed().catch((err) => {
  console.error("❌ Seeding runtime broken:", err);
  process.exit(1);
});
