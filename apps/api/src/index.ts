import { Hono } from "hono";
import { queue } from "./queue.js";
import { openAPIRouteHandler } from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import audiobook from "./routes/audiobook.js";
import upload from "./routes/upload.js";
import { getDb } from "@audiobook/db/src/index.js";
import { storage } from "./storage/storage.js";

type Env = {
  Bindings: Cloudflare.Env;
};

const app = new Hono<Env>();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/test_get_wav", async (c) => {
  const db = getDb(c.env.HYPERDRIVE.connectionString);

  const file = await db.query.assets.findFirst({
    where: (assets, { eq }) => eq(assets.mimeType, "audio/wav"),
  });

  if (!file) {
    return c.json({ error: "File not found or not a valid wav." }, 404);
  }

  const store = storage.getInstance(c.env);

  const filePayload = await store.getObject(file.bucketName, file.s3Key);

  if (!filePayload) {
    return c.json({ error: "S3 object not found" }, 404);
  }

  c.header("Content-Type", "audio/wav");
  return c.body(filePayload.stream);
});

app.get(
  "/docs",
  swaggerUI({
    url: "/openapi.json",
  }),
);

// app.route("/audiobook", book);
app.route("/upload", upload);

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
