import { extractText, getDocumentProxy } from "unpdf";
import { assets, audiobooks } from "@audiobook/db/src/schema/schema";
import { eq } from "@audiobook/db/src/index";
import { storage } from "../storage/storage";
import { getDb } from "@audiobook/db/src/index";
import type { ChunkingJobData, ParserJobData } from "../types/jobs";

export async function handleParserQueue(
  batch: MessageBatch<ParserJobData>,
  env: Cloudflare.Env,
): Promise<void> {
  console.log(
    `[parser-queue] Processing batch of ${batch.messages.length} parsing tasks.`,
  );

  const bucket = storage.getInstance(env);
  const rawBucketName = env.RAW_BUCKET_NAME; //? maybe pass as message body?
  const db = getDb(env.HYPERDRIVE.connectionString);

  const processingPromises = batch.messages.map(async (message) => {
    const { audiobookId, s3FileKey, fileName } = message.body;
    console.log(
      `[parser-queue] Starting processing for book: ${audiobookId}, path: ${s3FileKey}`,
    );

    try {
      await db
        .update(audiobooks)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(audiobooks.id, audiobookId));

      const storageObject = await bucket.getObject(rawBucketName, s3FileKey);
      if (!storageObject) {
        throw new Error(
          `Target asset object not found in bucket for key: ${s3FileKey}`,
        );
      }

      let extractedTextContent = "";

      if (s3FileKey.toLowerCase().endsWith(".txt")) {
        console.log(
          `[parser-queue] Ends with .txt: Treating file asset as plain text: ${audiobookId}`,
        );
        extractedTextContent = await storageObject.transformToString();
      } else if (s3FileKey.toLowerCase().endsWith(".pdf")) {
        console.log(
          `[parser-queue] Ends with .pdf: Treating file asset as binary PDF: ${audiobookId}`,
        );

        const pdfArrayBuffer = await storageObject.transformToByteArray();
        const pdfDocument = await getDocumentProxy(pdfArrayBuffer);

        const { totalPages, text } = await extractText(pdfDocument, {
          mergePages: true,
        });
        extractedTextContent = text;

        console.log(
          `[parser-queue] Successfully extracted ${totalPages} pages from PDF.`,
        );
      } else {
        throw new Error(
          `Unsupported file extension format encountered for storage key: ${s3FileKey}`,
        );
      }

      if (!extractedTextContent || extractedTextContent.trim().length === 0) {
        console.warn(
          `[parser-queue] Text extraction sequence resulted in an empty text string output for book: ${audiobookId}`,
        );
      }

      const parsedS3TextKey = `audiobooks/${audiobookId}/${fileName.slice(0, -4)}-parsed.txt`;
      const parsedBucketName = env.MEDIA_BUCKET_NAME;
      await bucket.putObject(
        parsedBucketName,
        parsedS3TextKey,
        extractedTextContent,
        "text/plain",
      );

      await db
        .update(audiobooks)
        .set({
          updatedAt: new Date(),
          totalCharactersParsed: extractedTextContent.length,
        })
        .where(eq(audiobooks.id, audiobookId));

      await db.insert(assets).values({
        audiobookId,
        type: "parsed_text",
        bucketName: parsedBucketName,
        s3Key: parsedS3TextKey,
        fileName: `${fileName.slice(0, -4)}-parsed.txt`,
        mimeType: "text/plain",
        sizeBytes: new TextEncoder().encode(extractedTextContent).length,
      });

      console.log(
        `[parser-queue] Raw strings extracted and saved to cache path: ${parsedS3TextKey}`,
      );

      const data: ChunkingJobData = {
        audiobookId,
        parsedS3TextKey,
        totalCharacterCount: extractedTextContent.length,
      };
      await env.CHUNKING_QUEUE.send(data);

      message.ack();
      console.log(
        `[parser-queue] ✓ Book ${audiobookId} parsing sequence finished successfully.`,
      );
    } catch (error: any) {
      console.error(
        `[parser-queue] ✗ Failed processing pipeline element for book ${audiobookId}:`,
        error,
      );

      await db
        .update(audiobooks)
        .set({
          status: "failed",
          errorMessage: `Parsing Stage Failure: ${error.message}`,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, audiobookId));

      // message.retry();
    }
  });

  await Promise.all(processingPromises);
}
