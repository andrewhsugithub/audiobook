import { Hono } from "hono";
import type { Env } from "../types/env";
import { CACHE_CONTROL_COVER } from "../constants/cache";
import { ALLOWED_ORIGINS } from "../constants/cors";

const app = new Hono<Env>();

/**
 * Cover image proxy with wsrv.nl transformation and Cloudflare Cache API.
 *
 * Cache key includes query params (w/h/q/f) so different sizes are cached
 * independently. CORS headers are always injected dynamically — never stored
 * in the cached entry.
 */
app.get("/:filename{.+}", async (c) => {
  const filename = c.req.param("filename");
  const origin = c.req.header("Origin") ?? "";
  const { w, h, q, f } = c.req.query();

  const corsOrigin = ALLOWED_ORIGINS.includes(origin as any)
    ? origin
    : ALLOWED_ORIGINS[0] || "*";

  // Cache key includes query params for size variants
  const cache = caches.default;
  // Note: we intentionally keep query params in the cover cache key so that
  // different resize variants (e.g. /cover/bookId/abc.jpg?w=300&h=450) are stored
  // as independent entries rather than colliding on a single key.
  const cacheKey = new Request(c.req.url, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      status: cached.status,
      headers: {
        ...Object.fromEntries(cached.headers.entries()),
        "X-Cache-Status": "HIT",
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  const rawImageUrl = `https://${c.env.SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/${c.env.PUBLIC_ASSETS_BUCKET_NAME}/covers/${filename}`;

  let targetUrl = rawImageUrl;

  if (w || h || q || f) {
    const wsrv = new URL("https://wsrv.nl/");
    wsrv.searchParams.set("url", rawImageUrl);
    if (w) wsrv.searchParams.set("w", w);
    if (h) wsrv.searchParams.set("h", h);
    if (q) wsrv.searchParams.set("q", q);
    wsrv.searchParams.set("output", f ?? "webp");
    targetUrl = wsrv.toString();
  }

  const upstream = await fetch(targetUrl);
  if (!upstream.ok) return c.json({ error: "Cover not found" }, 404);

  // Build the cacheable response — NO CORS headers in stored entry
  const responseForCache = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": CACHE_CONTROL_COVER,
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
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Credentials": "true",
      "X-Cache-Status": "MISS",
    },
  });
});

export default app;
