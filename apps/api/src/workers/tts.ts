import { eq, getDb } from "@audiobook/db/src";
import { storage } from "../storage/storage";
import {
  assets,
  audiobooks,
  segments,
} from "@audiobook/db/src/db/schema/schema";

export interface TTSJobData {
  audiobookId: string;
  segmentId: string;
  // voiceId: string;
  hlsSequenceNumber: number;
}

export async function handleTTSQueue(
  batch: MessageBatch<TTSJobData>,
  env: Cloudflare.Env,
) {
  console.log(
    `[tts queue] Received batch with ${batch.messages.length} messages ${batch.metadata} ${batch.queue}`,
  );

  const db = getDb(env.HYPERDRIVE.connectionString);
  const bucketName = env.MEDIA_BUCKET_NAME;
  const bucket = storage.getInstance(env);
  for (const message of batch.messages) {
    const { audiobookId, segmentId, hlsSequenceNumber } = message.body;

    console.log(
      `[tts queue] Processing segment ${segmentId} for book ${audiobookId} (Message: ${message.id})`,
    );

    if (!audiobookId || !segmentId || hlsSequenceNumber === undefined) {
      console.error(`[tts queue] Invalid message body format.`, message.body);
      message.ack(); // Drop badly formatted messages
      continue;
    }

    try {
      await db
        .update(audiobooks)
        .set({ status: "synthesizing", updatedAt: new Date() })
        .where(eq(audiobooks.id, audiobookId));

      const [content, emotionTag, rawSpeakerTag] = await db
        .select()
        .from(segments)
        .where(eq(segments.id, segmentId))
        .then((res) => [
          res[0]?.content,
          res[0]?.emotionTag,
          res[0]?.rawSpeakerTag,
        ]);

      if (!content) {
        throw new Error(`Segment not found in DB: ${segmentId}`);
      }

      //! should get parameters from voice db table by voiceId once we have voice mapping working instead of hardcoding
      //! note that tts outputs .wav -> stitch everything together into one .wav -> use ffmpeg to convert into hls
      // should build the content according to voiceId table, some may need [emotion]content, some may need [speaker][emotion]content, etc. and pass the appropriate voice parameters to the TTS API
      // https://docs.cartesia.ai/api-reference/tts/bytes
      const response = await fetch(env.TTS_URL, {
        method: "POST",
        headers: {
          "Cartesia-Version": "2026-03-01",
          Authorization: `Bearer ${env.TTS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "sonic-3.5",
          transcript: content, // content without speaker/emotion tags
          voice: {
            mode: "id",
            id: "a167e0f3-df7e-4d52-a9c3-f949145efdab", // Default voice; replace dynamically later
          },
          output_format: {
            container: "wav",
            encoding: "pcm_s16le",
            sample_rate: 44100,
          },
          language: "en",
          generation_config: {
            speed: 1,
            volume: 1,
            emotion: emotionTag,
          },
        }),
      });
      console.log(
        `[tts queue] Received response from Cartesia API sonic 3.5 for segment ${segmentId} audiobook ${audiobookId}, status: ${response.status} response: ${response}`,
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Cartesia API Error (${response.status}): ${errorText} for segment ${segmentId} audiobook ${audiobookId}`,
        );
      }

      const audioBuffer = await response.arrayBuffer();
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        throw new Error(
          `Received 0 bytes from Cartesia API for segment ${segmentId} audiobook ${audiobookId}`,
        );
      }
      const audioUint8 = new Uint8Array(audioBuffer);

      const audioS3Key = `audiobooks/${audiobookId}/segments/seq_${hlsSequenceNumber}.wav`;

      await bucket.putObject(bucketName, audioS3Key, audioUint8, "audio/wav");

      await db.insert(assets).values({
        audiobookId,
        type: "raw_input",
        bucketName: bucketName,
        s3Key: audioS3Key,
        mimeType: "audio/wav",
        sizeBytes: audioBuffer.byteLength,
      });

      await db
        .update(segments)
        .set({
          audioSegmentS3Key: audioS3Key,
          bucketName: bucketName,
        })
        .where(eq(segments.id, segmentId));

      console.log(
        `[tts queue] ✓ Segment ${hlsSequenceNumber} parsed to WAV & saved successfully for audiobook ${audiobookId}. S3 Key: ${audioS3Key} size: ${audioBuffer.byteLength} bytes.`,
      );

      // send to hls worker for stitching once we have all segments ready

      message.ack();
    } catch (error) {
      console.error(`[tts queue] ✗ Message ${message.id} failed:`, error);

      await db
        .update(audiobooks)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(audiobooks.id, audiobookId));

      message.retry();
    }
  }
}

// import {
//   type TTSRequest,
//   type TTSResponse,
// } from "@audiobook/shared-libs/schema/tts.js";
// import { boss } from "../queue.js";
// import { generateAudio } from "../services/tts.js";

// export function startTTSWorker() {
//   boss.work<TTSRequest, TTSResponse>("tts", async ([job]) => {
//     console.log(`Starting job ${job.id} for tts queue`);
//     const result = await generateAudio(job.data);

//     console.log(`Job ${job.id} done in tts queue! Saved at: ${result.fileUrl}`);

//     return result;
//   });
// }
