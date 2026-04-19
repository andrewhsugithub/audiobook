import {
  TTSResponseSchema,
  type TTSRequest,
  type TTSResponse,
} from "@audiobook/shared-libs/schema/tts.js";
import { boss } from "./queue.js";

const TTS_URL = process.env.TTS_URL;

export function startWorker() {
  boss.work<TTSRequest, TTSResponse>("tts-generate", async ([job]) => {
    console.log(`Starting job ${job.id}`);
    const requestBody = job.data;

    const response = await fetch(TTS_URL + "/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(5 * 60 * 1000), // 5 minutes
    });

    if (!response.ok) {
      throw new Error(
        `TTS request failed (${response.status}): ${await response.text()}`,
      );
    }

    const json = await response.json();
    const parsed = TTSResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid TTS response: ${parsed.error.message}`);
    }

    const result = parsed.data;
    console.log(`Job ${job.id} done! Saved at: ${result.file_path}`);

    return result;
  });
}
