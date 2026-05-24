import { audiobooks } from "@audiobook/db/src/db/schema/audiobook.js";
import { eq } from "@audiobook/db/src/index.js";
import { getDb } from "@audiobook/db/src/index.js";
import { storage } from "../storage/storage.js";
import { assets } from "@audiobook/db/src/db/schema/schema.js";

export interface ChunkingJobData {
  audiobookId: string;
  parsedS3TextKey: string;
  totalCharacterCount: number;
}

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
      await db
        .update(audiobooks)
        .set({
          status: "chunking",
          chunksBucketName: bucketName,
          chunksS3KeyPrefix: `audiobooks/${audiobookId}/chunks/`,
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
        const paddedIndex = String(i + 1).padStart(4, "0"); // start from 1 e.g. 0001
        const chunkS3Key = `audiobooks/${audiobookId}/chunks/chunk_${paddedIndex}.txt`; //? maybe don't need to save?

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
          fileName: `chunk_${paddedIndex}.txt`,
          sequenceNumber: i + 1,
          mimeType: "text/plain",
          sizeBytes: new TextEncoder().encode(textContent).length,
        });

        await env.TAGGING_QUEUE.send({
          audiobookId,
          chunkNumber: i + 1, // for calculating sequence number in hls downstream, note that hls starts from 0
          chunkS3Key: chunkS3Key,
        });
      }

      //! should track per chunk basis otherwise this only updates for one chunk what if other chunks failed
      await db
        .update(audiobooks)
        .set({
          status: "finished_chunking",
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
      message.retry();
    }
  });

  await Promise.all(processingPromises);
}
