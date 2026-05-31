import { Context, Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { eq } from "@audiobook/db/src/index";
import { getDb } from "@audiobook/db/src";
import { audiobooks } from "@audiobook/db/src/schema/schema";
import { storage } from "@audiobook/storage/src/storage.cf";

type Env = {
  Bindings: Cloudflare.Env & {
    TOKEN_SECRET: string;
    NODE_ENV: string;
  };
};

const app = new Hono<Env>();

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

const TOKEN_TTL = 3600; // 1 hour sliding window
// const TOKEN_TTL = 10; // for testing use
const MAX_SESSION_TTL = 21600; // 6 hours absolute cutoff cap (Replay protection)

function getCookieName(audiobookId: string) {
  return `hls_session_${audiobookId}`;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
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

// ─── 1. SESSION INITIALIZATION ───────────────────────────────────────────────
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

  // Mint token containing sliding expiry AND absolute session ceiling
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

// ─── 2. SESSION REFRESH (WITH HIJACKING PROTECTION) ──────────────────────────
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

// ─── 3. STREAM PROXY AND CACHE PIPELINE ──────────────────────────────────────
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
  const r2Object = await store.getObjectWithRange(
    c.env.MEDIA_BUCKET_NAME,
    s3Key,
    rangeHeader ?? undefined,
  );

  if (!r2Object) return c.json({ error: "Media asset not found" }, 404);

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
    return new Response(r2Object.stream, {
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
  if (rangeHeader && r2Object.rangeResponse) {
    // Partial content response for Range requests
    // Required for: seeking, progressive loading, some iOS Safari behaviors
    const { start, end, total } = r2Object.rangeResponse;
    return new Response(r2Object.stream, {
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
  const responseForCache = new Response(r2Object.stream, {
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

export default app;
