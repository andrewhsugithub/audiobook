/** Sliding window for HLS streaming JWTs — 1 hour */
export const TOKEN_TTL = 3_600;

/** Hard cap on any single streaming session — 6 hours (replay protection) */
export const MAX_SESSION_TTL = 21_600;

/** Pre-refresh window hint sent to the client — 5 minutes before expiry */
export const PRE_REFRESH_BUFFER = 300;
