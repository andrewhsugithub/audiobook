import type { Context } from "hono";
import type { Env } from "../types/env";

export function getHlsCookieName(audiobookId: string): string {
  return `hls_session_${audiobookId}`;
}

/**
 * Cookie options for HLS session tokens.
 *
 * `secure: true` + `sameSite: "None"` are required even in local dev so the
 * browser accepts Set-Cookie on cross-origin requests from the frontend.
 */
export function getHlsCookieOptions(
  _c: Context<Env>,
  audiobookId: string,
  maxAge: number,
) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "None" as const,
    path: `/audiobook/${audiobookId}`,
    maxAge,
  };
}
