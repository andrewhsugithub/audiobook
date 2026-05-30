import { eq } from "@audiobook/db/src/index";
import { getDb } from "@audiobook/db/src";
import { audiobooks } from "@audiobook/db/src/schema/schema";
import type { HLSJobData } from "@audiobook/hls/src/index";
import { HLSQueueJobData } from "../types/jobs";

export async function handleHLSQueue(
  batch: MessageBatch<HLSQueueJobData>,
  env: Cloudflare.Env,
): Promise<void> {
  const db = getDb(env.HYPERDRIVE.connectionString);

  for (const message of batch.messages) {
    const { audiobookId } = message.body;

    try {
      const hlsJob: HLSJobData = {
        audiobookId,
        outputBucket: env.MEDIA_BUCKET_NAME,
        outputPrefix: `audiobooks/${audiobookId}/hls/`,
      };
      console.log(
        `[hls queue] Triggering job for audiobook ${audiobookId} with payload:`,
        hlsJob,
      );
      await triggerJob(hlsJob, env);

      console.log(`[hls queue] ✓ Job triggered for ${audiobookId}`);

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

      // message.retry();
    }
  }
}

// TODO: refactor to Octokit
async function triggerJob(
  jobPayload: HLSJobData,
  env: Cloudflare.Env,
): Promise<void> {
  const GITHUB_API = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`;

  const response = await fetch(GITHUB_API, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "Cloudflare HLS Queue",
    },
    body: JSON.stringify({
      event_type: "trigger-hls",
      client_payload: jobPayload,
    }),
  });

  console.log(
    `[hls queue] API response status: ${response.status} for ${jobPayload.audiobookId}`,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub Actions dispatch request failed (${response.status}): ${text}`,
    );
  }

  // GitHub responds with a clean "242 Accepted" code if everything went through perfectly.
  //? maybe return a tracking string
  return;
}
