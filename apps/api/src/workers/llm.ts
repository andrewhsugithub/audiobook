import { boss } from "../queue.js";
import { addTags } from "../services/llm.js";
import { type AudiobookRequest } from "@audiobook/shared-libs/schema/audiobook.js";

export function startLLMWorker() {
  boss.work<AudiobookRequest, string>("add-tags", async ([job]) => {
    console.log(`Starting job ${job.id} for llm queue`);

    // add to db

    const data = job.data;
    const text = data.text!;
    // TODO: segment the text into smaller chunks if it's too long, to avoid context length limit of the model:
    // TODO: parse file if passed
    const result = await addTags(text);

    console.log(`Job ${job.id} done in llm queue! Result: ${result}`);
    const jobId = await boss.send("tts", { ...data, text: result });

    return "";
  });
}
