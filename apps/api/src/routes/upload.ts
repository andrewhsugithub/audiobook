import { Hono } from "hono";
import { validator as sValidator, resolver, describeRoute } from "hono-openapi";
import { storage } from "@audiobook/storage/src/storage.cf";
import { assets, audiobooks } from "@audiobook/db/src/schema/schema";
import { getDb } from "@audiobook/db/src/index";
import { eq } from "@audiobook/db/src/index";
import type { ParserJobData } from "../types/jobs";

type Env = {
  Bindings: Cloudflare.Env;
};
const UPLOAD_EXPIRY_SECONDS = 3600;

const app = new Hono<Env>();

app.post("/", async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);

  const body = await c.req.json();
  const { fileName, userId, text, title, fileSizeBytes } = body;
  const bucketName = c.env.RAW_BUCKET_NAME;

  // fallback if frontend
  const bookTitle = title || fileName || `Audiobook-Generated`;
  const sizeBytes =
    fileSizeBytes || (text ? new TextEncoder().encode(text).length : 0);

  if (text && typeof text === "string") {
    console.log(
      `[upload] Direct text submission received for book upload. Bypassing multipart.`,
    );

    const fileName = crypto.randomUUID().slice(0, 8) + ".txt"; // generate random file name to avoid collisions

    const [{ id: bookId }] = await db
      .insert(audiobooks)
      .values({
        userId,
        title: bookTitle,
        status: "finished_upload",
      })
      .returning({ id: audiobooks.id });

    console.log(
      `[upload] Created audiobook record with ID: ${bookId} for direct text upload.`,
    );

    const textFileKey = `raw-uploads/${userId}/${bookId}/${fileName}`;

    await db.insert(assets).values({
      audiobookId: bookId,
      type: "raw_upload",
      bucketName,
      s3Key: textFileKey,
      fileName,
      mimeType: "text/plain",
      sizeBytes,
    });

    await bucket.putObject(bucketName, textFileKey, text, "text/plain");

    const data: ParserJobData = {
      audiobookId: bookId,
      userId,
      s3FileKey: textFileKey,
      fileName,
    };
    await c.env.PARSER_QUEUE.send(data);

    return c.json({
      bookId,
      status: "completed",
      strategy: "direct-write",
      fileKey: textFileKey,
      fileName,
    });
  }

  if (!fileName) {
    return c.json(
      { error: "Missing required property: fileName or text content" },
      400,
    );
  }

  const mimeType = fileName.endsWith(".pdf")
    ? "application/pdf"
    : "application/octet-stream"; // Adjust dynamically based on extension if needed

  const [{ id: bookId }] = await db
    .insert(audiobooks)
    .values({
      userId,
      title: bookTitle,
      status: "initiated",
    })
    .returning({ id: audiobooks.id });

  const rawUploadKey = `raw-uploads/${userId}/${bookId}/${fileName}`;
  const uploadId = await bucket.initiateMultipartUpload(
    bucketName,
    rawUploadKey,
    mimeType,
  );

  await db.insert(assets).values({
    audiobookId: bookId,
    type: "raw_upload",
    bucketName,
    s3Key: rawUploadKey,
    fileName,
    mimeType,
    sizeBytes,
    uploadId,
    uploadExpiresAt: new Date(Date.now() + UPLOAD_EXPIRY_SECONDS * 1000), // 1 hour expiry make sure match with presigned URL expiry
  });

  return c.json({
    bookId,
    status: "initialized",
    strategy: "multipart",
    uploadId,
    fileKey: rawUploadKey,
    fileName,
  });
});

app.post("/get-presigned-urls", async (c) => {
  const bucket = storage.getInstance(c.env);
  const body = await c.req.json();
  const { fileKey, uploadId, totalParts } = body;
  const bucketName = c.env.RAW_BUCKET_NAME;

  if (!fileKey || !uploadId || !totalParts) {
    return c.json(
      { error: "Missing required properties: fileKey, uploadId, totalParts" },
      400,
    );
  }

  try {
    const presignedUrls = await bucket.getMultipartPresignedUrls(
      bucketName,
      fileKey,
      uploadId,
      totalParts,
      UPLOAD_EXPIRY_SECONDS,
    );

    return c.json({ presignedUrls });
  } catch (error: any) {
    console.error(`[upload] Error generating presigned URLs:`, error);
    return c.json(
      { error: "Failed to generate presigned URLs", details: error.message },
      500,
    );
  }
});

app.post("/complete", async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);

  const body = await c.req.json();
  const { uploadId, fileKey, parts, userId, bookId, fileName } = body;
  const bucketName = c.env.RAW_BUCKET_NAME;

  try {
    await bucket.completeMultipartUpload(bucketName, fileKey, uploadId, parts);

    console.log(
      `[upload] Multipart completely assembled for key: ${fileKey}. Triggering pipeline processing.`,
    );

    await db
      .update(audiobooks)
      .set({
        status: "finished_upload",
        updatedAt: new Date(),
      })
      .where(eq(audiobooks.id, bookId));

    await c.env.PARSER_QUEUE.send({
      audiobookId: bookId,
      userId,
      s3FileKey: fileKey,
      fileName,
    });

    return c.json({
      success: true,
      message: "File uploaded and parsing scheduled",
    });
  } catch (error: any) {
    console.error(`[upload] Failed to assemble multipart transaction:`, error);

    await db
      .update(audiobooks)
      .set({
        status: "failed",
        errorMessage: `Multipart assembly failure: ${error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(audiobooks.id, bookId));

    return c.json(
      { error: "Failed assembling file parts", details: error.message },
      500,
    );
  }
});

export default app;
