// ! fix voice mapping, currently just use third party TTS' default voice for everything
//! Across playlist updates: gaps/jumps are allowed.
//! Inside one playlist: segment sequence numbers are implicitly consecutive from the starting MEDIA-SEQUENCE.

import { getDb, eq } from "@audiobook/db/src/index";
import { segments } from "@audiobook/db/src/schema/segments";
import { providerEnum, voices } from "@audiobook/db/src/schema/voices";
import { audiobooks } from "@audiobook/db/src/schema/schema";
import { storage } from "../storage/storage";

export interface VoiceMappingJobData {
  audiobookId: string;
  taggedChunkNumber: number;
  taggedS3Key: string;
}

type Provider = (typeof providerEnum.enumValues)[number];
// const PROVIDER: Provider = "@cf/deepgram/aura-2-en"; //? maybe can be passed in the message body instead of hardcoding

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
    const { audiobookId, taggedChunkNumber, taggedS3Key } = message.body;

    console.log(
      `[voice-mapping queue] Processing tagged chunk ${taggedChunkNumber} for book ${audiobookId} (Message: ${message.id})`,
    );

    if (!audiobookId || !taggedS3Key || taggedChunkNumber === undefined) {
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

      await db
        .update(audiobooks)
        .set({ status: "mapping_voices", updatedAt: new Date() })
        .where(eq(audiobooks.id, audiobookId));

      const lines = rawText.split("\n");
      let localIndex = 0;

      //! don't load whole file into memory, stream line by line
      for (const line of lines) {
        if (!line.trim()) continue;

        // extract speaker label
        const speakerMatch = line.match(/^\[(.*?)\]/);
        const emotionMatch = line.match(/^\[(?:.*?)\]\[(.*?)\]/); // matches the second tag if it exists
        const content = line.replace(/^(?:\[(?:.*?)\]){1,2}\s*/, ""); // remove one or two tags at the start of the line

        const hlsSequenceNumber = taggedChunkNumber * 10_000 + localIndex; //! find a better way to handle this

        const result = await db
          .insert(segments)
          .values({
            audiobookId,
            hlsSequenceNumber,
            content: content, //? maybe put into S3
            rawSpeakerTag: speakerMatch ? speakerMatch[1] : "Unknown",
            emotionTag: emotionMatch ? emotionMatch[1] : "Neutral",
            // TODO:
            // voiceId: assignedVoiceId,
          })
          .returning({ id: segments.id });

        const segmentId = result[0].id;

        console.log(
          `[voice-mapping queue] Mapped segment ${content} ${segmentId} for tagged chunk ${taggedChunkNumber} audiobook ${audiobookId}.`,
        );

        await env.TTS_QUEUE.send({
          audiobookId,
          segmentId,
          content,
          //   voiceId: assignedVoiceId,
          hlsSequenceNumber,
        });

        localIndex++;
      }

      await db
        .update(audiobooks)
        .set({ status: "finished_mapping_voices", updatedAt: new Date() })
        .where(eq(audiobooks.id, audiobookId));

      console.log(
        `[voice-mapping queue] ✓ Mapped ${localIndex} segments for tagged chunk ${taggedChunkNumber} audiobook ${audiobookId} successfully.`,
      );
      message.ack();
    } catch (error) {
      console.error(
        `[voice-mapping queue] ✗ Message ${message.id} failed:`,
        error,
      );
      message.retry();
    }
  }
}
