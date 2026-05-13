import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { boss } from "./queue.js";
import { swaggerUI } from "@hono/swagger-ui";
import { openAPIRouteHandler } from "hono-openapi";
import { startTTSWorker } from "./workers/tts.js";
import audiobook from "./routes/audiobook.js";

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

app.route("/audiobook", audiobook);

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

  // await boss.deleteQueue("tts"); // delete existing queue if exists, for development convenience
  // await boss.deleteQueue("add-tags"); // delete existing queue if exists, for development convenience
  await boss.createQueue("tts", {
    retryLimit: 2,
    expireInSeconds: 60 * 10, // 10 minutes
    deleteAfterSeconds: 60 * 60 * 24, // 24 hours //! doesn't delete for some reason, need investigate
  }); // all other options are default, see QueueOptions interface
  await boss.createQueue("add-tags", {
    retryLimit: 2,
    expireInSeconds: 60 * 10, // 10 minutes
    deleteAfterSeconds: 60 * 60 * 24, // 24 hours //! doesn't delete for some reason, need investigate
  }); // all other options are default, see QueueOptions interface
  console.log("✅ pg-boss queue created: tts");

  startTTSWorker();
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
