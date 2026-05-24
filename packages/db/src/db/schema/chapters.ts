import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  integer,
  index,
  pgEnum,
  unique,
  real,
} from "drizzle-orm/pg-core";
import { audiobooks } from "./audiobook.js";

export const chapterPlaylistStatusEnum = pgEnum("chapter_playlist_status", [
  "pending", // segments still being synthesized
  "generating", // building .m3u8 file now
  "ready", // playlist.m3u8 uploaded to S3, cdnUrl set
  "failed",
]);

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    audiobookId: uuid("audiobook_id")
      .references(() => audiobooks.id, { onDelete: "cascade" })
      .notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    title: varchar("title", { length: 500 }),
    description: text("description"),

    playlistStatus: chapterPlaylistStatusEnum("playlist_status")
      .default("pending")
      .notNull(),

    // set once all segments in this chapter are synthesized
    chapterManifestKey: text("chapter_manifest_key"), // e.g., "books/[id]/chapters/[chap_id].m3u8"
    durationMs: integer("duration_ms").default(0),

    // required by HLS spec: #EXT-X-TARGETDURATION
    durationSeconds: real("duration_seconds").default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chapters_book_idx").on(table.audiobookId),
    // prevent duplicate chapter ordering within same book
    unique("chapters_book_sequence_unique").on(
      table.audiobookId,
      table.sequenceNumber,
    ),
  ],
);
