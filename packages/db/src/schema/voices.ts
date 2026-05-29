import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  pgEnum,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const providerEnum = pgEnum("voice_provider", [
  // local
  // "chatterbox-local",
  // "fishaudio-s2-pro-mlx",
  "local",
  // third-party
  // "@cf/deepgram/aura-2-es",
  // "@cf/deepgram/aura-2-en",
  // "@cf/deepgram/aura-1",
  // "@cf/myshell-ai/melotts",
  "cloudflare",
  "cartesia", // sonic 3.5
  "inworld",
  "openai",
  "minimax",
  "elevenlabs",
  "gemini",
]);

export const voices = pgTable(
  "voices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    gender: varchar("gender", { length: 50 }),
    language: varchar("language", { length: 50 }),
    country: varchar("country", { length: 50 }),
    description: text("description"),

    provider: providerEnum("provider").notNull(),
    // The unique identifier that the specific external provider expects.
    // e.g., Cartesia ID: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"
    // e.g., Cloudflare Model: "@cf/deepgram/aura-1"
    // e.g., OpenAI Model: "tts-1" + voice: "alloy"
    externalVoiceId: varchar("external_voice_id", { length: 500 }).notNull(),

    // Optional: local path key used if running local files
    voiceFileKey: varchar("voice_file_key", { length: 500 }),
    // Optional: URL for previewing the voice, especially useful for third-party voices
    previewFileUrl: text("preview_file_url"),

    // Provider-specific extra metadata that doesn't fit columns
    // Cartesia: { mode: "similarity", is_owner: false }
    // OpenAI:   { model: "tts-1-hd" }
    // Local:    { model_path: "/models/chatterbox/voice" }
    providerMetadata: jsonb("provider_metadata"), //? maybe need another schema for output options like speed, volume, container, encoding, sample_rate, etc. currently just put them in providerMetadata for simplicity, which sets every voice to have the same output config but can be customized per voice by setting different providerMetadata

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("voices_provider_idx").on(t.provider),
    index("voices_language_idx").on(t.language),
    // A provider should not have duplicate external IDs
    unique("voices_provider_external_id_unique").on(
      t.provider,
      t.externalVoiceId,
    ),
  ],
).enableRLS();
