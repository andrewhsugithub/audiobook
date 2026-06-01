import { Hono } from "hono";
import { storage } from "@audiobook/storage/src/storage.cf";
import { assets, audiobooks } from "@audiobook/db/src/schema/schema";
import { getDb, eq } from "@audiobook/db/src/index";
import type { ParserJobData } from "../types/jobs";

type Env = {
  Bindings: Cloudflare.Env;
};

const app = new Hono<Env>();

const UPLOAD_EXPIRY_SECONDS = 3600;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = ["application/pdf", "text/plain"];
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024; // 5MB (S3/R2 minimum per part)

app.post("/", async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const body = await c.req.json();

  const { fileName, userId, text, title, fileSizeBytes, author, description } =
    body;

  //  Validate userId, should check if userId exists in users table but skipping for now since we don't have real auth yet
  if (!userId || typeof userId !== "string") {
    return c.json({ error: "Missing required field: userId" }, 400);
  }

  const bucketName = c.env.RAW_BUCKET_NAME;
  const bookTitle = title || fileName || "Untitled Audiobook";

  //  Direct text path
  if (text && typeof text === "string") {
    if (text.length > MAX_FILE_SIZE_BYTES) {
      return c.json({ error: "Text content exceeds 100MB limit" }, 413);
    }

    console.log(
      `[upload] Direct text submission received for book upload. Bypassing multipart.`,
    );

    const textBytes = new TextEncoder().encode(text);
    const generatedFileName = `${crypto.randomUUID().slice(0, 8)}.txt`;

    const [{ id: bookId }] = await db
      .insert(audiobooks)
      .values({
        userId,
        title: bookTitle,
        author: author ?? null,
        description: description ?? null,
        status: "finished_upload",
        rawFileName: generatedFileName,
        rawFileSizeBytes: textBytes.length,
        mimeType: "text/plain",
      })
      .returning({ id: audiobooks.id });

    console.log(
      `[upload] Created audiobook record with ID: ${bookId} for direct text upload.`,
    );
    const textFileKey = `raw-uploads/${userId}/${bookId}/${generatedFileName}`;

    await db.insert(assets).values({
      audiobookId: bookId,
      type: "raw_upload",
      bucketName,
      s3Key: textFileKey,
      fileName: generatedFileName,
      mimeType: "text/plain",
      sizeBytes: textBytes.length,
      uploadStatus: "ready_to_upload",
    });

    await bucket.putObject(bucketName, textFileKey, text, "text/plain");

    await c.env.PARSER_QUEUE.send({
      audiobookId: bookId,
      userId,
      s3FileKey: textFileKey,
      fileName: generatedFileName,
    } satisfies ParserJobData);

    console.log(`[upload] Direct text upload for book ${bookId}`);

    return c.json({
      bookId,
      status: "finished_upload",
      strategy: "direct-write",
      fileKey: textFileKey,
    });
  }

  //  Multipart path
  if (!fileName || typeof fileName !== "string") {
    return c.json({ error: "Missing required field: fileName" }, 400);
  }

  if (!fileSizeBytes || typeof fileSizeBytes !== "number") {
    return c.json({ error: "Missing required field: fileSizeBytes" }, 400);
  }

  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return c.json({ error: "File exceeds 50MB size limit" }, 413);
  }

  const mimeType = fileName.endsWith(".pdf")
    ? "application/pdf"
    : fileName.endsWith(".txt")
      ? "text/plain"
      : null;

  if (!mimeType) {
    return c.json({ error: "Only PDF and TXT files are supported" }, 415);
  }

  const [{ id: bookId }] = await db
    .insert(audiobooks)
    .values({
      userId,
      title: bookTitle,
      author: author ?? null,
      description: description ?? null,
      status: "ready_to_upload",
      rawFileName: fileName,
      rawFileSizeBytes: fileSizeBytes,
      mimeType,
    })
    .returning({ id: audiobooks.id });

  console.log(
    `[upload] Created audiobook record with ID: ${bookId} for multipart upload.`,
  );

  const rawUploadKey = `raw-uploads/${userId}/${bookId}/${fileName}`;
  const uploadId = await bucket.initiateMultipartUpload(
    bucketName,
    rawUploadKey,
    mimeType,
  );

  const uploadExpiresAt = new Date(Date.now() + UPLOAD_EXPIRY_SECONDS * 1000);

  await db.insert(assets).values({
    audiobookId: bookId,
    type: "raw_upload",
    bucketName,
    s3Key: rawUploadKey,
    fileName,
    mimeType,
    sizeBytes: fileSizeBytes,
    uploadStatus: "pending_upload",
    uploadId,
    uploadExpiresAt,
  });

  console.log(`[upload] Initiated multipart upload for book ${bookId}`);

  return c.json({
    bookId,
    status: "ready_to_upload",
    strategy: "multipart",
    uploadId,
    fileKey: rawUploadKey,
    expiresAt: uploadExpiresAt.toISOString(),
  });
});

app.post("/get-presigned-urls", async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const body = await c.req.json();
  const { fileKey, uploadId, totalParts, bookId } = body;
  const bucketName = c.env.RAW_BUCKET_NAME;

  if (!fileKey || !uploadId || !totalParts || !bookId) {
    return c.json(
      {
        error: "Missing required fields: fileKey, uploadId, totalParts, bookId",
      },
      400,
    );
  }

  if (typeof totalParts !== "number" || totalParts < 1 || totalParts > 10000) {
    return c.json({ error: "totalParts must be between 1 and 10000" }, 400);
  }

  // Verify the upload exists and matches
  const [asset] = await db
    .select({ uploadId: assets.uploadId, uploadStatus: assets.uploadStatus })
    .from(assets)
    .where(eq(assets.audiobookId, bookId));

  if (!asset || asset.uploadId !== uploadId) {
    return c.json({ error: "Upload session not found or mismatched" }, 404);
  }

  if (asset.uploadStatus !== "pending_upload") {
    return c.json({ error: "Upload already completed or aborted" }, 409);
  }

  const presignedUrls = await bucket.getMultipartPresignedUrls(
    bucketName,
    fileKey,
    uploadId,
    totalParts,
    UPLOAD_EXPIRY_SECONDS,
  );

  return c.json({ presignedUrls });
});

app.post("/complete", async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const body = await c.req.json();
  const { uploadId, fileKey, parts, userId, bookId, fileName } = body;
  const bucketName = c.env.RAW_BUCKET_NAME;

  if (!uploadId || !fileKey || !parts || !bookId || !fileName) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // Validate parts array
  if (!Array.isArray(parts) || parts.length === 0) {
    return c.json({ error: "parts must be a non-empty array" }, 400);
  }

  const invalidPart = parts.find(
    (p) =>
      typeof p.partNumber !== "number" || typeof p.etag !== "string" || !p.etag,
  );

  if (invalidPart) {
    return c.json(
      { error: "Each part must have partNumber (number) and etag (string)" },
      400,
    );
  }

  // Verify asset record matches
  const [asset] = await db
    .select({ uploadId: assets.uploadId, uploadStatus: assets.uploadStatus })
    .from(assets)
    .where(eq(assets.audiobookId, bookId));

  if (!asset || asset.uploadId !== uploadId) {
    return c.json({ error: "Upload session not found" }, 404);
  }

  if (asset.uploadStatus !== "pending_upload") {
    return c.json({ error: "Upload already completed or aborted" }, 409);
  }

  try {
    await bucket.completeMultipartUpload(bucketName, fileKey, uploadId, parts);

    await db
      .update(audiobooks)
      .set({ status: "finished_upload" })
      .where(eq(audiobooks.id, bookId));

    await db
      .update(assets)
      .set({ uploadStatus: "finished_upload" })
      .where(eq(assets.audiobookId, bookId));

    await c.env.PARSER_QUEUE.send({
      audiobookId: bookId,
      userId,
      s3FileKey: fileKey,
      fileName,
    } satisfies ParserJobData);

    console.log(`[upload] Multipart complete for book ${bookId}`);

    return c.json({ ok: true, bookId, status: "processing" });
  } catch (error: any) {
    console.error(`[upload] Multipart complete failed:`, error);

    await db
      .update(audiobooks)
      .set({
        status: "failed",
        errorMessage: `Multipart assembly failure: ${error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(audiobooks.id, bookId));

    return c.json({ error: "Failed to assemble upload parts" }, 500);
  }
});

app.post("/abort", async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const body = await c.req.json();
  const { bookId, uploadId, fileKey } = body;
  const bucketName = c.env.RAW_BUCKET_NAME;

  if (!bookId || !uploadId || !fileKey) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    await bucket.abortMultipartUpload(bucketName, fileKey, uploadId);

    await db
      .update(audiobooks)
      .set({ status: "failed", errorMessage: "Upload aborted by user" })
      .where(eq(audiobooks.id, bookId));

    await db
      .update(assets)
      .set({ uploadStatus: "failed" })
      .where(eq(assets.audiobookId, bookId));

    return c.json({ ok: true });
  } catch (error: any) {
    console.error(`[upload] Abort failed:`, error);
    return c.json({ error: "Failed to abort upload" }, 500);
  }
});

export default app;
