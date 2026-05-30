import { eq } from "@audiobook/db/src/index";
import { getDb } from "@audiobook/db/src";
import { audiobooks } from "@audiobook/db/src/schema/schema";
import type { HLSJobData } from "@audiobook/hls/src/index";

export interface HLSQueueJobData {
  audiobookId: string;
}

export async function handleHLSQueue(
  batch: MessageBatch<HLSQueueJobData>,
  env: Cloudflare.Env,
): Promise<void> {
  const db = getDb(env.HYPERDRIVE.connectionString);

  for (const message of batch.messages) {
    const { audiobookId } = message.body;

    try {
      console.log(`[hls queue] Building job for ${audiobookId}`);

      const hlsJob: HLSJobData = {
        audiobookId,
        outputBucket: env.MEDIA_BUCKET_NAME,
        outputPrefix: `audiobooks/${audiobookId}/hls/`,
      };

      const jobRunId = await triggerRailwayJob(hlsJob, env);

      await db
        .update(audiobooks)
        .set({
          hlsJobId: jobRunId,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, audiobookId));

      console.log(
        `[hls queue] ✓ Railway job ${jobRunId} triggered for ${audiobookId}`,
      );

      message.ack();
    } catch (error) {
      console.error(`[hls queue] ✗ Failed for ${audiobookId}:`, error);

      await db
        .update(audiobooks)
        .set({
          status: "failed",
          errorMessage: `HLS Stage Failure: ${String(error)}`,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, audiobookId));

      message.retry();
    }
  }
}

// ─── Railway GraphQL trigger ───────────────────────────────────────────────────

interface RailwayJobRunResponse {
  data: {
    jobRun: {
      id: string;
    };
  };
  errors?: Array<{ message: string }>;
}

async function triggerRailwayJob(
  job: HLSJobData,
  env: Cloudflare.Env,
): Promise<string> {
  const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

  const jobPayload = JSON.stringify(job);

  // Railway jobRun mutation with variable overrides
  // serviceId = your Railway service ID (the HLS transcoder service)
  const mutation = `
    mutation TriggerJobRun($serviceId: String!, $environmentId: String!, $variables: [VariableCollectionInput!]) {
      jobRun(
        input: {
          serviceId: $serviceId
          environmentId: $environmentId
          variables: $variables
        }
      ) {
        id
      }
    }
  `;

  const response = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RAILWAY_API_TOKEN}`,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        serviceId: env.RAILWAY_SERVICE_ID,
        environmentId: env.RAILWAY_ENVIRONMENT_ID,
        // These override env vars for this specific run only
        variables: [
          {
            name: "JOB_PAYLOAD",
            value: jobPayload,
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Railway API request failed (${response.status}): ${text}`);
  }

  const result = (await response.json()) as RailwayJobRunResponse;

  if (result.errors?.length) {
    throw new Error(
      `Railway GraphQL error: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  if (!result.data?.jobRun?.id) {
    throw new Error(
      `Railway returned no job run ID: ${JSON.stringify(result)}`,
    );
  }

  return result.data.jobRun.id;
}
