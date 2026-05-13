import {
  type TTSRequest,
  type TTSResponse,
} from "@audiobook/shared-libs/schema/tts.js";
import { boss } from "../queue.js";
import { generateAudio } from "../services/tts.js";

export function startTTSWorker() {
  boss.work<TTSRequest, TTSResponse>("tts", async ([job]) => {
    console.log(`Starting job ${job.id} for tts queue`);
    const result = await generateAudio(job.data);

    console.log(`Job ${job.id} done in tts queue! Saved at: ${result.fileUrl}`);

    return result;
  });
}
