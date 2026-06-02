/** Immutable media segments: 1 year, never changes once keyed by content hash */
export const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";

/** Cover images: 30 days, serve stale for 1 day while revalidating */
export const CACHE_CONTROL_COVER =
  "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400, stale-if-error=604800, immutable";

/** HLS playlists: never cache — private, session-scoped */
export const CACHE_CONTROL_PLAYLIST =
  "private, no-store, no-cache, must-revalidate";

// ─── SWR dual-key TTLs (Workers Cache API emulation) ─────────────────────────
// NOTE: stale-while-revalidate is NOT honoured by cache.put/cache.match in the
// Workers Cache API. We emulate it manually with two cache keys:
//   fresh:<url>  — short TTL; miss triggers background revalidation
//   stale:<url>  — long TTL;  served while fresh key revalidates
//
// See: https://developers.cloudflare.com/workers/runtime-apis/cache/

/** TTL for the "fresh" cache entry for audiobook metadata (seconds) */
export const SWR_FRESH_TTL = 3_600; // 1 hour

/** TTL for the "stale" fallback entry for audiobook metadata (seconds) */
export const SWR_STALE_TTL = 86_400; // 24 hours
