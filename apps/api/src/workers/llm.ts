import type { TTSResponse } from "@audiobook/shared-libs/schema/tts.js";
import { boss } from "../queue.js";
import { addTags } from "../services/llm.js";
import { type AudiobookRequest } from "@audiobook/shared-libs/schema/audiobook.js";
import { json } from "stream/consumers";

export function startLLMWorker() {
  boss.work<AudiobookRequest, string>("add-tags", async ([job]) => {
    console.log(`Starting job ${job.id} for llm queue`);

    // add to db
    const uuid = crypto.randomUUID();

    const data = job.data;
    const text = data.text!;
    // TODO: segment the text into smaller chunks if it's too long, to avoid context length limit of the model:
    // TODO: parse file if passed
    const result = await addTags(text);

    const tagId = [];
    for (const tag of result) {
      const ttsId = await boss.send("tts", { ...data, text: tag });
      tagId.push(ttsId!);
    }

    const ttsUrl: string[] = [];
    Promise.all(
      tagId.map(async (id) => {
        const [tts] = await boss.findJobs<TTSResponse>("tts", {
          id: id,
        });
        ttsUrl.push(tts?.data.fileUrl!);
        return tts;
      }),
    ).then((res) => {
      console.log(`All tts jobs done for llm job ${job.id}! Result: ${res}`);
    });

    console.log(`Job ${job.id} done in llm queue! Result: ${result}`);

    return json({ uuid, ttsUrl, tags: result });
  });
}
