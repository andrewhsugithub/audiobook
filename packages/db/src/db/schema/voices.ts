import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  pgEnum,
} from "drizzle-orm/pg-core";

export const providerEnum = pgEnum("voice_provider", [
  // local
  "chatterbox-local",
  "fishaudio-s2-pro-mlx",
  // cloudflare
  "@cf/deepgram/aura-2-es",
  "@cf/deepgram/aura-2-en",
  "@cf/deepgram/aura-1",
  "@cf/myshell-ai/melotts",
]);

export const voices = pgTable("voices", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Deep Male Narrator", "Cheerful Female"
  gender: varchar("gender", { length: 50 }), // e.g., "male", "female", "neutral"
  description: text("description"), // Optional longer description of the voice profile

  provider: providerEnum("provider").notNull(), // Which TTS provider this voice belongs to
  externalTtsId: varchar("external_tts_id", { length: 500 }), // if use third-party TTS provider voice, store their unique voice id here for API calls

  // The explicit S3 file name/key that tts engine will look for if local tts
  // e.g., "voices/a.mp4"
  voiceFileKey: varchar("voice_file_key", { length: 500 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
