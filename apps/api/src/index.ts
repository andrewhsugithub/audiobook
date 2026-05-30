import { Hono } from "hono";
import { queue } from "./queue";
import { openAPIRouteHandler } from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import upload from "./routes/upload";
import { cors } from "hono/cors";
import audiobook from "./routes/audiobook";

type Env = {
  Bindings: Cloudflare.Env;
};

const app = new Hono<Env>();

// ─── CORS ─────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = ["http://localhost:5173"];

// ─── CORS MANAGEMENT (DYNAMIC WHITELIST) ─────────────────────────────────────
app.use(
  "/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
    allowMethods: ["GET", "OPTIONS", "POST"],
    allowHeaders: ["Range", "Content-Type", "If-None-Match"],
    exposeHeaders: [
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
      "X-Cache-Status",
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
