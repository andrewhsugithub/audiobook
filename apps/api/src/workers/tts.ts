import { eq, getDb, sql } from "@audiobook/db/src";
import { storage } from "@audiobook/storage/src/storage.cf";
import {
  assets,
  audiobooks,
  segments,
  voices,
} from "@audiobook/db/src/schema/schema";
import type { HLSQueueJobData, TTSJobData } from "../types/jobs";

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
    const { audiobookId, segmentId, chunkIdx, segmentIdx } = message.body;

    console.log(
      `[tts queue] Processing segment ${segmentId} for book ${audiobookId} (Message: ${message.id})`,
    );

    if (
      !audiobookId ||
      !segmentId ||
      chunkIdx === undefined ||
      segmentIdx === undefined
    ) {
      console.error(`[tts queue] Invalid message body format.`, message.body);
      message.ack(); // Drop badly formatted messages
      continue;
    }

    try {
      const [result] = await db
        .select({
          // Segment columns
          content: segments.content,
          emotionTag: segments.emotionTag,
          rawSpeakerTag: segments.rawSpeakerTag,
          assignedVoiceId: segments.assignedVoiceId,
          // Voice columns
          voiceBucketName: voices.voiceBucketName,
          voiceFileKey: voices.voiceFileKey,
          externalVoiceId: voices.externalVoiceId,
          providerMetadata: voices.providerMetadata,
        })
        .from(segments)
        .leftJoin(voices, eq(segments.assignedVoiceId, voices.id))
        .where(eq(segments.id, segmentId));

      if (!result) {
        throw new Error(
          `[tts queue] Segment not found in database: ${segmentId}`,
        );
      }
      if (!result.content) {
        throw new Error(
          `[tts queue] Segment ${segmentId} contains no text content to synthesize.`,
        );
      }

      const {
        content,
        voiceBucketName,
        voiceFileKey,
        externalVoiceId,
        providerMetadata,
      } = result;

      const voiceId = externalVoiceId ?? "a167e0f3-df7e-4d52-a9c3-f949145efdab";
      const metadata = providerMetadata as any;
      if (voiceBucketName && voiceFileKey) {
        console.log(
          `[tts queue] 📥 Using custom voice clone asset from storage: ${voiceBucketName}/${voiceFileKey}`,
        );
      } else {
        console.log(
          `[tts queue] Using voice ID ${voiceId} and provider metadata ${JSON.stringify(metadata)} for segment ${segmentId}.`,
        );
      }

      //! note that tts outputs .wav -> stitch everything together into one .wav -> use ffmpeg to convert into hls
      // should build the content according to voiceId table, some may need [emotion]content, some may need [speaker][emotion]content or even ssml tags, etc. and pass the appropriate voice parameters to the TTS API
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
            id: externalVoiceId!,
          },
          output_format: metadata?.output_format || {
            container: "wav",
            encoding: "pcm_s16le",
            sample_rate: 44100,
          },
          language: "en",
          generation_config: metadata?.generation_config || {
            speed: 1,
            volume: 1,
            // emotion: emotionTag, // use ssml tags instead
          },
        }),
      });
      console.log(
        `[tts queue] Received response from Cartesia API sonic 3.5 for segment ${segmentId} chunk ${chunkIdx} segment ${segmentIdx} audiobook ${audiobookId}, status: ${response.status} response: ${response}`,
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Cartesia API Error (${response.status}): ${errorText} for segment ${segmentId} chunk ${chunkIdx} segment ${segmentIdx} audiobook ${audiobookId}`,
        );
      }

      const audioBuffer = await response.arrayBuffer();
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        throw new Error(
          `Received 0 bytes from Cartesia API for segment ${segmentId} audiobook ${audiobookId}`,
        );
      }

      const exactDurationSeconds = calculateDurationSeconds(
        audioBuffer.byteLength,
        metadata?.output_format?.sample_rate || 44100,
        metadata?.output_format?.encoding === "pcm_s16le" ? 2 : 2, // pcm_s16le is 16 bits = 2 bytes
        1,
      );

      console.log(
        `[tts queue] Segment ${segmentId} exact duration: ${exactDurationSeconds}s`,
      );

      const audioUint8 = new Uint8Array(audioBuffer);

      const audioS3Key = `audiobooks/${audiobookId}/segments/seg_${chunkIdx}_${segmentIdx}.wav`;

      await bucket.putObject(bucketName, audioS3Key, audioUint8, "audio/wav");

      await db.insert(assets).values({
        audiobookId,
        type: "tts_output",
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
          durationSeconds: exactDurationSeconds,
        })
        .where(eq(segments.id, segmentId));

      const [audiobook] = await db.transaction(async (tx) => {
        return await tx
          .update(audiobooks)
          .set({
            processedSegments: sql`${audiobooks.processedSegments} + 1`,
            totalDurationSeconds: sql`${audiobooks.totalDurationSeconds} + ${exactDurationSeconds}`,
          })
          .where(eq(audiobooks.id, audiobookId))
          .returning();
      });

      console.log(
        `[tts queue] ✓ Segment ${chunkIdx}_${segmentIdx} with id: ${segmentId} parsed to WAV & saved successfully for audiobook ${audiobookId}. S3 Key: ${audioS3Key} size: ${audioBuffer.byteLength} bytes.`,
      );

      // send to hls worker
      if (audiobook.processedSegments === audiobook.totalSegments) {
        console.log(
          `[tts queue] All segments for audiobook ${audiobookId} processed. Sending message to HLS queue.`,
        );
        const hlsJobData: HLSQueueJobData = { audiobookId };
        await env.HLS_QUEUE.send(hlsJobData);
      }

      message.ack();
    } catch (error) {
      console.error(`[tts queue] ✗ Message ${message.id} failed:`, error);

      await db
        .update(audiobooks)
        .set({
          status: "failed",
          errorMessage: `TTS Stage Failure: ${String(error)}`,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, audiobookId));

      // message.retry();
    }
  }
}

function calculateDurationSeconds(
  byteLength: number,
  sampleRate: number,
  bytesPerSample: number,
  channels: number,
): number {
  // Standard WAV files have a 44-byte metadata header.
  const WAV_HEADER_SIZE_BYTES = 44;
  const rawAudioBytes = Math.max(0, byteLength - WAV_HEADER_SIZE_BYTES); // Subtract WAV header
  return rawAudioBytes / (sampleRate * bytesPerSample * channels);
}
