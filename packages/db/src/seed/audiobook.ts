//!!!!! IMPORTANT !!!!!
//! if you have manual inputs in your database that you want to preserve, DO NOT RUN THIS SCRIPT! It will reset the users and voices tables and re-populate them with mock data, which will DELETE any existing data in those tables. Use with caution and ideally only in development environments where you don't have critical data.

import { faker } from "@faker-js/faker";
import { seed } from "drizzle-seed";
import { getDb, sql } from "../index.js";
import { users, audiobooks } from "../schema/schema.js";
import { DATABASE_URL } from "@audiobook/shared-libs/config/env.js";
import * as schema from "../schema/schema.js";
import { randomInt } from "node:crypto";

export async function audiobookSeed() {
  console.log("⏳ Initializing audiobook database seed runner...");

  const db = getDb(DATABASE_URL);

  const liveUsers = await db.select({ id: users.id }).from(users);

  console.log(
    "📚 Seeding metadata-only audiobooks mapped to active user IDs...",
  );

  const bookTitles = faker.helpers.uniqueArray(faker.book.title, 100);

  await seed(db, { audiobooks: schema.audiobooks }).refine((f) => ({
    audiobooks: {
      count: 30,
      columns: {
        // Uniformly distribute books across our generated real users
        userId: f.valuesFromArray({ values: liveUsers.map((u) => u.id) }),

        title: f.valuesFromArray({ values: bookTitles, isUnique: true }),
        author: f.fullName({ isUnique: true }),
        description: f.loremIpsum({ sentencesCount: randomInt(2, 15) }),
        visibility: f.valuesFromArray({ values: ["public"] }),
        ratings: f.number({ minValue: 0, maxValue: 5, precision: 10 }),

        // leave others as defaults or nulls
        status: f.default({ defaultValue: "initiated" }),

        coverBucketName: f.default({ defaultValue: null }),
        coverS3Key: f.default({ defaultValue: null }),

        chunksBucketName: f.default({ defaultValue: null }),
        chunksS3KeyPrefix: f.default({ defaultValue: null }),

        segmentsBucketName: f.default({ defaultValue: null }),
        segmentsS3KeyPrefix: f.default({ defaultValue: null }),

        totalDurationSeconds: f.default({ defaultValue: 0 }),

        totalCharactersParsed: f.default({ defaultValue: 0 }),
        totalChunks: f.default({ defaultValue: 0 }),
        totalSegments: f.default({ defaultValue: 0 }),
        processedSegments: f.default({ defaultValue: 0 }),

        errorMessage: f.default({ defaultValue: null }),

        createdAt: f.default({ defaultValue: sql`CURRENT_TIMESTAMP` }),
        updatedAt: f.default({ defaultValue: sql`CURRENT_TIMESTAMP` }),
      },
    },
  }));

  console.log(
    "✓ Metadata-only audiobooks successfully generated. Example entry:",
    await db.select().from(audiobooks).limit(1),
  );

  console.log("🚀 Audiobook database initialization steps complete!");
  process.exit(0);
}

audiobookSeed().catch((err) => {
  console.error("❌ Seeding runtime broken:", err);
  process.exit(1);
});
