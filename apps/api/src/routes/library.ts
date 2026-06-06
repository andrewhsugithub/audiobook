import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql, ilike, or, asc } from "@audiobook/db/src/index";
import { getDb } from "@audiobook/db/src";
import { userLibrary, audiobooks } from "@audiobook/db/src/schema/schema";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../types/env";

const app = new Hono<Env>();
app.use("*", authMiddleware);

const librarySearchSchema = z.object({
  q: z.string().default(""),
  limit: z.coerce.number().min(1).max(50).default(10),
  offset: z.coerce.number().min(0).default(0),
  sort: z
    .enum(["recent", "title-asc", "title-desc", "author-asc", "rating-desc"])
    .default("recent"),
  visibility: z.enum(["all", "public", "private"]).default("all"),
  scope: z.enum(["saved", "uploaded"]).default("saved"),
});

// for my-books page: search/sort/filter user's saved library or uploaded books
// TODO: should split into seperate endpoints a "search" endpoint and also for "saved" vs "uploaded" scopes to simplify logic and caching
app.get("/", zValidator("query", librarySearchSchema), async (c) => {
  const { q, limit, offset, sort, visibility, scope } = c.req.valid("query");
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { id: userId } = c.var.authSession.user;
  const baseUrl = new URL(c.req.url).origin;

  const isSaved = scope === "saved";

  // Build each condition independently so undefined values never enter and()
  const ownerCondition = isSaved
    ? eq(userLibrary.userId, userId)
    : eq(audiobooks.userId, userId);

  const visibilityCondition =
    visibility !== "all"
      ? eq(audiobooks.visibility, visibility as "public" | "private")
      : undefined;

  const needle = q.trim();
  const searchCondition =
    needle.length > 0
      ? or(
          ilike(audiobooks.title, `%${needle}%`),
          // Cast author to text so ilike works safely on nullable columns
          sql`${audiobooks.author} ILIKE ${"%" + needle + "%"}`,
        )
      : undefined;

  // and() accepts undefined values and filters them out cleanly
  const whereCondition = and(
    ownerCondition,
    visibilityCondition,
    searchCondition,
  );

  const orderBy =
    sort === "title-asc"
      ? [asc(audiobooks.title)]
      : sort === "title-desc"
        ? [desc(audiobooks.title)]
        : sort === "author-asc"
          ? [sql`${audiobooks.author} ASC NULLS LAST`]
          : sort === "rating-desc"
            ? [sql`${audiobooks.ratings} DESC NULLS LAST`]
            : isSaved
              ? [desc(userLibrary.createdAt)]
              : [desc(audiobooks.updatedAt)];

  const selectFields = {
    id: audiobooks.id,
    title: audiobooks.title,
    author: audiobooks.author,
    description: audiobooks.description,
    ratings: audiobooks.ratings,
    status: audiobooks.status,
    visibility: audiobooks.visibility,
    coverBucketName: audiobooks.coverBucketName,
    coverS3Key: audiobooks.coverS3Key,
    userId: audiobooks.userId,
  };

  const [results, countRows] = await Promise.all([
    isSaved
      ? db
          .select(selectFields)
          .from(userLibrary)
          .innerJoin(audiobooks, eq(userLibrary.audiobookId, audiobooks.id))
          .where(whereCondition)
          .orderBy(...orderBy)
          .limit(limit)
          .offset(offset)
      : db
          .select(selectFields)
          .from(audiobooks)
          .where(whereCondition)
          .orderBy(...orderBy)
          .limit(limit)
          .offset(offset),

    isSaved
      ? db
          .select({ total: sql<number>`count(*)::int` })
          .from(userLibrary)
          .innerJoin(audiobooks, eq(userLibrary.audiobookId, audiobooks.id))
          .where(whereCondition)
      : db
          .select({ total: sql<number>`count(*)::int` })
          .from(audiobooks)
          .where(whereCondition),
  ]);

  const total = countRows[0]?.total ?? 0;

  const mapped = results.map((book) => {
    let coverUrl = `${c.env.RANDOM_COVER_BASE_URL}/${book.id}/300/450`;
    if (book.coverBucketName && book.coverS3Key) {
      const filename = book.coverS3Key.split("/").pop();
      coverUrl = `${baseUrl}/cover/${book.id}/${filename}`;
    }
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      ratings: book.ratings,
      status: book.status,
      visibility: book.visibility,
      coverUrl,
      isOwner: book.userId === userId,
    };
  });

  return c.json({ results: mapped, total }, 200, {
    "Cache-Control": "private, no-store",
  });
});

app.post("/:bookId", async (c) => {
  const db = getDb(c.env.HYPERDRIVE.connectionString);
  const { id: userId, role } = c.var.authSession.user;
  const audiobookId = c.req.param("bookId");

  const [book] = await db
    .select({
      id: audiobooks.id,
      visibility: audiobooks.visibility,
      userId: audiobooks.userId,
    })
    .from(audiobooks)
    .where(eq(audiobooks.id, audiobookId));

  if (!book) return c.json({ error: "Audiobook not found" }, 404);

  if (
    book.visibility === "private" &&
    book.userId !== userId &&
    role !== "admin"
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .insert(userLibrary)
    .values({ userId, audiobookId })
    .onConflictDoNothing();

  // No manual eviction logic needed! The next GET request will pull the new row
  // count and modified timestamp, rendering old browser cache keys automatically outdated.
  return c.json({ ok: true }, 200, {
    "Cache-Control": "private, no-store",
  });
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

  return c.json({ ok: true }, 200, {
    "Cache-Control": "private, no-store",
  });
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
    "Cache-Control": "private, no-cache, must-revalidate",
    ETag: eTagValue,
  });
});

export default app;
