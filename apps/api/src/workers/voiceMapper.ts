//! Across playlist updates: gaps/jumps are allowed.
//! Inside one playlist: segment sequence numbers are implicitly consecutive from the starting MEDIA-SEQUENCE.

import { getDb, eq, sql } from "@audiobook/db/src/index";
import { segments } from "@audiobook/db/src/schema/segments";
import { voices } from "@audiobook/db/src/schema/voices";
import { audiobooks } from "@audiobook/db/src/schema/schema";
import { storage } from "@audiobook/storage/src/storage.cf";
import type { TTSJobData, VoiceMappingJobData } from "../types/jobs";

const NARRATOR_TAG = "Narrator";

// Tagger emits `[Speaker] <emotion value="..."/> rest of line`.
// `[Speaker] rest of line` (no emotion tag) is also legal per the tagging prompt.
const SPEAKER_RE = /^\[([^\]]+)\]\s*/;
const EMOTION_RE = /^<emotion\s+value="([^"]+)"\s*\/>\s*/;

function parseTaggedLine(line: string): {
  speaker: string;
  emotion: string;
  content: string;
} {
  let rest = line;
  const speakerMatch = rest.match(SPEAKER_RE);
  const speaker = speakerMatch ? speakerMatch[1].trim() : "Unknown";
  if (speakerMatch) rest = rest.slice(speakerMatch[0].length);

  const emotionMatch = rest.match(EMOTION_RE);
  const emotion = emotionMatch ? emotionMatch[1].trim() : "neutral";
  if (emotionMatch) rest = rest.slice(emotionMatch[0].length);

  return { speaker, emotion, content: rest.trim() };
}

// Stable 32-bit FNV-1a so the same `(audiobookId, speakerTag)` always picks
// the same slot in the voice pool across chunks and re-runs.
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export async function handleVoiceMappingQueue(
  batch: MessageBatch<VoiceMappingJobData>,
  env: Cloudflare.Env,
) {
  console.log(
    `[voice-mapping queue] Received batch with ${batch.messages.length} messages, queue: ${batch.queue}`,
  );

  const db = getDb(env.HYPERDRIVE.connectionString);
  const bucketName = env.MEDIA_BUCKET_NAME;
  const bucket = storage.getInstance(env);

  for (const message of batch.messages) {
    const { audiobookId, chunkIdx, taggedS3Key } = message.body;

    console.log(
      `[voice-mapping queue] Processing tagged chunk ${chunkIdx} for book ${audiobookId} (Message: ${message.id})`,
    );

    if (!audiobookId || !taggedS3Key || chunkIdx === undefined) {
      console.error(
        `[voice-mapping queue] Invalid message body format.`,
        message.body,
      );
      message.ack();
      continue;
    }

    try {
      const textObject = await bucket.getObject(bucketName, taggedS3Key);
      if (!textObject) {
        throw new Error(`Tagged chunk file not found in S3: ${taggedS3Key}`);
      }

      const rawText = await textObject.transformToString();
      const lines = rawText.split("\n");

      // Load the Cartesia voice pool once per chunk. Narrator gets a reserved
      // slot (first voice); other speakers are hashed into the remaining pool
      // so the same character always maps to the same voice book-wide.
      const cartesiaVoices = await db
        .select({ id: voices.id })
        .from(voices)
        .where(eq(voices.provider, "cartesia"))
        .orderBy(voices.id);

      if (cartesiaVoices.length === 0) {
        throw new Error(
          "No Cartesia voices available in `voices` table — run db seed.",
        );
      }
      const narratorVoiceId = cartesiaVoices[0].id;
      const characterPool =
        cartesiaVoices.length > 1 ? cartesiaVoices.slice(1) : cartesiaVoices;

      const pickVoice = (speakerTag: string): string => {
        if (speakerTag === NARRATOR_TAG) return narratorVoiceId;
        const slot =
          fnv1a(`${audiobookId}:${speakerTag}`) % characterPool.length;
        return characterPool[slot].id;
      };

      //! don't load whole file into memory, stream line by line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue; // skip empty lines

        const { speaker, emotion, content } = parseTaggedLine(line);
        if (!content) continue; // tag-only line with no transcript

        const assignedVoiceId = pickVoice(speaker);

        const result = await db
          .insert(segments)
          .values({
            audiobookId,
            chunkIdx,
            segmentIdx: i,
            content, //? maybe put into S3
            rawSpeakerTag: speaker,
            emotionTag: emotion,
            assignedVoiceId,
          })
          .onConflictDoUpdate({
            target: [
              segments.audiobookId,
              segments.chunkIdx,
              segments.segmentIdx,
            ],
            set: {
              content,
              rawSpeakerTag: speaker,
              emotionTag: emotion,
              assignedVoiceId,
            },
          })
          .returning({ id: segments.id });

        const segmentId = result[0].id;

        await db.transaction(async (tx) => {
          await tx
            .update(audiobooks)
            .set({ totalSegments: sql`${audiobooks.totalSegments} + 1` })
            .where(eq(audiobooks.id, audiobookId));
        });

        console.log(
          `[voice-mapping queue] Mapped segment "${content}" id: ${segmentId} idx: ${i} speaker: ${speaker} emotion: ${emotion} voice: ${assignedVoiceId} for tagged chunk ${chunkIdx} audiobook ${audiobookId}.`,
        );

        const data: TTSJobData = {
          audiobookId,
          segmentId,
          chunkIdx,
          segmentIdx: i,
        };
        await env.TTS_QUEUE.send(data);
      }

      console.log(
        `[voice-mapping queue] ✓ Mapped ${lines.length} segments for tagged chunk ${chunkIdx} audiobook ${audiobookId} successfully.`,
      );
      message.ack();
    } catch (error) {
      console.error(
        `[voice-mapping queue] ✗ Message ${message.id} failed:`,
        error,
      );
      // message.retry();
    }
  }
}
