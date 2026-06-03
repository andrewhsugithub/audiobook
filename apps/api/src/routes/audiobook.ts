import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { eq, ilike, or, desc, and, asc, sql } from "@audiobook/db/src/index";
import { getDb } from "@audiobook/db/src";
import { assets, audiobooks } from "@audiobook/db/src/schema/schema";
import { storage } from "@audiobook/storage/src/storage.cf";
import type { Env } from "../types/env";
import { authMiddleware } from "../middleware/auth";
import { swrCache } from "../middleware/swr-cache";
import {
  TOKEN_TTL,
  MAX_SESSION_TTL,
  PRE_REFRESH_BUFFER,
} from "../constants/session";
import {
  CACHE_CONTROL_IMMUTABLE,
  CACHE_CONTROL_PLAYLIST,
} from "../constants/cache";
import { ALLOWED_ORIGINS } from "../constants/cors";
import { getHlsCookieName, getHlsCookieOptions } from "../helpers/cookie";
import { getMimeType, getSegmentContentType } from "../helpers/mime";
import { buildCacheKey, bustInfoCache } from "../helpers/cache";
import {
  MAX_FILE_SIZE_BYTES,
  UPLOAD_EXPIRY_SECONDS,
} from "../constants/upload";
import { ParserJobData } from "../types/jobs";

const app = new Hono<Env>();

// IMAGE HASHING
async function computeBufferHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12); // 12-char string is more than enough for unique asset paths
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  ratings: z.number().min(0).max(5).optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

const searchSchema = z.object({
  q: z.string().default(""),
  limit: z.coerce.number().min(1).max(50).default(30),
  offset: z.coerce.number().min(0).default(0),
  sort: z
    .enum(["recent", "title-asc", "title-desc", "author-asc", "rating-desc"])
    .default("recent"),
  completeOnly: z
    .string()
    .transform((v) => v === "true")
    .default(false),
});

// METADATA ENDPOINT WITH ETAG SWR VALIDATION
app.get(
  "/:id/info",
  swrCache({ freshTtl: 3_600, staleTtl: 86_400 }),
  async (c) => {
    const audiobookId = c.req.param("id");
    const db = getDb(c.env.HYPERDRIVE.connectionString);

    let currentUserId: string | null = null;
    let isAdmin = false;

    try {
      const { createAuth } = await import("../lib/auth");

      const auth = createAuth(c.env);

      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (session?.user) {
        currentUserId = session.user.id;
        isAdmin = session.user.role === "admin";
      }
    } catch {
      // Unauthenticated => guest
    }

    const [book] = await db
      .select({
        id: audiobooks.id,
        status: audiobooks.status,
        title: audiobooks.title,
        author: audiobooks.author,
        description: audiobooks.description,
        coverBucketName: audiobooks.coverBucketName,
        coverS3Key: audiobooks.coverS3Key,
        ratings: audiobooks.ratings,
        errorMessage: audiobooks.errorMessage,
        visibility: audiobooks.visibility,
        userId: audiobooks.userId,
        updatedAt: audiobooks.updatedAt, // Retrieved to make our ETag dynamic
      })
      .from(audiobooks)
      .where(eq(audiobooks.id, audiobookId));

    if (!book) return c.json({ error: "Audiobook not found" }, 404);

    // Block access to other people's private books except for admins
    if (
      book.visibility === "private" &&
      book.userId !== currentUserId &&
      !isAdmin
    ) {
      return c.json({ error: "Audiobook not found" }, 404); // 404 not 403 — don't leak existence
    }

    let coverUrl = `${c.env.RANDOM_COVER_BASE_URL}/${book.id}/300/450`;
    if (book.coverBucketName && book.coverS3Key) {
      const baseUrl = new URL(c.req.url).origin;
      // Pull exact versioned hashed filename from S3 key store path
      const filename = book.coverS3Key.split("/").pop();
      coverUrl = `${baseUrl}/cover/${book.id}/${filename}`;
    }

    const responseData = {
      id: book.id,
      status: book.status,
      title: book.title,
      author: book.author,
      description: book.description,
      ratings: book.ratings,
      coverUrl,
      isReady: book.status === "completed",
      errorMessage: book.errorMessage,
      visibility: book.visibility,
      isOwner: currentUserId ? book.userId === currentUserId : false,
      updatedAt: book.updatedAt,
    };

    // Cloudflare prefers Weak ETags W/"..." if features like Brotli compression are active.
    // const eTagValue = await generateETag(responseData);
    const eTagValue = `W/"${book.id}-${book.updatedAt}-${currentUserId ?? "guest"}"`;

    if (c.req.header("If-None-Match") === eTagValue) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: eTagValue,
          "Cache-Control": "no-cache, must-revalidate",
        },
      });
    }

    return c.json(responseData, 200, {
      "Cache-Control": "no-cache, must-revalidate",
      ETag: eTagValue,
    });
  },
);

// Short-lived — polling endpoint, no caching
app.get("/:id/status", async (c) => {
  const audiobookId = c.req.param("id");
  const db = getDb(c.env.HYPERDRIVE.connectionString);

  const [book] = await db
    .select({
      id: audiobooks.id,
      status: audiobooks.status,
      processedSegments: audiobooks.processedSegments,
      totalSegments: audiobooks.totalSegments,
      totalDurationSeconds: audiobooks.totalDurationSeconds,
      errorMessage: audiobooks.errorMessage,
    })
    .from(audiobooks)
    .where(eq(audiobooks.id, audiobookId));

  if (!book) return c.json({ error: "Audiobook not found" }, 404);

  const progress =
    book.totalSegments && book.totalSegments > 0
      ? Math.round((book.processedSegments! / book.totalSegments) * 100)
      : 0;

  return c.json(
    {
      id: book.id,
      status: book.status,
      durationSeconds: book.totalDurationSeconds,
      progress,
      isReady: book.status === "completed",
      errorMessage: book.errorMessage,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

app.post("/:id/session", async (c) => {
  const audiobookId = c.req.param("id");
  const db = getDb(c.env.HYPERDRIVE.connectionString);

  const [book] = await db
    .select({ status: audiobooks.status })
    .from(audiobooks)
    .where(eq(audiobooks.id, audiobookId));

  if (!book || book.status !== "completed") {
    return c.json({ error: "Audiobook processing incomplete" }, 404);
  }

  const now = Math.floor(Date.now() / 1_000);

  const token = await sign(
    {
      sub: audiobookId,
      iat: now,
      exp: now + TOKEN_TTL,
      maxEnd: now + MAX_SESSION_TTL,
    },
    c.env.TOKEN_SECRET,
    "HS256",
  );

  setCookie(
    c,
    getHlsCookieName(audiobookId),
    token,
    getHlsCookieOptions(c, audiobookId, TOKEN_TTL),
  );

  return c.json({
    ok: true,
    expiresIn: TOKEN_TTL,
    expiresAt: new Date((now + TOKEN_TTL) * 1_000).toISOString(),
    refreshAt: new Date(
      (now + TOKEN_TTL - PRE_REFRESH_BUFFER) * 1_000,
    ).toISOString(),
  });
});

app.post("/:id/refresh", async (c) => {
  const audiobookId = c.req.param("id");
  const currentToken = getCookie(c, getHlsCookieName(audiobookId));

  if (!currentToken)
    return c.json({ error: "Active streaming session missing" }, 401);

  let payload: Awaited<ReturnType<typeof verify>>;

  try {
    payload = await verify(currentToken, c.env.TOKEN_SECRET, "HS256");
  } catch {
    deleteCookie(c, getHlsCookieName(audiobookId), {
      path: `/audiobook/${audiobookId}`,
    });
    return c.json({ error: "Session verification failed" }, 401);
  }

  if (payload.sub !== audiobookId)
    return c.json({ error: "Scope mismatch" }, 403);

  const now = Math.floor(Date.now() / 1_000);

  if (payload.maxEnd && now > (payload.maxEnd as number)) {
    deleteCookie(c, getHlsCookieName(audiobookId), {
      path: `/audiobook/${audiobookId}`,
    });
    return c.json(
      { error: "Session expired or capped. Please re-authenticate." },
      401,
    );
  }

  const newToken = await sign(
    {
      sub: audiobookId,
      iat: now,
      exp: now + TOKEN_TTL,
      maxEnd: payload.maxEnd, // preserve hard cap
    },
    c.env.TOKEN_SECRET,
    "HS256",
  );

  setCookie(
    c,
    getHlsCookieName(audiobookId),
    newToken,
    getHlsCookieOptions(c, audiobookId, TOKEN_TTL),
  );

  return c.json({
    ok: true,
    expiresIn: TOKEN_TTL,
    expiresAt: new Date((now + TOKEN_TTL) * 1_000).toISOString(),
    refreshAt: new Date(
      (now + TOKEN_TTL - PRE_REFRESH_BUFFER) * 1_000,
    ).toISOString(),
  });
});

app.get("/:id/:filename{.+}", async (c) => {
  const audiobookId = c.req.param("id");
  const filename = c.req.param("filename");
  const origin = c.req.header("Origin") ?? "";
  const rangeHeader = c.req.header("Range");

  const sessionToken = getCookie(c, getHlsCookieName(audiobookId));
  if (!sessionToken) return c.json({ error: "Unauthorized access" }, 401);

  try {
    const payload = await verify(sessionToken, c.env.TOKEN_SECRET, "HS256");
    if (payload.sub !== audiobookId)
      return c.json({ error: "Scope mismatch" }, 403);
  } catch {
    return c.json({ error: "Session verification expired" }, 401);
  }

  const isPlaylist = filename.endsWith(".m3u8");

  // Always-dynamic CORS headers — never stored in the CDN cache
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin as any)
      ? origin
      : "",
    "Access-Control-Allow-Credentials": "true",
  };

  // ── Cache check (segments only, no range, no playlists) ─────────────────
  const cache = caches.default;

  let cacheKey: Request | null = null;
  try {
    cacheKey = buildCacheKey(c.req.url);
  } catch (e) {
    // Malformed URL — skip caching entirely, still serve the asset
    console.warn("[get-file] Could not build cache key, bypassing cache:", e);
  }

  if (!isPlaylist && !rangeHeader && cacheKey) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          status: cached.status,
          headers: {
            ...Object.fromEntries(cached.headers.entries()),
            ...corsHeaders,
            "X-Cache-Status": "HIT",
          },
        });
      }
    } catch (e) {
      console.warn("[get-file] Cache read failed, falling through to S3:", e);
    }
  }

  // ── S3 upstream retrieval ────────────────────────────────────────────────
  const store = storage.getInstance(c.env);
  const s3Key = `audiobooks/${audiobookId}/hls/${filename}`;

  const s3Object = await store.getObjectWithRange(
    c.env.MEDIA_BUCKET_NAME,
    s3Key,
    rangeHeader ?? undefined,
  );

  if (!s3Object) return c.json({ error: "Media asset not found" }, 404);

  // ── Serve HLS playlist manifest (never cache) ────────────────────────────
  if (isPlaylist) {
    return new Response(s3Object.stream, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": CACHE_CONTROL_PLAYLIST,
        "X-Cache-Status": "MISS",
        ...corsHeaders,
      },
    });
  }

  // ── Serve range requests (206 Partial Content) ───────────────────────────
  if (rangeHeader && s3Object.rangeResponse) {
    const { start, end, total } = s3Object.rangeResponse;
    return new Response(s3Object.stream, {
      status: 206,
      headers: {
        "Content-Type": getSegmentContentType(filename),
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": CACHE_CONTROL_IMMUTABLE,
        "X-Cache-Status": "MISS",
        ...corsHeaders,
      },
    });
  }

  // ── Serve & cache full segment (200 OK) ──────────────────────────────────
  // CORS headers are intentionally EXCLUDED from the cached entry to prevent
  // CORS cache poisoning — they are added dynamically after every cache read.
  const responseForCache = new Response(s3Object.stream, {
    status: 200,
    headers: {
      "Content-Type": getSegmentContentType(filename),
      "Cache-Control": CACHE_CONTROL_IMMUTABLE,
      "Accept-Ranges": "bytes",
    },
  });

  const [clientStream, cacheStream] = responseForCache.body!.tee();

  // Only attempt cache write if we have a valid key
  if (cacheKey) {
    c.executionCtx.waitUntil(
      cache
        .put(
          cacheKey,
          new Response(cacheStream, { headers: responseForCache.headers }),
        )
        .catch((e) => console.warn("[get-file] Cache write failed:", e)),
    );
  } else {
    // Drain unused stream branch to avoid memory leak
    c.executionCtx.waitUntil(cacheStream.cancel().catch(() => {}));
  }

  return new Response(clientStream, {
    status: 200,
    headers: {
      ...Object.fromEntries(responseForCache.headers.entries()),
      ...corsHeaders,
      "X-Cache-Status": "MISS",
    },
  });
});

app.get("/search", zValidator("query", searchSchema), async (c) => {
  const { q: query, limit, offset, sort, completeOnly } = c.req.valid("query");
  const db = getDb(c.env.HYPERDRIVE.connectionString);

  // Try to get the current user from the session cookie (optional auth)
  let currentUserId: string | null = null;
  let isAdmin = false;

  try {
    // reuse authMiddleware logic inline — peek at the session without hard-failing
    const { createAuth } = await import("../lib/auth");

    const auth = createAuth(c.env);

    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      currentUserId = session.user.id;
      isAdmin = session.user.role === "admin";
    }
  } catch {
    // unauthenticated => guest
  }

  // Build visibility filter:
  // - Admin: see everything
  // - Logged in: public books + own private books
  // - Guest: public books only
  const visibilityFilter = isAdmin
    ? undefined // no filter
    : currentUserId
      ? or(
          eq(audiobooks.visibility, "public"),
          and(
            eq(audiobooks.visibility, "private"),
            eq(audiobooks.userId, currentUserId),
          ),
        )
      : eq(audiobooks.visibility, "public");

  const baseCondition = completeOnly
    ? and(eq(audiobooks.status, "completed"), visibilityFilter)
    : visibilityFilter;

  const searchCondition =
    query.length > 0
      ? and(
          baseCondition,
          or(
            ilike(audiobooks.title, `%${query}%`),
            ilike(audiobooks.author, `%${query}%`),
          ),
        )
      : baseCondition;

  // Map the requested sort to an ORDER BY clause. Default ("recent") keeps the
  // original behaviour: completed books first, then most recently updated.
  const orderBy =
    sort === "title-asc"
      ? [asc(audiobooks.title)]
      : sort === "title-desc"
        ? [desc(audiobooks.title)]
        : sort === "author-asc"
          ? [sql`${audiobooks.author} ASC NULLS LAST`]
          : sort === "rating-desc"
            ? [sql`${audiobooks.ratings} DESC NULLS LAST`]
            : [
                asc(
                  sql`CASE WHEN ${audiobooks.status} = 'completed' THEN 0 ELSE 1 END`,
                ),
                desc(audiobooks.updatedAt),
              ];

  // Run the page query and a matching count query in parallel so the client
  // gets a real total to paginate against (not just the current page length).
  const [results, countRows] = await Promise.all([
    db
      .select({
        id: audiobooks.id,
        title: audiobooks.title,
        author: audiobooks.author,
        description: audiobooks.description,
        ratings: audiobooks.ratings,
        coverBucketName: audiobooks.coverBucketName,
        coverS3Key: audiobooks.coverS3Key,
        status: audiobooks.status,
        visibility: audiobooks.visibility,
        userId: audiobooks.userId,
      })
      .from(audiobooks)
      .where(searchCondition)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(audiobooks)
      .where(searchCondition),
  ]);

  const total = countRows[0]?.total ?? 0;

  const baseUrl = new URL(c.req.url).origin;

  const mapped = results.map((book) => {
    let coverUrl = `${c.env.RANDOM_COVER_BASE_URL}/${book.id}/300/450`;
    if (book.coverBucketName && book.coverS3Key) {
      const filename = book.coverS3Key.split("/").pop();
      coverUrl = `${baseUrl}/cover/${book.id}/${filename}`;
    }
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      ratings: book.ratings,
      coverUrl,
      status: book.status,
      visibility: book.visibility,
      isOwner: currentUserId ? book.userId === currentUserId : false,
    };
  });

  return c.json({
    results: mapped,
    total,
    query,
    limit,
    offset,
  });
});

app.patch("/:id", authMiddleware, async (c) => {
  const audiobookId = c.req.param("id");
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { id: userId, role } = c.var.authSession.user;
  const isAdmin = role === "admin";

  const [book] = await db
    .select({
      id: audiobooks.id,
      userId: audiobooks.userId,
      visibility: audiobooks.visibility,
    })
    .from(audiobooks)
    .where(eq(audiobooks.id, audiobookId));

  if (!book) return c.json({ error: "Audiobook not found" }, 404);

  // Only owner or admin can edit
  if (!isAdmin && book.userId !== userId) {
    return c.json({ error: "Forbidden — you don't own this book" }, 403);
  }

  // Public books can only be edited by admins or owners
  if (book.visibility === "public" && !isAdmin && book.userId !== userId) {
    return c.json(
      {
        error:
          "Forbidden — public books can only be edited by admins or owners",
      },
      403,
    );
  }

  const contentType = c.req.header("Content-Type") ?? "";

  let fields: {
    title?: string;
    author?: string;
    description?: string;
    ratings?: number;
    visibility?: "public" | "private";
  } = {};

  let coverFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();

    const titleVal = formData.get("title");
    const authorVal = formData.get("author");
    const descVal = formData.get("description");
    const ratingsVal = formData.get("ratings");
    const visibilityVal = formData.get("visibility");
    const coverVal = formData.get("cover");

    if (titleVal !== null) fields.title = String(titleVal).trim();
    if (authorVal !== null) fields.author = String(authorVal).trim();
    if (descVal !== null) fields.description = String(descVal).trim();
    if (ratingsVal !== null) fields.ratings = parseFloat(String(ratingsVal));
    if (visibilityVal !== null)
      fields.visibility = visibilityVal as "public" | "private";
    if (coverVal instanceof File && coverVal.size > 0) coverFile = coverVal;
  } else {
    const body = await c.req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    fields = parsed.data;
  }

  // Cover image asset uploading pipeline
  if (coverFile) {
    const store = storage.getInstance(c.env);
    const ext = coverFile.name.split(".").pop() ?? "webp";
    const arrayBuffer = await coverFile.arrayBuffer();

    // Generate unique SHA-256 slice from file buffer contents
    const contentHash = await computeBufferHash(arrayBuffer);

    // Inject hash directly into naming string pattern
    const coverKey = `covers/${audiobookId}/${contentHash}.${ext}`;
    const coverBucket = c.env.PUBLIC_ASSETS_BUCKET_NAME;

    const bufferView = new Uint8Array(arrayBuffer);
    await store.putObject(coverBucket, coverKey, bufferView, coverFile.type);

    const [updated] = await db
      .update(audiobooks)
      .set({
        ...fields,
        coverBucketName: coverBucket,
        coverS3Key: coverKey,
      })
      .where(eq(audiobooks.id, audiobookId))
      .returning({ id: audiobooks.id });

    // dont need to bust image cache since we hashed the image by content for the new url, but we do need to bust the info cache to update other metadata
    await bustInfoCache(c, audiobookId);
    return c.json({ ok: true, book: updated });
  }

  const [updated] = await db
    .update(audiobooks)
    .set(fields)
    .where(eq(audiobooks.id, audiobookId))
    .returning({
      id: audiobooks.id,
      title: audiobooks.title,
      author: audiobooks.author,
      description: audiobooks.description,
      ratings: audiobooks.ratings,
      visibility: audiobooks.visibility,
      updatedAt: audiobooks.updatedAt,
    });

  await bustInfoCache(c, audiobookId);
  return c.json({ ok: true, book: updated });
});

const reuploadSchema = z
  .object({
    fileName: z.string().optional(),
    fileSizeBytes: z.number().optional(),
    text: z.string().optional(),
  })
  .refine(
    (d) => d.text || (d.fileName && d.fileSizeBytes),
    "Provide either text or (fileName + fileSizeBytes)",
  );

app.post(
  "/:id/reupload",
  authMiddleware,
  zValidator("json", reuploadSchema),
  async (c) => {
    const audiobookId = c.req.param("id");
    const db = getDb(c.env.HYPERDRIVE.connectionString);
    const bucket = storage.getInstance(c.env);
    const body = c.req.valid("json");
    const { fileName, fileSizeBytes, text } = body;

    // userId now comes from the auth session, not the request body
    const { id: userId } = c.var.authSession.user;

    const [book] = await db
      .select({ id: audiobooks.id, status: audiobooks.status })
      .from(audiobooks)
      .where(eq(audiobooks.id, audiobookId));

    if (!book) return c.json({ error: "Audiobook not found" }, 404);

    if (book.status === "processing") {
      return c.json(
        {
          error: "Cannot reupload while audiobook is being processed",
          status: book.status,
        },
        409,
      );
    }

    console.log(`[re-upload] Request for audiobook ${audiobookId}`);

    const bucketName = c.env.RAW_BUCKET_NAME;

    // Abort any still-open multipart session before starting fresh
    const [existingAsset] = await db
      .select({
        uploadId: assets.uploadId,
        s3Key: assets.s3Key,
        uploadStatus: assets.uploadStatus,
      })
      .from(assets)
      .where(eq(assets.audiobookId, audiobookId));

    if (
      existingAsset?.uploadId &&
      existingAsset.uploadStatus === "pending_upload"
    ) {
      try {
        await bucket.abortMultipartUpload(
          bucketName,
          existingAsset.s3Key!,
          existingAsset.uploadId,
        );
        console.log(
          `[re-upload] Aborted stale multipart session for book ${audiobookId}`,
        );
      } catch (e: any) {
        // 404 = already gone, safe to ignore
        if (e?.$metadata?.httpStatusCode !== 404) {
          console.warn("[re-upload] Could not abort existing session:", e);
        }
      }
    }
    // Direct text reupload
    if (text && typeof text === "string") {
      const textBytes = new TextEncoder().encode(text);

      if (textBytes.length > MAX_FILE_SIZE_BYTES) {
        return c.json({ error: "Text exceeds 50MB limit" }, 413);
      }

      const generatedFileName = `${crypto.randomUUID().slice(0, 8)}.txt`;
      const textFileKey = `raw-uploads/${userId}/${audiobookId}/${generatedFileName}`;

      await db
        .update(audiobooks)
        .set({
          status: "finished_upload",
          rawFileName: generatedFileName,
          rawFileSizeBytes: textBytes.length,
          mimeType: "text/plain",
          errorMessage: null,
        })
        .where(eq(audiobooks.id, audiobookId));

      // Replace asset row
      // await db.delete(assets).where(eq(assets.audiobookId, audiobookId));
      await db.insert(assets).values({
        audiobookId,
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
        audiobookId,
        userId,
        s3FileKey: textFileKey,
        fileName: generatedFileName,
      } satisfies ParserJobData);

      console.log(`[re-upload] Direct text queued for book ${audiobookId}`);

      return c.json({
        ok: true,
        bookId: audiobookId,
        status: "finished_upload",
        strategy: "direct-write",
      });
    }

    // ── Multipart file reupload ─────────────────────────────────────────────
    if (!fileName || !fileSizeBytes) {
      return c.json({ error: "Missing fileName or fileSizeBytes" }, 400);
    }

    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return c.json({ error: "File exceeds 50MB limit" }, 413);
    }

    const mimeType = getMimeType(fileName);
    if (!mimeType) {
      return c.json({ error: "Only PDF and TXT files supported" }, 415);
    }

    const rawUploadKey = `raw-uploads/${userId}/${audiobookId}/${fileName}`;
    const uploadId = await bucket.initiateMultipartUpload(
      bucketName,
      rawUploadKey,
      mimeType,
    );
    const uploadExpiresAt = new Date(Date.now() + UPLOAD_EXPIRY_SECONDS * 1000);

    await db
      .update(audiobooks)
      .set({
        status: "ready_to_upload",
        rawFileName: fileName,
        rawFileSizeBytes: fileSizeBytes,
        mimeType,
        errorMessage: null,
      })
      .where(eq(audiobooks.id, audiobookId));

    // Replace asset row so the uploadId is fresh
    await db.delete(assets).where(eq(assets.audiobookId, audiobookId));
    await db.insert(assets).values({
      audiobookId,
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
      `[re-upload] Initiated multipart for book ${audiobookId}, uploadId: ${uploadId}`,
    );

    // ↓ Return the same shape as POST /upload so the client's
    //   existing useMultipartUpload hook can hit /upload/get-presigned-urls unchanged
    return c.json({
      ok: true,
      bookId: audiobookId,
      status: "ready_to_upload",
      strategy: "multipart",
      uploadId,
      fileKey: rawUploadKey,
      expiresAt: uploadExpiresAt.toISOString(),
    });
  },
);

export default app;
