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
import { chapters } from "./chapters.js";
import { voices } from "./voices.js";
import { audiobooks } from "./audiobook.js";

//? consider doing this for chunks as well, but for simplicity
// export const segmentStatusEnum = pgEnum("segment_status", [
//   "pending", // waiting to be processed
//   "voice_mapped", // rawSpeakerTag resolved to a voiceId
//   "synthesized", // TTS done, audio uploaded to S3
//   "failed",
// ]);

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // chapterId: uuid("chapter_id")
    //   .references(() => chapters.id, { onDelete: "cascade" })
    //   .notNull(),
    // denormalized from chapter → avoids joins when
    // querying "all segments for this book" during processing
    audiobookId: uuid("audiobook_id")
      .references(() => audiobooks.id, { onDelete: "cascade" })
      .notNull(),
    // Global sequence across the ENTIRE book for HLS manifest generation.
    hlsSequenceNumber: integer("hls_sequence_number").notNull(),

    content: text("content").notNull(), // currently this is the whole sentence, maybe in the future we can omit the speaker and emotion tags
    rawSpeakerTag: varchar("raw_speaker_tag", { length: 50 }),
    emotionTag: varchar("emotion_tag", { length: 50 }),

    voiceId: uuid("voice_id").references(() => voices.id, {
      onDelete: "set null",
    }), // If a voice profile is deleted, keep the sentence record intact

    bucketName: varchar("bucket_name", { length: 255 }),
    audioSegmentS3Key: text("audio_segment_s3_key"),

    // TODO: Seek / Offset
    // milliseconds from chapter start
    // used for: jump to chapter position, progress display
    // chapterOffsetMs: integer("chapter_offset_ms"),
    // milliseconds from book start
    // used for: seek across entire book
    // bookOffsetMs: integer("book_offset_ms"),

    // status: segmentStatusEnum("status").default("pending").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // index("segments_chapter_idx").on(table.chapterId),
    index("segments_audiobook_idx").on(table.audiobookId),
    // index("segments_status_idx").on(table.status),
    index("segments_hls_seq_idx").on(
      table.audiobookId,
      table.hlsSequenceNumber,
    ),

    // processing query: "give me all pending segments for this book"
    // index("segments_audiobook_status_idx").on(table.audiobookId, table.status),

    // TODO: seeking: "which segment starts at or before timestamp X in chapter Y"
    // index("segments_chapter_offset_idx").on(
    //   table.chapterId,
    //   table.chapterOffsetMs,
    // ),

    // prevent duplicate ordering within same chapter
    // unique("segments_chapter_sequence_unique").on(
    //   table.chapterId,
    //   table.sequenceNumber,
    // ),
    // prevent duplicate HLS sequence numbers within same book (HLS spec requires unique #EXTINF ordering in playlist)
    unique("segments_book_hls_sequence_unique").on(
      table.audiobookId,
      table.hlsSequenceNumber,
    ),
  ],
);
