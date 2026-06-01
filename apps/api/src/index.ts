import { DOMParser, Node as XMLDOMNode } from "@xmldom/xmldom";

// @ts-ignore
if (typeof globalThis.DOMParser === "undefined") {
  (globalThis as any).DOMParser = DOMParser;
}

// @ts-ignore
if (typeof globalThis.Node === "undefined") {
  (globalThis as any).Node = XMLDOMNode;
}

import { Hono } from "hono";
import { queue } from "./queue";
import { openAPIRouteHandler } from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import upload from "./routes/upload";
import { cors } from "hono/cors";
import audiobook from "./routes/audiobook";
import cover from "./routes/cover";

type Env = {
  Bindings: Cloudflare.Env;
};

const app = new Hono<Env>();

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

app.use(
  "/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
    allowMethods: ["GET", "OPTIONS", "POST", "PUT", "PATCH"],
    allowHeaders: ["Range", "Content-Type", "If-None-Match"],
    exposeHeaders: [
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
      "X-Cache-Status",
      // Local-dev multipart: the browser reads the part ETag from the
      // /local-upload-part response to build the completion manifest.
      "ETag",
    ],
    credentials: true,
    maxAge: 86400, // Cache preflight flags for 24h
  }),
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get(
  "/docs",
  swaggerUI({
    url: "/openapi.json",
  }),
);

app.route("/audiobook", audiobook);
app.route("/upload", upload);
app.route("/cover", cover);

// ── Local-dev storage shim ──────────────────────────────────────────────────
// In local / r2-native mode there is no real object store to presign against,
// so R2NativeStorageProvider hands the client mock URLs that point back here
// (see packages/storage/src/provider.ts). These routes perform the actual R2
// multipart part-upload and object download against the Worker's R2 bindings.
// In S3/Supabase mode the client talks to the object store directly and these
// routes are never hit. We read the binding straight off c.env by name instead
// of going through the storage abstraction: R2NativeStorageProvider relies on
// module-level bindings that are never populated, and per-request R2 access
// belongs on c.env, not in shared global state.
app.put("/local-upload-part", async (c) => {
  const bucketName = c.req.query("bucket");
  const key = c.req.query("key");
  const uploadId = c.req.query("uploadId");
  const partNumber = Number(c.req.query("partNumber"));

  if (!bucketName || !key || !uploadId || !Number.isInteger(partNumber)) {
    return c.json(
      { error: "Missing/invalid bucket, key, uploadId, or partNumber" },
      400,
    );
  }

  const bucket = (c.env as unknown as Record<string, any>)[bucketName];
  if (!bucket?.resumeMultipartUpload) {
    return c.json({ error: `R2 binding not found for bucket: ${bucketName}` }, 500);
  }

  try {
    const upload = await bucket.resumeMultipartUpload(key, uploadId);
    const body = await c.req.arrayBuffer();
    const uploaded = await upload.uploadPart(partNumber, body);

    // Client reads ETag to assemble the completion manifest (it strips quotes).
    return new Response(null, { status: 200, headers: { ETag: uploaded.etag } });
  } catch (error: any) {
    console.error(`[local-upload-part] part ${partNumber} failed:`, error);
    return c.json({ error: `Part upload failed: ${error.message}` }, 500);
  }
});

app.get("/local-download", async (c) => {
  const bucketName = c.req.query("bucket");
  const key = c.req.query("key");

  if (!bucketName || !key) {
    return c.json({ error: "Missing bucket or key" }, 400);
  }

  const bucket = (c.env as unknown as Record<string, any>)[bucketName];
  if (!bucket?.get) {
    return c.json({ error: `R2 binding not found for bucket: ${bucketName}` }, 500);
  }

  const obj = await bucket.get(key);
  if (!obj) return c.json({ error: "Object not found" }, 404);

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type":
        obj.httpMetadata?.contentType ?? "application/octet-stream",
    },
  });
});

app.get(
  "/openapi.json",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "Hono",
        version: "1.0.0",
        description: "API for greeting users",
      },
    },
    includeEmptyPaths: true,
  }),
);

// app.get("/tagging", async (c) => {
//   await c.env.TAGGING_QUEUE
//     .send(`As it happened, just as the Captain was taking his first bite, Angeliki was walking past. She could not help asking.

// “How’s the tiropita, sir?”

// “Oh delicious, thank you. It brings back memories,” said the captain.

// And then he looked up at her again.

// She seemed strangely familiar.

// “You know, I just arrived here, but I feel like this is a home from home,” he said.

// “Aw that’s a lovely compliment,” smiled Angeliki, obviously pleased.`);
// });

// app.get("/tagging2", async (c) => {
//   await c.env.TAGGING_QUEUE.send(
//     `As it happened, just as the Captain was taking his first bite, Angeliki was walking past. She could not help asking.`,
//   );
// });

export default {
  fetch: app.fetch,
  queue: queue,
};
