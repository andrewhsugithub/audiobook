import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { boss } from "./queue.js";
import tts from "./routes/tts.js";
import { swaggerUI } from "@hono/swagger-ui";
import { openAPIRouteHandler } from "hono-openapi";
import { startWorker } from "./worker.js";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get(
  "/docs",
  swaggerUI({
    url: "/openapi.json",
  }),
);

app.route("/audio", tts);

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

async function boot() {
  await boss.start();
  console.log("✅ pg-boss connected");

  await boss.deleteQueue("tts-generate"); // delete existing queue if exists, for development convenience
  await boss.createQueue("tts-generate", {
    retryLimit: 2,
    expireInSeconds: 60 * 10, // 10 minutes
    deleteAfterSeconds: 60 * 60 * 24, // 24 hours //! doesn't delete for some reason, need investigate
  }); // all other options are default, see QueueOptions interface
  console.log("✅ pg-boss queue created: tts-generate");

  startWorker();
  console.log("✅ Worker imported and running");

  serve(
    {
      fetch: app.fetch,
      port: 3000,
    },
    (info) => {
      console.log(`✅ Hono Server running on http://localhost:${info.port}`);
    },
  );
}

boot().catch(console.error);
