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
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024; // 5MB S3/R2 minimum

// Normalise whatever shape the client sends into what every provider expects
function normalizeParts(
  parts: Array<{
    partNumber?: number;
    PartNumber?: number;
    etag?: string;
    ETag?: string;
  }>,
) {
  return parts
    .map((p) => ({
      PartNumber: p.PartNumber ?? p.partNumber,
      ETag: p.ETag ?? p.etag,
    }))
    .filter(
      (p): p is { PartNumber: number; ETag: string } =>
        typeof p.PartNumber === "number" &&
        typeof p.ETag === "string" &&
        p.ETag.length > 0,
    )
    .sort((a, b) => a.PartNumber - b.PartNumber); // S3 requires ascending order
}

function getMimeType(fileName: string): string | null {
  if (fileName.endsWith(".pdf")) return "application/pdf";
  if (fileName.endsWith(".txt")) return "text/plain";
  return null;
}

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
      return c.json({ error: "Text content exceeds 50MB limit" }, 413);
    }

    console.log("[upload] Direct text submission — bypassing multipart.");

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

    console.log(`[upload] Created audiobook ${bookId} for direct text.`);

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

    console.log(`[upload] Direct text queued for book ${bookId}`);

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

  const mimeType = getMimeType(fileName);
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

  console.log(`[upload] Created audiobook ${bookId} for multipart.`);

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

  console.log(
    `[upload] Initiated multipart upload for book ${bookId}, uploadId: ${uploadId}`,
  );

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

  console.log(
    `[upload] Generating ${totalParts} presigned URLs for book ${bookId}, uploadId: ${uploadId}`,
  );

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

  // ── Normalise camelCase → PascalCase and sort ─────────────────────────────
  // The client sends { partNumber, etag } but S3/R2 providers need { PartNumber, ETag }
  const normalizedParts = normalizeParts(parts);

  if (normalizedParts.length === 0) {
    console.error(
      "[upload] All parts were invalid after normalisation:",
      parts,
    );
    return c.json(
      {
        error:
          "No valid parts after normalisation — each part needs partNumber (number) and etag (non-empty string)",
      },
      400,
    );
  }

  if (normalizedParts.length !== parts.length) {
    console.warn(
      `[upload] ${parts.length - normalizedParts.length} parts dropped during normalisation`,
    );
  }

  console.log(
    `[upload] Completing multipart for book ${bookId} with ${normalizedParts.length} parts`,
    normalizedParts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
  );

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
    await bucket.completeMultipartUpload(
      bucketName,
      fileKey,
      uploadId,
      normalizedParts,
    );

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

    console.log(
      `[upload] Multipart complete for book ${bookId} — queued for parsing`,
    );

    return c.json({ ok: true, bookId, status: "processing" });
  } catch (error: any) {
    console.error("[upload] Multipart complete failed:", error);

    try {
      await bucket.abortMultipartUpload(bucketName, fileKey, uploadId);
      console.log(
        `[upload] Aborted dangling multipart upload for book ${bookId}`,
      );
    } catch (abortErr) {
      console.warn("[upload] Could not abort after failed complete:", abortErr);
    }

    await db
      .update(audiobooks)
      .set({
        status: "failed",
        errorMessage: `Multipart assembly failure: ${error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(audiobooks.id, bookId));

    await db
      .update(assets)
      .set({ uploadStatus: "failed" })
      .where(eq(assets.audiobookId, bookId));

    return c.json(
      { error: "Failed to assemble upload parts", details: error.message },
      500,
    );
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

  // Verify it's actually pending before trying to abort
  const [asset] = await db
    .select({ uploadStatus: assets.uploadStatus })
    .from(assets)
    .where(eq(assets.audiobookId, bookId));

  // If already finished/failed, just acknowledge — no need to call S3
  if (asset && asset.uploadStatus !== "pending_upload") {
    console.log(
      `[upload] Abort requested for book ${bookId} but status is already '${asset.uploadStatus}' — skipping S3 call`,
    );
    return c.json({ ok: true, skipped: true });
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

    console.log(`[upload] Aborted multipart upload for book ${bookId}`);

    return c.json({ ok: true });
  } catch (error: any) {
    // 404 from S3 = upload already gone (completed or previously aborted) — treat as success
    if (
      error?.Code === "NoSuchUpload" ||
      error?.$metadata?.httpStatusCode === 404
    ) {
      console.warn(
        `[upload] Abort 404 for book ${bookId} — upload already gone, marking failed anyway`,
      );

      await db
        .update(audiobooks)
        .set({
          status: "failed",
          errorMessage: "Upload aborted (session already expired)",
        })
        .where(eq(audiobooks.id, bookId));

      await db
        .update(assets)
        .set({ uploadStatus: "failed" })
        .where(eq(assets.audiobookId, bookId));

      return c.json({ ok: true, note: "Upload session was already gone" });
    }

    console.error("[upload] Abort failed:", error);
    return c.json(
      { error: "Failed to abort upload", details: error.message },
      500,
    );
  }
});

export default app;
