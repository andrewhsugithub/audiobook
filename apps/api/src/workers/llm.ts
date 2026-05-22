import type { TTSResponse } from "@audiobook/shared-libs/schema/tts.js";
import { boss } from "../queue.js";
import { addTags } from "../services/llm.js";
import { type AudiobookRequest } from "@audiobook/shared-libs/schema/audiobook.js";
// import { json } from "stream/consumers";
import crypto from "crypto"; 


function estimateTokens(text: string): number {
  // Split by whitespace to count words
  const wordCount = text.trim().split(/\s+/).length;
  return Math.floor(wordCount * 2);
}

function chunkTextUltimateFixed(text: string, maxTokens: number = 2500): string[] {
  const pattern = /(?<!\b(?:Mr|Mrs|Dr|Prof|Sr|Jr|Ms))\.(?=\s+[“"A-Z])|(?<=[!?])\s+(?=["“A-Z])|(?<=[.!?][”"’])\s+(?=["“A-Z])/;
  const semanticBlocks = text.split(pattern);
  const pronounPattern = /\b(he|she|it|they|him|her|them|his|hers|its|their|theirs|these|those)\b/i;

  const chunks: string[] = [];
  let currentChunk = "";
  const countChar = (str: string, char: string) => str.split(char).length - 1;

  for (let block of semanticBlocks) {
    if (!block) continue;
    const blockWithSpace = block.trim() + " ";
    const blockTokens = estimateTokens(blockWithSpace);

    const isCurlyBalanced = countChar(currentChunk, '“') === countChar(currentChunk, '”');
    const isStraightBalanced = countChar(currentChunk, '"') % 2 === 0;
    const isBalanced = isCurlyBalanced && isStraightBalanced;
    const hasPronounCurrent = pronounPattern.test(blockWithSpace);

    if (!isBalanced || (hasPronounCurrent && currentChunk.trim() !== "")) {
      currentChunk += blockWithSpace;
      continue;
    }
    const currentTokens = estimateTokens(currentChunk);

    if (currentTokens + blockTokens > maxTokens) {
      if (currentChunk.trim() !== "") {
        chunks.push(currentChunk.trim());
      }
      currentChunk = blockWithSpace;
    } else {
      currentChunk += blockWithSpace;
    }
  }

  if (currentChunk.trim() !== "") {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}


export function startLLMWorker() {
  boss.work<AudiobookRequest, { bookID: string; ttsUrl: string[]; tags: string[] }>("add-tags", async ([job]) => {
    console.log(`Starting job ${job.id} for llm queue`);

    // add to db
    //TODO: may need to fix if add DB in the future 
    const uuid = crypto.randomUUID();
    console.log(`Generated UUID ${uuid} for job ${job.id}`);

    const data = job.data;
    const text = data.text!;
    
    const chunks = chunkTextUltimateFixed(text, 2500);
    console.log(`Job ${job.id} text has been split into ${chunks.length} chunks.`);

    const allTags: string[] = [];
    
    // process chunks within LLM context limit
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${chunks.length} for job ${job.id}...`);
      
      try {
        const chunkResult = await addTags(chunks[i]);
        
        if (Array.isArray(chunkResult)) {
          allTags.push(...chunkResult);
        } else {
          allTags.push(chunkResult as string);
        }
      } catch (error) {
        console.error(`Error processing chunk ${i + 1} for job ${job.id}:`, error);
        throw error; 
      }
    }

    console.log(`ADD Tags for job ${job.id}: ${allTags.join(", ")}`);

    // collect all tags and send to TTS 
    const ttsJobIds: (string | null)[] = await Promise.all(
      allTags.map((tag) => boss.send("tts", { ...data, text: tag }))
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
    
    return { bookID: uuid, ttsUrl: ttsUrls, tags: allTags };
  });
}