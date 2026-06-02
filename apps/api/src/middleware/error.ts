// apps/api/src/middleware/error.ts

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "@audiobook/db/src";
import { audiobooks } from "@audiobook/db/src/schema/schema";
import { eq } from "@audiobook/db/src/index";
import type { Env } from "../types/env";

/**
 * Routes that mutate audiobook processing state.
 * Only these should write `status = 'failed'` on unhandled errors.
 * Read-only routes (HLS streaming, info, status, search) must NEVER
 * mark a book as failed — a cache error during playback is not a
 * processing failure.
 */
const WRITE_ROUTE_PATTERNS = [
  /^POST$/, // all POST routes (upload, reupload, session creation)
  /^PATCH$/, // metadata edits
];

function isWriteRoute(method: string): boolean {
  return WRITE_ROUTE_PATTERNS.some((p) => p.test(method));
}

export async function globalErrorHandler(
  err: Error,
  c: Context<Env>,
): Promise<Response> {
  const audiobookId = c.req.param("id") ?? c.req.param("bookId");
  const method = c.req.method;

  // ── Best-effort: mark audiobook failed ONLY on write/processing routes ───
  // Never do this for GET routes — a streaming or cache error must not
  // corrupt the audiobook's processing state.
  if (audiobookId && isWriteRoute(method) && c.env?.HYPERDRIVE) {
    try {
      const db = getDb(c.env.HYPERDRIVE.connectionString);
      await db
        .update(audiobooks)
        .set({
          status: "failed",
          errorMessage: `Unhandled error: ${err.message}`,
        })
        .where(eq(audiobooks.id, audiobookId));
    } catch (dbErr) {
      console.error("[errorHandler] Could not write failed status:", dbErr);
    }
  }

  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  if (err.name === "ZodError") {
    return c.json({ error: "Validation failed", details: err.message }, 422);
  }

  console.error("[unhandledError]", err);
  return c.json({ error: "Internal server error" }, 500);
}

export function notFoundHandler(c: Context) {
  return c.json(
    { error: `Route not found: ${c.req.method} ${c.req.path}` },
    404,
  );
}
