import { DOMParser, Node as XMLDOMNode } from "@xmldom/xmldom";

(globalThis as any).DOMParser = DOMParser;
(globalThis as any).Node = XMLDOMNode;

import { Hono } from "hono";
import { queue } from "./queue";
import { openAPIRouteHandler } from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import upload from "./routes/upload";
import audiobook from "./routes/audiobook";
import cover from "./routes/cover";
import { corsMiddleware } from "./middleware/cors";
import { mountAuthRoutes } from "./middleware/auth";
import { globalErrorHandler, notFoundHandler } from "./middleware/error";
import type { Env } from "./types/env";
import library from "./routes/library";

const app = new Hono<Env>();

app.use("*", corsMiddleware);

// ── Better Auth — handles /api/auth/* (sign-in, sign-up, session, etc.) ───────
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  mountAuthRoutes(c.env)(c.req.raw),
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
app.route("/library", library);

app.onError(globalErrorHandler);
app.notFound(notFoundHandler);

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
