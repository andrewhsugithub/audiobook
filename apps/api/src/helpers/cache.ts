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

/**
 * Build the dual SWR cache-key pair for a given URL.
 * Emulates stale-while-revalidate behaviors inside the Cloudflare Workers Cache API.
 */
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

  const freshKey = new Request(`${parsed.origin}/__swr_fresh__?u=${clean}`, {
    method: "GET",
  });
  const staleKey = new Request(`${parsed.origin}/__swr_stale__?u=${clean}`, {
    method: "GET",
  });

  return { freshKey, staleKey };
}

/**
 * Evict all metadata (/info) SWR keys for a given audiobook id.
 */
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
        `[bustInfoCache] Metadata cache eviction step #${i} failed:`,
        r.reason,
      );
    }
  });
}

/**
 * FIXED: Evict all uploader (/uploader) SWR keys for a given audiobook id.
 * Uses the same buildSwrKeys wrapper since it uses the swrCache middleware.
 */
export async function bustUploaderCache(
  _c: Context<Env>,
  audiobookId: string,
): Promise<void> {
  const cache = caches.default;
  const origin = new URL(_c.req.url).origin;
  const deletions: Promise<boolean>[] = [];

  // Re-create the exact target endpoint that the worker interceptor caches against
  const baseTargetUrl = `${origin}/audiobook/${audiobookId}/uploader`;
  const { freshKey, staleKey } = buildSwrKeys(baseTargetUrl);

  console.log(
    "[bustUploaderCache] Evicting SWR cache keys for uploader:",
    baseTargetUrl,
  );
  deletions.push(cache.delete(freshKey));
  deletions.push(cache.delete(staleKey));

  const results = await Promise.allSettled(deletions);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(
        `[bustUploaderCache] Uploader cache eviction step #${i} failed:`,
        r.reason,
      );
    }
  });
}

/**
 * CONVENIENCE HELPER: Purge all book caches (Info and Uploader routes) at once.
 * Highly recommended for your PATCH and DELETE router targets.
 */
export async function bustAllBookCaches(
  _c: Context<Env>,
  audiobookId: string,
): Promise<void> {
  await Promise.allSettled([
    bustInfoCache(_c, audiobookId),
    bustUploaderCache(_c, audiobookId),
  ]);
}
