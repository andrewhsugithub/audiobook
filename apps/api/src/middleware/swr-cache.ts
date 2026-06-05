import { createMiddleware } from "hono/factory";
import type { Env } from "../types/env";
import { buildSwrKeys } from "../helpers/cache";
import { SWR_FRESH_TTL, SWR_STALE_TTL } from "../constants/cache";

interface SwrCacheOptions {
  freshTtl?: number;
  staleTtl?: number;
  dryRun?: boolean;
}

/**
 * Stale-While-Revalidate cache middleware for Cloudflare Workers.
 *
 * The Workers Cache API does NOT honour the `stale-while-revalidate` or
 * `stale-if-error` Cache-Control directives in cache.put/cache.match, so we
 * emulate SWR manually using two cache keys:
 *
 * `fresh:<url>` — short-lived (default 1 h). A miss here means the content
 * is due for revalidation.
 * `stale:<url>` — long-lived (default 24 h). Served immediately to the
 * client while the fresh entry is repopulated in the background.
 *
 * Flow:
 * 1. Fresh HIT  → serve from cache, done.
 * 2. Fresh MISS + Stale HIT → serve stale to client immediately,
 * revalidate via independent fetch() in background via waitUntil.
 * 3. Both MISS  → call next() synchronously (cold start), populate both keys.
 *
 * Reference: https://developers.cloudflare.com/workers/runtime-apis/cache/
 */
export function swrCache(options: SwrCacheOptions = {}) {
  const {
    freshTtl = SWR_FRESH_TTL,
    staleTtl = SWR_STALE_TTL,
    dryRun = false,
  } = options;

  return createMiddleware<Env>(async (c, next) => {
    const cache = caches.default;
    const { freshKey, staleKey } = buildSwrKeys(c.req.url);

    const isInternalRevalidation = c.req.header("X-Is-Revalidating") === "1";
    const bypassCache =
      isInternalRevalidation ||
      c.req.header("Cache-Control") === "no-cache" ||
      c.req.header("X-Cache-Bypass") === "1" ||
      c.req.header("Pragma") === "no-cache";

    if (!bypassCache) {
      // ── 1. Fresh HIT ───────────────────────────────────────────────────────
      const freshHit = await cache.match(freshKey);
      if (freshHit) {
        const clientHeaders = new Headers(freshHit.headers);
        // FIX BUG #6: Do not leak internal max-age to browser
        clientHeaders.set("Cache-Control", "no-cache, must-revalidate");
        clientHeaders.set("X-Cache-Status", "HIT");
        clientHeaders.set("X-Cache-Age", "fresh");

        return new Response(freshHit.body, {
          status: freshHit.status,
          headers: clientHeaders,
        });
      }

      // ── 2. Stale HIT → Serve stale, revalidate downstream ──────────────────
      const staleHit = await cache.match(staleKey);
      if (staleHit) {
        c.executionCtx.waitUntil(
          (async () => {
            try {
              // FIX BUG #2: Use explicit token header to prevent recursion loops
              const revalidateReq = new Request(c.req.raw.clone(), {
                headers: {
                  ...Object.fromEntries(c.req.raw.headers.entries()),
                  "X-Is-Revalidating": "1",
                },
              });

              const revalidated = await fetch(revalidateReq);
              if (revalidated.ok && !dryRun) {
                const body = await revalidated.arrayBuffer();
                const headers = Object.fromEntries(
                  revalidated.headers.entries(),
                );
                const status = revalidated.status;

                await populateSwrKeys(
                  cache,
                  freshKey,
                  staleKey,
                  body,
                  status,
                  headers,
                  freshTtl,
                  staleTtl,
                );
              }
            } catch (e) {
              console.error("[swr-cache] Background revalidation failed:", e);
            }
          })(),
        );

        const clientHeaders = new Headers(staleHit.headers);
        // FIX BUG #6: Keep browser on a short leash
        clientHeaders.set("Cache-Control", "no-cache, must-revalidate");
        clientHeaders.set("X-Cache-Status", "HIT");
        clientHeaders.set("X-Cache-Age", "stale");

        return new Response(staleHit.body, {
          status: staleHit.status,
          headers: clientHeaders,
        });
      }
    }

    // ── 3. Cold Start / Cache Bypass Pipeline ───────────────────────────────
    await next();

    // If this execution was triggered by our background revalidation worker,
    // we stop here. The background worker block itself handles population.
    if (isInternalRevalidation) return;

    if (c.res && c.res.ok && !dryRun) {
      try {
        const responseClone = c.res.clone();
        const body = await responseClone.arrayBuffer();
        const headers = Object.fromEntries(responseClone.headers.entries());
        const status = responseClone.status;

        // FIX BUG #4: Removed explicit cache.delete() to avoid thundering herd races.
        // cache.put natively overwrites records atomically.
        c.executionCtx.waitUntil(
          populateSwrKeys(
            cache,
            freshKey,
            staleKey,
            body,
            status,
            headers,
            freshTtl,
            staleTtl,
          ),
        );
      } catch (e) {
        console.error("[swr-cache] Cold start cache population failed:", e);
      }
    }

    c.header("Cache-Control", "no-cache, must-revalidate");
    c.header("X-Cache-Status", "MISS");
    c.header("X-Cache-Age", "none");
  });
}

async function populateSwrKeys(
  cache: Cache,
  freshKey: Request,
  staleKey: Request,
  body: ArrayBuffer,
  status: number,
  baseHeaders: Record<string, string>,
  freshTtl: number,
  staleTtl: number,
): Promise<void> {
  // Strip tracking metadata headers before entering storage
  const cleanHeaders = { ...baseHeaders };
  delete cleanHeaders["x-cache-status"];
  delete cleanHeaders["x-cache-age"];

  await Promise.all([
    cache.put(
      freshKey,
      new Response(body, {
        status,
        headers: {
          ...cleanHeaders,
          "Cache-Control": `public, max-age=${freshTtl}`,
        },
      }),
    ),
    cache.put(
      staleKey,
      new Response(body, {
        status,
        headers: {
          ...cleanHeaders,
          "Cache-Control": `public, max-age=${staleTtl}`,
        },
      }),
    ),
  ]);
}
