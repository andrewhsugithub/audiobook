import { AudiobookRequestSchema } from "@audiobook/shared-libs/schema/audiobook.js";
import { Hono } from "hono";
import { boss } from "../queue.js";
import {
  JobStatusResponseSchema,
  AudiobookStatusSchema,
  type JobStatusResponse,
  type AudiobookStatus,
} from "@audiobook/shared-libs/schema/tts.js";
import { validator as sValidator, resolver, describeRoute } from "hono-openapi";
import { getFreshPresignedUrl } from "../s3.js";
import {  AudiobookWorkerOutputSchema, type AudiobookWorkerOutput } from "@audiobook/shared-libs/schema/llm.js"; 


const app = new Hono();

app.post(
  "/",
  describeRoute({
    description: "Queue an Audiobook job",
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
  sValidator("json", AudiobookRequestSchema),
  async (c) => {
    const body = c.req.valid("json");

    // send one job to the queue only, not batch insert
    const jobId = await boss.send("add-tags", { ...body });

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
  "/audiobook/:audiobookId",
  describeRoute({
    description: "Get Audiobook job status",
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
    const jobId = c.req.param("audiobookId");
    
    // 1. 確認這裡使用剛建立的型別 AudiobookWorkerOutput
    const [job] = await boss.findJobs<AudiobookWorkerOutput>("add-tags", {
      id: jobId,
    });

    if (!job) {
      return c.json<AudiobookStatus>(
        {
          jobId,
          status: "not_found",
          error: { message: "Job not found or expired" },
        },
        404,
      );
    }

    if (job.state === "completed") {
      // 2. 透過 Schema 驗證 worker 輸出的資料格式
      const result = AudiobookWorkerOutputSchema.safeParse(job.output);
      
      if (!result.success) {
        return c.json<AudiobookStatus>(
          {
            jobId,
            status: "failed",
            error: { ...job.output, zod: "Invalid job output format from worker" },
          },
          500,
        );
      }
      
      // result.data 現在包含 bookID (字串), ttsUrl (字串陣列), tags (字串陣列)
      const audiobookData = result.data;

      
      return c.json<AudiobookStatus>({
        jobId,
        status: "completed",
        ...audiobookData,
      });
    }

    if (job.state === "failed") {
      return c.json<AudiobookStatus>(
        { jobId, status: "failed", error: job.output },
        500,
      );
    }

    return c.json<AudiobookStatus>({ jobId, status: job.state }); // 'created' | 'retry' | 'active' | 'cancelled'
  },
);

export default app;
