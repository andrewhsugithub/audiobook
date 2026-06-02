import { Hono } from "hono";
import { eq, and, desc, sql } from "@audiobook/db/src/index";
import { getDb } from "@audiobook/db/src";
import { userLibrary, audiobooks } from "@audiobook/db/src/schema/schema";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../types/env";

const app = new Hono<Env>();

app.use("*", authMiddleware);

app.get("/", async (c) => {
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { id: userId } = c.var.authSession.user;
  const baseUrl = new URL(c.req.url).origin;

  const [cacheMeta] = await db
    .select({
      count: sql<number>`count(*)`,
      latestSaved: sql<string | null>`max(${userLibrary.createdAt})`,
      latestUpdate: sql<string | null>`max(${audiobooks.updatedAt})`,
    })
    .from(userLibrary)
    .innerJoin(audiobooks, eq(userLibrary.audiobookId, audiobooks.id))
    .where(eq(userLibrary.userId, userId));

  const totalCount = Number(cacheMeta?.count ?? 0);
  const tsSaved = cacheMeta?.latestSaved
    ? new Date(cacheMeta.latestSaved).getTime()
    : 0;
  const tsUpdate = cacheMeta?.latestUpdate
    ? new Date(cacheMeta.latestUpdate).getTime()
    : 0;

  // Construct a weak ETag based on the composite schema states
  // Note: Cloudflare prefers Weak ETags W/"..." if features like Brotli compression are active.
  const eTagValue = `W/"lib-${userId}-${totalCount}-${tsSaved}-${tsUpdate}"`;

  // If nothing changed, return a 304 immediately. We completely skip fetching rows.
  if (c.req.header("If-None-Match") === eTagValue) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: eTagValue,
        "Cache-Control": "no-cache, must-revalidate",
      },
    });
  }

  const rows = await db
    .select({
      id: audiobooks.id,
      title: audiobooks.title,
      author: audiobooks.author,
      description: audiobooks.description,
      ratings: audiobooks.ratings,
      status: audiobooks.status,
      visibility: audiobooks.visibility,
      coverBucketName: audiobooks.coverBucketName,
      coverS3Key: audiobooks.coverS3Key,
      savedAt: userLibrary.createdAt,
    })
    .from(userLibrary)
    .innerJoin(audiobooks, eq(userLibrary.audiobookId, audiobooks.id))
    .where(eq(userLibrary.userId, userId))
    .orderBy(desc(userLibrary.createdAt));

  const mapped = rows.map((book) => {
    let coverUrl = `${c.env.RANDOM_COVER_BASE_URL}/${book.id}/300/450`;
    if (book.coverBucketName && book.coverS3Key) {
      const filename = book.coverS3Key.split("/").pop();
      coverUrl = `${baseUrl}/cover/${filename}`;
    }
    return { ...book, coverUrl };
  });

  return c.json({ results: mapped }, 200, {
    "Cache-Control": "no-cache, must-revalidate",
    ETag: eTagValue,
  });
});

//! add search endpoint for user's own books with optional query param to filter by title/author/id instead of fetching all and filtering client-side

app.post("/:bookId", async (c) => {
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { id: userId, role } = c.var.authSession.user;
  const audiobookId = c.req.param("bookId");

  // Verify book exists and is visible to this user
  const [book] = await db
    .select({
      id: audiobooks.id,
      visibility: audiobooks.visibility,
      userId: audiobooks.userId,
    })
    .from(audiobooks)
    .where(eq(audiobooks.id, audiobookId));

  if (!book) return c.json({ error: "Audiobook not found" }, 404);

  // Can only save public books or own private books or admin can save anything
  const isAdmin = role === "admin";
  if (book.visibility === "private" && book.userId !== userId && !isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .insert(userLibrary)
    .values({ userId, audiobookId })
    .onConflictDoNothing();

  // No manual eviction logic needed! The next GET request will pull the new row
  // count and modified timestamp, rendering old browser cache keys automatically outdated.
  return c.json({ ok: true });
});

app.delete("/:bookId", async (c) => {
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { id: userId } = c.var.authSession.user;
  const audiobookId = c.req.param("bookId");

  await db
    .delete(userLibrary)
    .where(
      and(
        eq(userLibrary.userId, userId),
        eq(userLibrary.audiobookId, audiobookId),
      ),
    );

  return c.json({ ok: true });
});

app.get("/check/:bookId", async (c) => {
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { id: userId } = c.var.authSession.user;
  const audiobookId = c.req.param("bookId");

  const [row] = await db
    .select({ id: userLibrary.id })
    .from(userLibrary)
    .where(
      and(
        eq(userLibrary.userId, userId),
        eq(userLibrary.audiobookId, audiobookId),
      ),
    );

  const isSaved = !!row;

  // Construct a weak status token for the single bookmark entity
  const eTagValue = `W/"check-${userId}-${audiobookId}-${isSaved}"`;

  if (c.req.header("If-None-Match") === eTagValue) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: eTagValue,
        "Cache-Control": "no-cache, must-revalidate",
      },
    });
  }

  return c.json({ saved: isSaved }, 200, {
    "Cache-Control": "no-cache, must-revalidate",
    ETag: eTagValue,
  });
});
export default app;
