import type { TTSResponse } from "@audiobook/shared-libs/schema/tts.js";
import { boss } from "../queue.js";
import { addTags } from "../services/llm.js";
import { type AudiobookRequest } from "@audiobook/shared-libs/schema/audiobook.js";
import { json } from "stream/consumers";

export function startLLMWorker() {
  boss.work<AudiobookRequest, { bookID: string; ttsUrl: string[]; tags: string[] }>("add-tags", async ([job]) => {
    console.log(`Starting job ${job.id} for llm queue`);

    // add to db
    const uuid = crypto.randomUUID();
    console.log(`Generated UUID ${uuid} for job ${job.id}`);

    const data = job.data;
    const text = data.text!;
    // TODO: segment the text into smaller chunks if it's too long, to avoid context length limit of the model:
    // TODO: parse file if passed
    
    const result = await addTags(text);
    console.log(`ADD Tags for job ${job.id}: ${result.join(", ")}`);

    const ttsJobIds: (string | null)[] = await Promise.all(
      result.map((tag) => boss.send("tts", { ...data, text: tag }))
    );
    console.log(`Enqueued ${ttsJobIds.length} TTS jobs for llm job ${job.id}`);
    const ttsUrls: string[] = [];

    // Polling
    await Promise.all(
      ttsJobIds.map(async (id) => {
        if (!id) return;
        
        while (true) {
          const [ttsJob] = await boss.findJobs<TTSResponse>("tts", { id: id }); 
          if (ttsJob && ttsJob.state === 'completed') {
            const fileUrl = ttsJob.data?.fileUrl;
            if (fileUrl) {
              ttsUrls.push(fileUrl);
            }
            break; 
          } else if (ttsJob && ttsJob.state === 'failed') {
            console.error(`TTS Job ${id} failed`);
            break; 
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      })
    );
    console.log(`All TTS jobs completed for llm job ${job.id}. Collected URLs: ${ttsUrls.join(", ")}`);
    

    return { bookID: uuid, ttsUrl: ttsUrls, tags: result };
  });
}
