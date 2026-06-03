import type { Context } from "hono";
import type { Env } from "../types/env";

/**
 * Build a stable cache key Request from a URL string.
 *
 * The Cloudflare Cache API requires:
 *   - A fully-qualified URL (scheme + host + path)
 *   - Scheme must be `http:` or `https:` — nothing else is accepted
 *
 * If the URL fails either check we throw immediately with a clear message
 * rather than letting the Cache API throw an opaque "Invalid URL" error
 * that bubbles up through the error handler and incorrectly marks books
 * as failed.
 *
 * @param url        - Fully-qualified request URL (use `c.req.url`)
 * @param stripQuery - Remove query params from the key (default: true)
 */
export function buildCacheKey(url: string, stripQuery = true): Request {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    // Surface a developer-friendly error rather than the opaque CF one
    throw new TypeError(
      `buildCacheKey received an unparseable URL: "${url}". ` +
        `Pass c.req.url which is always fully-qualified in CF Workers.`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError(
      `Cache API keys must use http: or https: scheme. ` +
        `Got "${parsed.protocol}" from URL: "${url}"`,
    );
  }

  if (stripQuery) parsed.search = "";

  return new Request(parsed.toString(), { method: "GET" });
}

// /**
//  * Build the dual SWR cache-key pair for a given URL.
//  *
//  * The Workers Cache API does NOT honour `stale-while-revalidate` in
//  * cache.put/cache.match, so we emulate it with two keys:
//  *
//  *   fresh:<url>  — short TTL; miss triggers background revalidation
//  *   stale:<url>  — long TTL; served immediately while fresh revalidates
//  *
//  * ⚠️ The `fresh:` and `stale:` prefixes produce non-http(s) URLs which
//  * the Cache API would reject if used directly. Instead we embed the
//  * clean URL as a query param on a synthetic https key so the Cache API
//  * accepts it while the key remains unique per original URL.
//  */

// export async function bustInfoCache(
//   _c: Context<Env>,
//   audiobookId: string,
//   imageExt: string | null = null,
// ): Promise<void> {
//   const cache = caches.default;
//   const origin = new URL(_c.req.url).origin;

//   const deletions: Promise<boolean>[] = [];

//   // Target Metadata SWR Keys
//   const baseTargetUrl = `${origin}/audiobook/${audiobookId}/info`;
//   const { freshKey, staleKey } = buildSwrKeys(baseTargetUrl);

//   console.log("[bustInfoCache] Busting keys for metadata:", baseTargetUrl);
//   deletions.push(cache.delete(freshKey));
//   deletions.push(cache.delete(staleKey));
//   deletions.push(cache.delete(new Request(baseTargetUrl, { method: "GET" })));

//   // ── 2. Target Clean Static Asset Key ─────────────────────────────
//   if (imageExt) {
//     const assetUrl = `${origin}/cover/${audiobookId}.${imageExt}`;
//     console.log(
//       "[bustInfoCache] Busting static asset key for cover image:",
//       assetUrl,
//     );

//     // Wrap with your internal key builder utility if your asset route maps keys specifically
//     deletions.push(cache.delete(new Request(assetUrl, { method: "GET" })));
//   }

//   // Await all deletions concurrently
//   const results = await Promise.allSettled(deletions);

//   results.forEach((r, i) => {
//     if (r.status === "rejected") {
//       console.warn(
//         `[bustInfoCache] Cache eviction step #${i} failed:`,
//         r.reason,
//       );
//     } else {
//       console.log(
//         `[bustInfoCache] Cache eviction step #${i} status success:`,
//         r.value,
//       );
//     }
//   });
// }

export function buildSwrKeys(url: string): {
  freshKey: Request;
  staleKey: Request;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`buildSwrKeys received an unparseable URL: "${url}"`);
  }

  parsed.search = "";
  const clean = encodeURIComponent(parsed.toString());

  // Use the same origin so the Cache API namespace stays consistent, with a synthetic path prefix to differentiate fresh vs stale.
  const freshKey = new Request(`${parsed.origin}/__swr_fresh__?u=${clean}`, {
    method: "GET",
  });
  const staleKey = new Request(`${parsed.origin}/__swr_stale__?u=${clean}`, {
    method: "GET",
  });

  return { freshKey, staleKey };
}

export async function bustInfoCache(
  _c: Context<Env>,
  audiobookId: string,
): Promise<void> {
  const cache = caches.default;
  const origin = new URL(_c.req.url).origin;
  const deletions: Promise<boolean>[] = [];

  // Target only the actual synthetic SWR keys produced by the system
  const baseTargetUrl = `${origin}/audiobook/${audiobookId}/info`;
  const { freshKey, staleKey } = buildSwrKeys(baseTargetUrl);

  console.log(
    "[bustInfoCache] Evicting SWR cache keys for metadata:",
    baseTargetUrl,
  );
  deletions.push(cache.delete(freshKey));
  deletions.push(cache.delete(staleKey));

  const results = await Promise.allSettled(deletions);

  // For production, complement this local data-center eviction with an external call to Cloudflare's Global Purge API if global consistency is required.
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(
        `[bustInfoCache] Cache eviction step #${i} failed:`,
        r.reason,
      );
    }
  });
}
