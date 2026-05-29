// ! fix voice mapping, currently just use third party TTS' default voice for everything
//! Across playlist updates: gaps/jumps are allowed.
//! Inside one playlist: segment sequence numbers are implicitly consecutive from the starting MEDIA-SEQUENCE.

import { getDb, eq, sql } from "@audiobook/db/src/index";
import { segments } from "@audiobook/db/src/schema/segments";
import { voices } from "@audiobook/db/src/schema/voices";
import { audiobooks } from "@audiobook/db/src/schema/schema";
import { storage } from "../storage/storage";
import type { TTSJobData, VoiceMappingJobData } from "../types/jobs";

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

      //! don't load whole file into memory, stream line by line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue; // skip empty lines

        // extract speaker label
        const speakerMatch = line.match(/^\[(.*?)\]/);
        const emotionMatch = line.match(/^\[(?:.*?)\]\[(.*?)\]/); // matches the second tag if it exists
        const content = line.replace(/^(?:\[(?:.*?)\]){1,2}\s*/, ""); // remove one or two tags at the start of the line

        // const assignedVoiceId = "5ce3eabe-dcec-41a1-a394-79d1b30b74ad"; // default voice id
        const assignedVoiceId = "0b0db781-c8ab-4fb7-8885-d1dff2c98b66";

        const result = await db
          .insert(segments)
          .values({
            audiobookId,
            chunkIdx,
            segmentIdx: i,
            content: content, //? maybe put into S3
            rawSpeakerTag: speakerMatch ? speakerMatch[1] : "Unknown",
            // emotionTag: emotionMatch ? emotionMatch[1] : "Neutral",
            assignedVoiceId,
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
          `[voice-mapping queue] Mapped segment ${content} id: ${segmentId} idx: ${i} for tagged chunk ${chunkIdx} audiobook ${audiobookId}.`,
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
