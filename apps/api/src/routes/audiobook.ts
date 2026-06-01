import { Context, Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { eq, ilike, or, desc, and, asc, sql } from "@audiobook/db/src/index";
import { getDb } from "@audiobook/db/src";
import { assets, audiobooks } from "@audiobook/db/src/schema/schema";
import { storage } from "@audiobook/storage/src/storage.cf";
import { ParserJobData } from "../types/jobs";

type Env = {
  Bindings: Cloudflare.Env;
};

const app = new Hono<Env>();

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

const TOKEN_TTL = 3600; // 1 hour sliding window
// const TOKEN_TTL = 10; // for testing use
const MAX_SESSION_TTL = 21600; // 6 hours absolute cutoff cap (Replay protection)

function getCookieName(audiobookId: string) {
  return `hls_session_${audiobookId}`;
}

function getContentType(filename: string): string {
  if (filename.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filename.endsWith(".m4s")) return "video/iso.segment";
  if (filename.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function getCookieOptions(
  c: Context<Env>,
  audiobookId: string,
  maxAge: number,
) {
  // force local to have same settings in production to avoid issues with cookie acceptance in browsers
  return {
    httpOnly: true,
    secure: true,
    sameSite: "None" as const,
    path: `/audiobook/${audiobookId}`,
    maxAge,
  };
}

//? maybe cache
app.get("/:id/info", async (c) => {
  const audiobookId = c.req.param("id");
  const db = getDb(c.env.HYPERDRIVE.connectionString);

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
    })
    .from(audiobooks)
    .where(eq(audiobooks.id, audiobookId));

  if (!book) return c.json({ error: "Audiobook not found" }, 404);

  // let coverUrl = "https://placehold.co/300x450";
  let coverUrl = `${c.env.RANDOM_COVER_BASE_URL}/${book.id}/300/450`; // fallback to random seeded cover for better UX while cover is being processed
  if (book.coverBucketName && book.coverS3Key) {
    const baseUrl = new URL(c.req.url).origin;
    const ext = book.coverS3Key.split(".").pop() || "jpg";
    coverUrl = `${baseUrl}/cover/${book.id}.${ext}`;
  }

  return c.json({
    id: book.id,
    status: book.status,
    title: book.title,
    author: book.author,
    description: book.description,
    ratings: book.ratings,
    coverUrl,
    isReady: book.status === "completed",
    errorMessage: book.errorMessage,
  });
});

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

  return c.json({
    id: book.id,
    status: book.status,
    durationSeconds: book.totalDurationSeconds,
    progress,
    isReady: book.status === "completed",
    errorMessage: book.errorMessage,
  });
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

  const now = Math.floor(Date.now() / 1000);

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
    getCookieName(audiobookId),
    token,
    getCookieOptions(c, audiobookId, TOKEN_TTL),
  );

  return c.json({
    ok: true,
    expiresIn: TOKEN_TTL,
    expiresAt: new Date((now + TOKEN_TTL) * 1000).toISOString(),
    // Hint to frontend: schedule refresh at this time
    refreshAt: new Date((now + TOKEN_TTL - 300) * 1000).toISOString(), // 5-minute pre-refresh warning
  });
});

app.post("/:id/refresh", async (c) => {
  const audiobookId = c.req.param("id");
  const currentToken = getCookie(c, getCookieName(audiobookId));

  if (!currentToken)
    return c.json({ error: "Active streaming session missing" }, 401);

  try {
    const payload = await verify(currentToken, c.env.TOKEN_SECRET, "HS256");
    if (payload.sub !== audiobookId)
      return c.json({ error: "Scope mismatch" }, 403);

    const now = Math.floor(Date.now() / 1000);

    // Enforce permanent session termination if max lifespan is exceeded
    if (payload.maxEnd && now > (payload.maxEnd as number)) {
      throw new Error("Absolute session limit reached");
    }

    const newToken = await sign(
      {
        sub: audiobookId,
        iat: now,
        exp: now + TOKEN_TTL,
        maxEnd: payload.maxEnd,
      },
      c.env.TOKEN_SECRET,
      "HS256",
    );

    setCookie(
      c,
      getCookieName(audiobookId),
      newToken,
      getCookieOptions(c, audiobookId, TOKEN_TTL),
    );

    return c.json({
      ok: true,
      expiresIn: TOKEN_TTL,
      expiresAt: new Date((now + TOKEN_TTL) * 1000).toISOString(),
      refreshAt: new Date((now + TOKEN_TTL - 300) * 1000).toISOString(),
    });
  } catch {
    deleteCookie(c, getCookieName(audiobookId), {
      path: `/audiobook/${audiobookId}/`,
    });
    return c.json(
      { error: "Session expired or capped. Please re-authenticate." },
      401,
    );
  }
});

app.get("/:id/:filename{.+}", async (c) => {
  const audiobookId = c.req.param("id");
  const filename = c.req.param("filename");
  const origin = c.req.header("Origin") ?? "";
  const rangeHeader = c.req.header("Range");

  // Auth gatekeeper
  const sessionToken = getCookie(c, getCookieName(audiobookId));
  if (!sessionToken) return c.json({ error: "Unauthorized access" }, 401);

  try {
    const payload = await verify(sessionToken, c.env.TOKEN_SECRET, "HS256");
    if (payload.sub !== audiobookId)
      return c.json({ error: "Scope mismatch" }, 403);
  } catch {
    return c.json({ error: "Session verification expired" }, 401);
  }

  const isPlaylist = filename.endsWith(".m3u8");
  // ── Cache check ───────────────────────────────────────────────────────────
  // Never cache playlists — they are private (contain session context)
  // Never store CORS headers in cache — causes CORS cache poisoning
  const cache = caches.default;
  // Clean cache configuration key
  const cacheUrl = new URL(c.req.url);
  cacheUrl.search = "";
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

  // Read cache for full segment calls
  if (!isPlaylist && !rangeHeader) {
    // Only cache non-range requests — range responses are partial and
    // must not be served to requests expecting the full file
    const cachedResponse = await cache.match(cacheKey);
    console.log(
      `Cache ${cachedResponse ? "HIT" : "MISS"} for ${filename} (Range: ${
        rangeHeader ?? "none"
      })`,
    );

    if (cachedResponse) {
      console.log(
        `Serving ${filename} from cache with appropriate CORS headers`,
      );
      // Reconstruct response to add CORS + cache status headers
      // NEVER store these in the cache itself — causes CORS cache poisoning
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers: {
          // Preserve original headers from cache
          ...Object.fromEntries(cachedResponse.headers.entries()),
          // Add CORS fresh on every response — never from cache
          "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
            ? origin
            : "",
          "Access-Control-Allow-Credentials": "true",
          // Monitoring
          "X-Cache-Status": "HIT",
        },
      });
    }
  }

  // S3 Upstream Retrieval
  const store = storage.getInstance(c.env);
  const s3Key = `audiobooks/${audiobookId}/hls/${filename}`;
  console.log(
    `Cache MISS for ${filename} (Range: ${rangeHeader ?? "none"}) — fetching from S3 with key: ${s3Key}`,
  );

  // Pass Range header through to R2 for proper byte-range support
  // This is critical for HLS.js seeking and for fMP4 init segment fetching
  const s3Object = await store.getObjectWithRange(
    c.env.MEDIA_BUCKET_NAME,
    s3Key,
    rangeHeader ?? undefined,
  );

  if (!s3Object) return c.json({ error: "Media asset not found" }, 404);

  const corsHeaders = {
    // Always set dynamically — never from cache
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : "",
    "Access-Control-Allow-Credentials": "true",
  };

  // Serve Playlists Manifests
  if (isPlaylist) {
    // Playlist: private, no CDN cache, no browser cache
    // Different users get same playlist file (VOD) but we still mark private
    // because in future you might personalise playlists
    return new Response(s3Object.stream, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        "X-Cache-Status": "MISS",
        ...corsHeaders,
      },
    });
  }

  // Serve Range Requests (206 Partial Content)
  if (rangeHeader && s3Object.rangeResponse) {
    // Partial content response for Range requests
    // Required for: seeking, progressive loading, some iOS Safari behaviors
    const { start, end, total } = s3Object.rangeResponse;
    return new Response(s3Object.stream, {
      status: 206, // Partial Content
      headers: {
        "Content-Type": getContentType(filename),
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Cache-Status": "MISS",
        ...corsHeaders,
      },
    });
  }

  // Serve & Cache Full Segments (200 OK)
  // Build response WITHOUT CORS headers for caching
  // CORS headers added dynamically after cache read
  const responseForCache = new Response(s3Object.stream, {
    status: 200,
    headers: {
      "Content-Type": getContentType(filename),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
      // Intentionally NO CORS headers here — added after cache read
    },
  });

  // Split stream using tee() to handle both caching and pipeline routing
  const [clientStream, cacheStream] = responseForCache.body!.tee();

  c.executionCtx.waitUntil(
    cache.put(
      cacheKey,
      new Response(cacheStream, { headers: responseForCache.headers }),
    ),
  );

  return new Response(clientStream, {
    status: 200,
    headers: {
      ...Object.fromEntries(responseForCache.headers.entries()),
      ...corsHeaders,
      "X-Cache-Status": "MISS",
    },
  });
});

app.get("/search", async (c) => {
  const query = c.req.query("q")?.trim() ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "30"), 50);
  const offset = parseInt(c.req.query("offset") ?? "0");
  const completeOnly = c.req.query("completeOnly") === "true";

  const db = getDb(c.env.HYPERDRIVE.connectionString);

  // Empty query returns recent completed audiobooks then recently updated audiobooks regardless of status
  const results = await db
    .select({
      id: audiobooks.id,
      title: audiobooks.title,
      author: audiobooks.author,
      description: audiobooks.description,
      ratings: audiobooks.ratings,
      coverBucketName: audiobooks.coverBucketName,
      coverS3Key: audiobooks.coverS3Key,
      status: audiobooks.status,
      createdAt: audiobooks.createdAt,
    })
    .from(audiobooks)
    .where(
      completeOnly
        ? and(
            eq(audiobooks.status, "completed"),
            or(
              ilike(audiobooks.title, `%${query}%`),
              ilike(audiobooks.author, `%${query}%`),
            ),
          )
        : or(
            ilike(audiobooks.title, `%${query}%`),
            ilike(audiobooks.author, `%${query}%`),
          ),
    )
    .orderBy(
      asc(sql`CASE WHEN ${audiobooks.status} = 'completed' THEN 0 ELSE 1 END`),
      desc(audiobooks.updatedAt),
    )
    .limit(limit)
    .offset(offset);

  const baseUrl = new URL(c.req.url).origin;

  const mapped = results.map((book) => {
    // let coverUrl = "https://placehold.co/300x450";
    let coverUrl = `${c.env.RANDOM_COVER_BASE_URL}/${book.id}/300/450`; // fallback to random seeded cover for better UX while cover is being processed
    if (book.coverBucketName && book.coverS3Key) {
      const ext = book.coverS3Key.split(".").pop() ?? "jpg";
      coverUrl = `${baseUrl}/cover/${book.id}.${ext}`;
    }

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      ratings: book.ratings,
      coverUrl,
      status: book.status,
    };
  });

  return c.json({
    results: mapped,
    total: mapped.length,
    query,
    limit,
    offset,
  });
});

//! add endpoint to edit cover image
app.patch("/:id", async (c) => {
  const audiobookId = c.req.param("id");
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const body = await c.req.json();

  const { title, author, description, ratings } = body;

  // Only allow updating these fields
  const updateFields: Record<string, unknown> = {};

  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length === 0) {
      return c.json({ error: "title must be a non-empty string" }, 400);
    }
    updateFields.title = title.trim();
  }

  if (author !== undefined) {
    if (typeof author !== "string") {
      return c.json({ error: "author must be a string" }, 400);
    }
    updateFields.author = author.trim() || null;
  }

  if (description !== undefined) {
    if (typeof description !== "string") {
      return c.json({ error: "description must be a string" }, 400);
    }
    updateFields.description = description.trim() || null;
  }

  if (ratings !== undefined) {
    const r = Number(ratings);
    if (isNaN(r) || r < 0 || r > 5) {
      return c.json({ error: "ratings must be a number between 0 and 5" }, 400);
    }
    updateFields.ratings = r;
  }

  const [book] = await db
    .select({ id: audiobooks.id })
    .from(audiobooks)
    .where(eq(audiobooks.id, audiobookId));

  if (!book) return c.json({ error: "Audiobook not found" }, 404);

  const [updated] = await db
    .update(audiobooks)
    .set(updateFields)
    .where(eq(audiobooks.id, audiobookId))
    .returning({
      id: audiobooks.id,
      title: audiobooks.title,
      author: audiobooks.author,
      description: audiobooks.description,
      ratings: audiobooks.ratings,
      updatedAt: audiobooks.updatedAt,
    });

  return c.json({ ok: true, book: updated });
});

const UPLOAD_EXPIRY_SECONDS = 3600;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

app.post("/:id/reupload", async (c) => {
  const audiobookId = c.req.param("id");
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const bucket = storage.getInstance(c.env);
  const body = await c.req.json();

  const { userId, fileName, fileSizeBytes, text } = body;

  //! check if same user is reuploading or if userId is missing
  if (!userId) return c.json({ error: "Missing userId" }, 400);

  // Verify book exists and belongs to user
  const [book] = await db
    .select({
      id: audiobooks.id,
      userId: audiobooks.userId,
      status: audiobooks.status,
    })
    .from(audiobooks)
    .where(eq(audiobooks.id, audiobookId));

  if (!book) return c.json({ error: "Audiobook not found" }, 404);

  // Prevent reupload while actively processing
  if (book.status === "processing") {
    return c.json(
      {
        error: "Cannot reupload while audiobook is being processed",
        status: book.status,
      },
      409,
    );
  }

  console.log(
    `[re-upload] Received re-upload request for audiobook ID: ${c.req.param("id")}`,
  );

  const bucketName = c.env.RAW_BUCKET_NAME;

  //  Direct text reupload
  if (text && typeof text === "string") {
    const textBytes = new TextEncoder().encode(text);

    if (textBytes.length > MAX_FILE_SIZE_BYTES) {
      return c.json({ error: "Text exceeds 50MB limit" }, 413);
    }

    console.log(
      `[re-upload] Direct text submission received for book upload. Bypassing multipart.`,
    );

    const generatedFileName = `${crypto.randomUUID().slice(0, 8)}.txt`;
    const textFileKey = `raw-uploads/${userId}/${audiobookId}/${generatedFileName}`;

    // Reset pipeline state
    await db
      .update(audiobooks)
      .set({
        status: "finished_upload",
        rawFileName: generatedFileName,
        rawFileSizeBytes: textBytes.length,
        mimeType: "text/plain",
        //? maybe clear HLS output key
        errorMessage: null,
      })
      .where(eq(audiobooks.id, audiobookId));

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

    console.log(`[re-upload] Direct text upload for book ${audiobookId}`);

    return c.json({
      ok: true,
      bookId: audiobookId,
      status: "finished_upload",
      strategy: "direct-write",
    });
  }

  //  Multipart reupload
  if (!fileName || !fileSizeBytes) {
    return c.json({ error: "Missing fileName or fileSizeBytes" }, 400);
  }

  const mimeType = fileName.endsWith(".pdf")
    ? "application/pdf"
    : fileName.endsWith(".txt")
      ? "text/plain"
      : null;

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

  // Reset pipeline state
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
    `[re-upload] Initiated audiobook ID: ${audiobookId} for multipart re-upload.`,
  );

  return c.json({
    ok: true,
    bookId: audiobookId,
    status: "ready_to_upload",
    strategy: "multipart",
    uploadId,
    fileKey: rawUploadKey,
    expiresAt: uploadExpiresAt.toISOString(),
  });
});

export default app;
