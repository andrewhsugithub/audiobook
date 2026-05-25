//!!!!! IMPORTANT !!!!!
//! if you have manual inputs in your database that you want to preserve, DO NOT RUN THIS SCRIPT! It will reset the users and voices tables and re-populate them with mock data, which will DELETE any existing data in those tables. Use with caution and ideally only in development environments where you don't have critical data.

import { promises as fs } from "node:fs";
import { reset, seed } from "drizzle-seed";
import { getDb } from "./index.js";
import { users, voices } from "./schema/schema.js";
import { DATABASE_URL } from "@audiobook/shared-libs/config/env.js";
import * as schema from "./schema/schema.js";
import { parse } from "jsonc-parser";

interface CartesiaVoiceResponse {
  id: string;
  mode: string;
  is_owner: boolean;
  is_public: boolean;
  name: string;
  description: string;
  created_at: string; // ISO timestamp
  gender: string;
  language: string;
  preview_file_url: string;
  country: string;
  is_pro: boolean;
}

async function main() {
  console.log("⏳ Initializing unified database seed runner...");

  const db = getDb(DATABASE_URL);

  console.log("🌱 Generating 10 fake user accounts...");

  console.log(
    "⚠️ WARNING: This will reset the 'users' table and delete all existing user data. Proceeding with seeding mock user accounts... Please confirm (Y/N):",
  );
  const resetUserInput = await new Promise((resolve) => {
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (data) => {
      resolve(data.toString().trim().toUpperCase());
    });
  });

  if (resetUserInput !== "Y") {
    console.log("❌ Seeding cancelled by user.");
    process.exit(1);
  }

  await reset(db, { users: schema.users });
  await seed(db, { users: schema.users }).refine((f) => ({
    users: {
      count: 10,
      columns: {
        email: f.email(),
      },
    },
  }));

  console.log(
    "✓ Mock user accounts successfully populated. Example entry:",
    await db.select().from(users).limit(1),
  );

  console.log("📖 Reading immutable voice profiles from JSON data file...");
  // TODO: refactor to read from a directory of JSON files
  const jsonPath = "cartesia-voices.jsonc"; // change this path if your JSON file is located elsewhere
  const rawData = await fs.readFile(jsonPath, "utf-8");
  const parsedData = parse(rawData) as
    | CartesiaVoiceResponse[]
    | { data: CartesiaVoiceResponse[] };

  // Handle case where json has a top level {"data": [...]} wrapper or is a direct array
  const rawCartesiaVoices: CartesiaVoiceResponse[] = Array.isArray(parsedData)
    ? parsedData
    : parsedData.data;

  const mappedVoices = rawCartesiaVoices.map((voice) => ({
    name: voice.name,
    gender: voice.gender,
    language: voice.language,
    country: voice.country,
    description: voice.description,
    provider: "cartesia" as const,
    externalVoiceId: voice.id,
    previewFileUrl: voice.preview_file_url,
    providerMetadata: {
      mode: voice.mode,
      is_owner: voice.is_owner,
      is_public: voice.is_public,
      is_pro: voice.is_pro,
      created_at: voice.created_at,
      output_format: {
        container: "wav",
        encoding: "pcm_s16le",
        sample_rate: 44100,
      },
      generation_config: {
        speed: 1.0,
        volume: 1.0,
      },
    },
  }));

  console.log(
    `⏳ Seeding ${mappedVoices.length} processed Cartesia audio structures...`,
  );

  console.log(
    "⚠️ WARNING: This will reset the 'voices' table and delete all existing voice data. Proceeding with seeding mock voice profiles... Please confirm (Y/N):",
  );
  const resetVoicesInput = await new Promise((resolve) => {
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (data) => {
      resolve(data.toString().trim().toUpperCase());
    });
  });

  if (resetVoicesInput !== "Y") {
    console.log("❌ Seeding cancelled by user.");
    process.exit(1);
  }
  await reset(db, { voices: schema.voices });
  await db.insert(voices).values(mappedVoices);

  console.log(
    "✓ Mock voice profiles successfully populated. Example entry:",
    await db.select().from(voices).limit(1),
  );

  console.log("🚀 All unified database initialization steps complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeding runtime broken:", err);
  process.exit(1);
});
