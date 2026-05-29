import { audiobooks } from "@audiobook/db/src/schema/audiobook";
import { eq } from "@audiobook/db/src/index";
import { getDb } from "@audiobook/db/src/index";
import { storage } from "@audiobook/storage/src/storage.cf";
import { assets } from "@audiobook/db/src/schema/schema";
import type { LLMTagJobData, ChunkingJobData } from "../types/jobs";

// set maybe smaller to leave room for system prompt and ouput tokens
const MAX_CHUNK_LENGTH = 2048;

function estimateTokens(text: string): number {
  // Split by whitespace to count words roughly
  const wordCount = text.trim().split(/\s+/).length;
  // Approximation: average english word is ~1.5 - 2 tokens
  return Math.floor(wordCount * 2);
}

function chunkTextSemantic(
  text: string,
  maxTokens: number = MAX_CHUNK_LENGTH,
): string[] {
  const pattern =
    /(?<!\b(?:Mr|Mrs|Dr|Prof|Sr|Jr|Ms))\.(?=\s+[“"A-Z])|(?<=[!?])\s+(?=["“A-Z])|(?<=[.!?][”"’])\s+(?=["“A-Z])/;
  const semanticBlocks = text.split(pattern);
  const pronounPattern =
    /\b(he|she|it|they|him|her|them|his|hers|its|their|theirs|these|those)\b/i;

  const chunks: string[] = [];
  let currentChunk = "";
  const countChar = (str: string, char: string) => str.split(char).length - 1;

  for (let block of semanticBlocks) {
    if (!block) continue;
    const blockWithSpace = block.trim() + " ";
    const blockTokens = estimateTokens(blockWithSpace);

    const isCurlyBalanced =
      countChar(currentChunk, "“") === countChar(currentChunk, "”");
    const isStraightBalanced = countChar(currentChunk, '"') % 2 === 0;
    const isBalanced = isCurlyBalanced && isStraightBalanced;
    const hasPronounCurrent = pronounPattern.test(blockWithSpace);

    if (!isBalanced || (hasPronounCurrent && currentChunk.trim() !== "")) {
      currentChunk += blockWithSpace;
      continue;
    }
    const currentTokens = estimateTokens(currentChunk);

    if (currentTokens + blockTokens > maxTokens) {
      if (currentChunk.trim() !== "") {
        chunks.push(currentChunk.trim());
      }
      currentChunk = blockWithSpace;
    } else {
      currentChunk += blockWithSpace;
    }
  }

  if (currentChunk.trim() !== "") {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function handleChunkingQueue(
  batch: MessageBatch<ChunkingJobData>,
  env: Cloudflare.Env,
): Promise<void> {
  console.log(
    `[chunking-queue] Processing batch of ${batch.messages.length} chunking tasks.`,
  );
  console.log(
    `[chunking-queue] Chunking length set to ${MAX_CHUNK_LENGTH} tokens as default. Adjust as needed based on your LLM's token limits and desired chunk sizes.`,
  );

  const bucket = storage.getInstance(env);
  const bucketName = env.MEDIA_BUCKET_NAME;
  const db = getDb(env.HYPERDRIVE.connectionString);

  const processingPromises = batch.messages.map(async (message) => {
    const { audiobookId, parsedS3TextKey } = message.body;
    console.log(`[chunking-queue] Chunking book: ${audiobookId}`);

    try {
      //? maybe put this in initial audiobook creation instead of updating here
      await db
        .update(audiobooks)
        .set({
          chunksBucketName: bucketName,
          chunksS3KeyPrefix: `audiobooks/${audiobookId}/chunks/`,
          segmentsBucketName: bucketName,
          segmentsS3KeyPrefix: `audiobooks/${audiobookId}/segments/`,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, audiobookId));

      const storageObject = await bucket.getObject(bucketName, parsedS3TextKey);
      if (!storageObject)
        throw new Error(`Parsed text file not found: ${parsedS3TextKey}`);

      const fullText = await storageObject.transformToString();

      // Split the document using the semantic token-based chunking
      const chunks = chunkTextSemantic(fullText, 2000); // 2000 tokens limit per chunk
      console.log(
        `[chunking-queue] Split into ${chunks.length} semantic chunks.`,
      );

      for (let i = 0; i < chunks.length; i++) {
        const textContent = chunks[i];

        // Save the chunk payload to S3 to bypass Queue limits (max 128kb string size)
        const chunkS3Key = `audiobooks/${audiobookId}/chunks/chunk_${i + 1}.txt`; //? maybe don't need to save?

        await bucket.putObject(
          bucketName,
          chunkS3Key,
          textContent,
          "text/plain",
        );

        await db.insert(assets).values({
          audiobookId,
          type: "chunk_text",
          bucketName,
          s3Key: chunkS3Key,
          fileName: `chunk_${i + 1}.txt`,
          sequenceNumber: i + 1,
          mimeType: "text/plain",
          sizeBytes: new TextEncoder().encode(textContent).length,
        });

        const data: LLMTagJobData = {
          audiobookId,
          chunkIdx: i + 1, // for ordering
          chunkS3Key,
        };
        await env.TAGGING_QUEUE.send(data);
      }

      await db
        .update(audiobooks)
        .set({
          totalChunks: chunks.length,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, audiobookId));

      message.ack();
      console.log(
        `[chunking-queue] ✓ Book ${audiobookId} chunking finished successfully.`,
      );
    } catch (error: any) {
      console.error(
        `[chunking-queue] ✗ Failed for book ${audiobookId}:`,
        error,
      );
      await db
        .update(audiobooks)
        .set({
          status: "failed",
          errorMessage: `Chunking Stage Failure: ${error.message}`,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, audiobookId));
      // message.retry();
    }
  });

  await Promise.all(processingPromises);
}
