//!!!!! IMPORTANT !!!!!
//! if you have manual inputs in your database that you want to preserve, DO NOT RUN THIS SCRIPT! It will reset the users and voices tables and re-populate them with mock data, which will DELETE any existing data in those tables. Use with caution and ideally only in development environments where you don't have critical data.

import { userSeed } from "./users.js";
import { voiceSeed } from "./voice.js";
import { audiobookSeed } from "./audiobook.js";

async function main() {
  console.log("🚀 Starting database seeding process...");
  try {
    await userSeed();
    await voiceSeed();
    await audiobookSeed();
  } catch (err) {
    console.error("❌ Seeding runtime broken:", err);
    process.exit(1);
  }
  console.log("🎉 Database seeding complete!");
  process.exit(0);
}

main();
