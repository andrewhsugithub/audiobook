import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { storage } from "@audiobook/storage/src/storage.cf";
import { assets, audiobooks } from "@audiobook/db/src/schema/schema";
import { getDb, eq } from "@audiobook/db/src/index";
import type { ParserJobData } from "../types/jobs";
import type { Env } from "../types/env";
import { authMiddleware } from "../middleware/auth";
import { normalizeParts } from "../helpers/normalize";
import { getRawFileMimeType } from "../helpers/mime";
import {
  UPLOAD_EXPIRY_SECONDS,
  MAX_FILE_SIZE_BYTES,
} from "../constants/upload";

const app = new Hono<Env>();

const initiateSchema = z
  .object({
    title: z.string().optional(),
    author: z.string().optional(),
    description: z.string().optional(),
    text: z.string().max(MAX_FILE_SIZE_BYTES).optional(),
    fileName: z.string().optional(),
    fileSizeBytes: z.number().max(MAX_FILE_SIZE_BYTES).optional(),
  })
  .refine(
    (d) => d.text || (d.fileName && d.fileSizeBytes),
    "Provide either text or (fileName + fileSizeBytes)",
  );

const presignedSchema = z.object({
  fileKey: z.string().min(1),
  uploadId: z.string().min(1),
  totalParts: z.number().int().min(1).max(10_000),
  bookId: z.string().min(1),
});

const completeSchema = z.object({
  uploadId: z.string().min(1),
  fileKey: z.string().min(1),
  fileName: z.string().min(1),
  bookId: z.string().min(1),
  parts: z
    .array(
      z.object({
        partNumber: z.number().optional(),
        PartNumber: z.number().optional(),
        etag: z.string().optional(),
        ETag: z.string().optional(),
      }),
    )
    .min(1),
});

const abortSchema = z.object({
  bookId: z.string().min(1),
  uploadId: z.string().min(1),
  fileKey: z.string().min(1),
});

app.use("*", authMiddleware);

app.post("/", zValidator("json", initiateSchema), async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const body = c.req.valid("json");
  // userId from auth session — no longer trusted from request body
  const { id: userId } = c.var.authSession.user;
  const bucketName = c.env.RAW_BUCKET_NAME;

  const bookTitle = body.title ?? body.fileName ?? "Untitled Audiobook";

  if (body.text) {
    const textBytes = new TextEncoder().encode(body.text);
    const generatedFileName = `${crypto.randomUUID().slice(0, 8)}.txt`;

    const [{ id: bookId }] = await db
      .insert(audiobooks)
      .values({
        userId,
        title: bookTitle,
        author: body.author ?? null,
        description: body.description ?? null,
        status: "processing",
        rawFileName: generatedFileName,
        rawFileSizeBytes: textBytes.length,
        mimeType: "text/plain",
      })
      .returning({ id: audiobooks.id });

    const textFileKey = `raw-uploads/${userId}/${bookId}/${generatedFileName}`;

    await db.insert(assets).values({
      audiobookId: bookId,
      type: "raw_upload",
      bucketName,
      s3Key: textFileKey,
      fileName: generatedFileName,
      mimeType: "text/plain",
      sizeBytes: textBytes.length,
      uploadStatus: "finished_upload",
    });

    await bucket.putObject(bucketName, textFileKey, body.text, "text/plain");

    await c.env.PARSER_QUEUE.send({
      audiobookId: bookId,
      userId,
      s3FileKey: textFileKey,
      fileName: generatedFileName,
    } satisfies ParserJobData);

    return c.json({
      bookId,
      status: "finished_upload",
      strategy: "direct-write",
      fileKey: textFileKey,
    } as const);
  }

  // ── Multipart path ─────────────────────────────────────────────────────
  const fileName = body.fileName!;
  const fileSizeBytes = body.fileSizeBytes!;

  const mimeType = getRawFileMimeType(fileName);
  if (!mimeType) {
    return c.json({ error: "Only PDF and TXT files are supported" }, 415);
  }

  const [{ id: bookId }] = await db
    .insert(audiobooks)
    .values({
      userId,
      title: bookTitle,
      author: body.author ?? null,
      description: body.description ?? null,
      status: "ready_to_upload",
      rawFileName: fileName,
      rawFileSizeBytes: fileSizeBytes,
      mimeType,
    })
    .returning({ id: audiobooks.id });

  const rawUploadKey = `raw-uploads/${userId}/${bookId}/${fileName}`;
  const uploadId = await bucket.initiateMultipartUpload(
    bucketName,
    rawUploadKey,
    mimeType,
  );

  const uploadExpiresAt = new Date(Date.now() + UPLOAD_EXPIRY_SECONDS * 1_000);

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

  return c.json(
    {
      bookId,
      status: "ready_to_upload",
      strategy: "multipart",
      uploadId,
      fileKey: rawUploadKey,
      expiresAt: uploadExpiresAt.toISOString(),
    } as const,
    200,
    {
      "Cache-Control": "private, no-store",
    },
  );
});

app.post(
  "/get-presigned-urls",
  zValidator("json", presignedSchema),
  async (c) => {
    const bucket = storage.getInstance(c.env);
    const db = getDb(c.env.HYPERDRIVE.connectionString);
    const { fileKey, uploadId, totalParts, bookId } = c.req.valid("json");
    const bucketName = c.env.RAW_BUCKET_NAME;

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

    return c.json({ presignedUrls }, 200, {
      "Cache-Control": "private, no-store",
    });
  },
);

app.post("/complete", zValidator("json", completeSchema), async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { uploadId, fileKey, parts, bookId, fileName } = c.req.valid("json");
  const { id: userId } = c.var.authSession.user;
  const bucketName = c.env.RAW_BUCKET_NAME;

  const normalizedParts = normalizeParts(parts);
  if (normalizedParts.length === 0) {
    return c.json(
      {
        error:
          "No valid parts after normalisation — each part needs partNumber (number) and etag (non-empty string)",
      },
      400,
    );
  }

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

  await bucket.completeMultipartUpload(
    bucketName,
    fileKey,
    uploadId,
    normalizedParts,
  );

  await db
    .update(audiobooks)
    .set({ status: "processing" })
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

  return c.json({ ok: true, bookId, status: "finished_upload" } as const, 200, {
    "Cache-Control": "private, no-store",
  });
});

app.post("/abort", zValidator("json", abortSchema), async (c) => {
  const bucket = storage.getInstance(c.env);
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { bookId, uploadId, fileKey } = c.req.valid("json");
  const bucketName = c.env.RAW_BUCKET_NAME;

  const [asset] = await db
    .select({ uploadStatus: assets.uploadStatus })
    .from(assets)
    .where(eq(assets.audiobookId, bookId));

  if (asset && asset.uploadStatus !== "pending_upload") {
    return c.json({ ok: true, skipped: true });
  }

  try {
    await bucket.abortMultipartUpload(bucketName, fileKey, uploadId);

    await Promise.all([
      db
        .update(audiobooks)
        .set({ status: "failed", errorMessage: "Upload aborted by user" })
        .where(eq(audiobooks.id, bookId)),
      db
        .update(assets)
        .set({ uploadStatus: "failed" })
        .where(eq(assets.audiobookId, bookId)),
    ]);

    return c.json({ ok: true }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (err: any) {
    if (
      err?.Code === "NoSuchUpload" ||
      err?.$metadata?.httpStatusCode === 404
    ) {
      await Promise.all([
        db
          .update(audiobooks)
          .set({
            status: "failed",
            errorMessage: "Upload aborted (session already expired)",
          })
          .where(eq(audiobooks.id, bookId)),
        db
          .update(assets)
          .set({ uploadStatus: "failed" })
          .where(eq(assets.audiobookId, bookId)),
      ]);
      return c.json(
        { ok: true, note: "Upload session was already gone" },
        200,
        {
          "Cache-Control": "private, no-store",
        },
      );
    }
    throw err; // bubble up to globalErrorHandler
  }
});

export default app;
