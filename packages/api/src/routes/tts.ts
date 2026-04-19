import { Hono } from "hono";
// import { sValidator } from "@hono/standard-validator";
import { boss } from "../queue.js";
import {
  JobStatusResponseSchema,
  TTSRequestSchema,
  TTSResponseSchema,
  type JobStatusResponse,
  type TTSResponse,
} from "@audiobook/shared-libs/schema/tts.js";
import { validator as sValidator, resolver, describeRoute } from "hono-openapi";

const app = new Hono();

app.post(
  "/tts",
  describeRoute({
    description: "Queue a TTS job",
    responses: {
      202: {
        description: "Job queued",
        content: {
          "application/json": { schema: resolver(JobStatusResponseSchema) },
        },
      },
      400: {
        description: "Invalid request body",
        content: {
          string: { schema: { type: "string" } },
        },
      },
      500: {
        description: "Failed to enqueue job",
        content: {
          "application/json": { schema: resolver(JobStatusResponseSchema) },
        },
      },
    },
  }),
  sValidator("json", TTSRequestSchema),
  async (c) => {
    const body = c.req.valid("json");

    const jobId = await boss.send("tts-generate", {
      ...body,
      output_filename: `${crypto.randomUUID().split("-")[0]}.mp3`,
    }); // send one job to the queue only, not batch insert

    if (!jobId) {
      return c.json<JobStatusResponse>(
        {
          jobId: "NULL",
          status: "failed",
          error: { message: "Failed to enqueue job" },
        },
        500,
      );
    }

    return c.json<JobStatusResponse>({ jobId, status: "created" }, 202);
  },
);

app.get(
  "/tts/:jobId",
  describeRoute({
    description: "Get TTS job status",
    responses: {
      200: {
        description: "Job status",
        content: {
          "application/json": { schema: resolver(JobStatusResponseSchema) },
        },
      },
      404: {
        description: "Job not found",
        content: {
          "application/json": { schema: resolver(JobStatusResponseSchema) },
        },
      },
      500: {
        description: "Invalid job output or failed job",
        content: {
          "application/json": { schema: resolver(JobStatusResponseSchema) },
        },
      },
    },
  }),
  async (c) => {
    const jobId = c.req.param("jobId");
    const [job] = await boss.findJobs<TTSResponse>("tts-generate", {
      id: jobId,
    });

    if (!job) {
      return c.json<JobStatusResponse>(
        {
          jobId,
          status: "not_found",
          error: { message: "Job not found or expired" },
        },
        404,
      );
    }

    if (job.state === "completed") {
      const result = TTSResponseSchema.safeParse(job.output);
      if (!result.success) {
        return c.json<JobStatusResponse>(
          {
            jobId,
            status: "failed",
            error: { ...job.output, zod: "Invalid job output" },
          },
          500,
        );
      }
      return c.json<JobStatusResponse>({
        jobId,
        status: "completed",
        ...result.data,
      });
    }

    if (job.state === "failed") {
      return c.json<JobStatusResponse>(
        { jobId, status: "failed", error: job.output },
        500,
      );
    }

    return c.json<JobStatusResponse>({ jobId, status: job.state }); // 'created' | 'retry' | 'active' | 'cancelled'
  },
);

export default app;
