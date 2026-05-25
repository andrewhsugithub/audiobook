import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  varchar,
  integer,
  index,
  real,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const audiobookVisibilityEnum = pgEnum("audiobook_visibility", [
  "public",
  "private",
]);

// ! status should be updated by per chunk per segment basis instead of the whole book, otherwise if one chunk/segment fails the whole book is marked as failed and we can't retry just that chunk/segment
export const audiobookStatusEnum = pgEnum("audiobook_status", [
  "initiated", // Multipart upload started, urls handed to client
  "finished_upload", // S3 has successfully assembled the raw text/pdf chunks
  "parsing", // Worker is extracting text and metadata from the raw file
  "finished_parsing",
  "chunking", // worker breaking parsed text into sentences and segments
  "finished_chunking",
  "tagging", // worker tagging sentences
  "finished_tagging",
  "mapping_voices", // LLM mapping characters to default voices
  "finished_mapping_voices",
  "synthesizing", // TTS processing engine converting text to audio
  "finished_synthesizing",
  "completed", // Fully processed and ready for streaming
  "failed", // Something in the pipeline broke
]);

export const audiobooks = pgTable(
  "audiobooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // book metadata
    title: varchar("title", { length: 100 }).notNull(),
    author: varchar("author", { length: 100 }),
    description: text("description"),
    visibility: audiobookVisibilityEnum("visibility")
      .default("private")
      .notNull(),
    status: audiobookStatusEnum("status").default("initiated").notNull(),

    // chunks folder, for tracking
    chunksBucketName: varchar("chunks_bucket_name", { length: 255 }),
    chunksS3KeyPrefix: text("chunks_s3_key_prefix"),

    // keep this since hls worker may need to constantly query the length of the book to calculate offsets for streaming
    totalDurationSeconds: real("total_duration_seconds").default(0),

    // Tracking & Debugging metrics
    totalCharactersParsed: integer("total_characters_parsed").default(0),
    totalChunks: integer("total_chunks").default(0),
    totalSegments: integer("total_segments").default(0),
    processedSegments: integer("processed_segments").default(0),

    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("audiobooks_user_idx").on(table.userId),
    index("audiobooks_status_idx").on(table.status),
  ],
);
