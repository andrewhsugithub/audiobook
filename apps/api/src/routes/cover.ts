import { Hono } from "hono";

type Env = {
  Bindings: Cloudflare.Env;
};

const app = new Hono<Env>();

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

app.get("/:filename{.+}", async (c) => {
  const filename = c.req.param("filename");
  const origin = c.req.header("Origin") ?? "";

  //! exposing unrestricted transformation parameters can be susceptible to cache-busting, cache-key explosion, and resource amplification attacks unless parameter validation and cache-key normalization are implemented
  const w = c.req.query("w"); // Width (e.g., 300)
  const h = c.req.query("h"); // Height (e.g., 450)
  const q = c.req.query("q"); // Quality (e.g., 80)
  const f = c.req.query("f"); // Format override (e.g., webp, avif)

  // cache query params as well
  const cache = caches.default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  const cached = await cache.match(cacheKey);

  if (cached) {
    return new Response(cached.body, {
      status: cached.status,
      headers: {
        ...Object.fromEntries(cached.headers.entries()),
        "X-Cache-Status": "HIT",
        // CORS always dynamic
        "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
          ? origin
          : "*", // covers are public — wildcard is fine
      },
    });
  }

  const rawImageURL = `https://${c.env.SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/${c.env.PUBLIC_ASSETS_BUCKET_NAME}/covers/${filename}`;

  let tgtImageUrl = rawImageURL;

  // use wasm locally or use cloudflare's image resizing service since wsrv.nl doesn't have sla
  if (w || h || q || f) {
    const wsrvUrl = new URL("https://wsrv.nl/");
    wsrvUrl.searchParams.set("url", rawImageURL);
    if (w) wsrvUrl.searchParams.set("w", w);
    if (h) wsrvUrl.searchParams.set("h", h);
    if (q) wsrvUrl.searchParams.set("q", q);

    // Fall back to modern auto-adaptive formatting if nothing specific is specified
    wsrvUrl.searchParams.set("output", f || "webp");

    tgtImageUrl = wsrvUrl.toString();
    console.log(`Cache MISS. Routing optimization to wsrv.nl: ${tgtImageUrl}`);
  } else {
    console.log(
      `Cache MISS. Fetching raw image from S3 upstream: ${tgtImageUrl}`,
    );
  }
  const upstream = await fetch(tgtImageUrl, { method: "GET" });

  if (!upstream.ok) {
    return c.json({ error: "Cover not found" }, 404);
  }

  const responseForCache = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      // Immutable — if cover changes, upload with new key
      "Cache-Control": "public, max-age=2592000, s-maxage=2592000, immutable", // 30 Days
      "X-Cache-Status": "MISS",
    },
  });

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
      "Access-Control-Allow-Origin": origin || "*",
      "X-Cache-Status": "MISS",
    },
  });
});

export default app;
