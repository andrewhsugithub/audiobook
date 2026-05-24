// import { db } from "@audiobook/db/src/index.js";
// import { chapters, audiobooks } from "@audiobook/db/src/db/schema/schema.js";
// import { eq } from "drizzle-orm";
// import type { TaggedSegment } from "../db/schema.js";
// import { tagSpeakersAndEmotions } from "../services/llm.js";

import { OpenAI } from "openai/client.js";
import { addTags } from "../services/llm";
import { eq, getDb } from "@audiobook/db/src";
import { storage } from "../storage/storage";
import { assets, audiobooks } from "@audiobook/db/src/db/schema/schema";

export interface LLMTagJobData {
  audiobookId: string;
  chunkNumber: number;
  chunkS3Key: string;
}

//? maybe can be passed in the message body instead of hardcoding
const MODEL_ID = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = `You are an expert Audio Script Annotator. Your task is to process raw story text and format it into a highly detailed audio script with precise speaker identification, steady narration, and selective emotion/emphasis tags.

### CORE RULES (STRICT COMPLIANCE REQUIRED)

1. IDENTIFY THE EXACT SPEAKER OR NARRATOR:
- Text INSIDE quotation marks ("..." or '...' or 「...」) is spoken by a specific character. 
- WARNING: Pay attention to who is actually speaking vs. who is being addressed. (e.g., In '"Hello, John," said Mary', MARY is the speaker, NOT John).
- Text OUTSIDE quotation marks is ALWAYS [Narrator]. If a character's dialogue spans multiple sentences, do not accidentally label it as [Narrator].

2. STRICT RULE FOR SPLITTING:
- You MUST separate quotes and narration into DIFFERENT lines. NEVER mix them on the same line.
- DO NOT delete quotation marks from the text.
- If a sentence is mixed like: "Hello," said John. "How are you?"
  You MUST split it into three lines:
  [John] [Tag] "Hello,"
  [Narrator] [Tag] said John.
  [John] [Tag] "How are you?"

3. TAG MAPPING & FLEXIBLE EMOTION ASSIGNMENT:
- ALLOWED TAGS ONLY: [laugh], [chuckle], [sigh], [gasp], [cough], [clear throat], [sniff], [groan], [shush], [angry], [fear], [surprised], [whispering], [advertisement], [dramatic], [narration], [crying], [happy], [sarcastic]

TAG ASSIGNMENT STRATEGY:
- For [Narrator]: You MUST ALWAYS and ONLY use [narration]. Do NOT apply any emotion tags to the narrator. Keep it strictly descriptive.
- For Characters (Optional Base Tag): 
  * If there is a clear emotion: Start the line with a primary emotion tag right after the speaker's name (e.g., [Character] [Primary_Tag] "Text...").
  * If there is NO suitable emotion: If the dialogue is completely flat, neutral, or has absolutely no fitting emotion, DO NOT add a tag. Output it directly as [Character] "Text...".
- Mid-Sentence / Emphasis Tags: You can insert allowed tags inside the quotation marks directly before a specific word if it requires mid-speech emphasis or a sudden vocal change (e.g., "You do [gasp] believe me...").

### STRICT OUTPUT FORMAT
Format each line strictly based on emotion presence:
- With Emotion: [Speaker] [Primary_Tag] Text (or with optional mid-sentence tags)
- Without Emotion: [Speaker] Text

--- EXAMPLE INPUT ---
"We will be able to cure her, Argus," said Dumbledore patiently.
"I'll make it," Lockhart butted in. "I must have done it a hundred times."
Something in Ron’s voice made Harry ask, "You do believe me, don’t you?"
To his surprise, Ron stifled a snigger. "Well — it's Filch," he said.

--- EXAMPLE OUTPUT ---
[Dumbledore] [happy] "We will be able to cure her, Argus,"
[Narrator] [narration] said Dumbledore patiently.
[Lockhart] [happy] "I'll make it,"
[Narrator] [narration] Lockhart butted in.
[Lockhart] "I must have done it a hundred times."
[Narrator] [narration] Something in Ron’s voice made Harry ask,
[Harry] [fear] "You do [gasp] believe me, don’t you?"
[Narrator] [narration] To his surprise, Ron stifled a snigger.
[Ron] [chuckle] "Well — it's Filch,"
[Narrator] [narration] he said.`;

export async function handleTaggingQueue(
  batch: MessageBatch<LLMTagJobData>,
  env: Cloudflare.Env,
) {
  console.log(
    `[tagging queue] Received batch with ${batch.messages.length} messages ${batch.metadata} ${batch.queue}`,
  );

  const db = getDb(env.HYPERDRIVE.connectionString);
  const bucketName = env.MEDIA_BUCKET_NAME;
  const bucket = storage.getInstance(env);

  for (const message of batch.messages) {
    // console.log(`[tagging queue] Processing message ${message.id} ${message}`, {
    //   attempt: message.attempts,
    //   timestamp: message.timestamp,
    //   body: message.body,
    // });

    const { audiobookId, chunkNumber, chunkS3Key } = message.body;

    console.log(
      `[tagging queue] Processing chunk ${chunkNumber} for book ${audiobookId} (Message: ${message.id})`,
    );

    if (!audiobookId || !chunkS3Key) {
      console.error(
        `[tagging queue] Invalid message body format.`,
        message.body,
      );
      message.ack(); // Drop badly formatted messages
      continue;
    }

    try {
      await db
        .update(audiobooks)
        .set({ status: "tagging", updatedAt: new Date() })
        .where(eq(audiobooks.id, audiobookId));

      const textObject = await bucket.getObject(bucketName, chunkS3Key);
      if (!textObject) {
        throw new Error(`Chunk file not found in S3: ${chunkS3Key}`);
      }
      const rawText = await textObject.transformToString();

      const response = (await env.AI.run(MODEL_ID, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawText },
        ],
      })) as unknown as OpenAI.Chat.Completions.ChatCompletion;
      // TODO: try refactoring to the addTags function, without instantiating a new OpenAI client in that function, investigate in the direction of putting client in hono's binding/env and reusing it across the app
      // const response = await addTags(message.body);

      console.log(
        `[tagging queue] LLM Response for message ${message.id}:`,
        response,
        response.choices[0].message.content,
      );

      const taggedContent =
        (response as any).response || response.choices?.[0]?.message?.content;

      if (!taggedContent) {
        throw new Error(
          `Failed to extract tagged content from LLM response for book ${audiobookId}, chunk ${chunkNumber} (Message: ${message.id}) error: ${JSON.stringify(response)}`,
        );
      }

      const paddedIndex = String(chunkNumber).padStart(4, "0");
      const taggedS3Key = `audiobooks/${audiobookId}/chunks/tagged_chunk_${paddedIndex}.txt`;

      await bucket.putObject(
        bucketName,
        taggedS3Key,
        taggedContent,
        "text/plain",
      );

      //! should track per chunk basis otherwise this only updates for one chunk what if other chunks failed
      await db
        .update(audiobooks)
        .set({ status: "finished_tagging", updatedAt: new Date() })
        .where(eq(audiobooks.id, audiobookId));

      await db.insert(assets).values({
        audiobookId,
        type: "tagged_text",
        bucketName,
        s3Key: taggedS3Key,
        fileName: `tagged_chunk_${paddedIndex}.txt`,
        sequenceNumber: chunkNumber,
        mimeType: "text/plain",
        sizeBytes: new TextEncoder().encode(taggedContent).length,
      });

      console.log(
        `[tagging queue] ✓ Audiobook ${audiobookId} Chunk ${chunkNumber} tagged & saved successfully.`,
      );

      await env.VOICE_MAPPING_QUEUE.send({
        audiobookId,
        taggedChunkNumber: chunkNumber,
        taggedS3Key,
      });

      message.ack();
    } catch (error) {
      console.error(`[tagging queue] ✗ Message ${message.id} failed:`, error);

      await db
        .update(audiobooks)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(audiobooks.id, audiobookId));

      message.retry();
    }
  }
}

// export function startLLMTagWorker(): void {
//   boss.work<LLMTagJobData>(
//     QUEUES.LLM_TAG,
//     { teamSize: 3, teamConcurrency: 2 },
//     async ([job]) => {
//       const { audiobookId, chapterId, chapterIndex } = job.data;
//       console.log(
//         `[llm-tag] Job ${job.id} — book ${audiobookId} chapter ${chapterIndex}`,
//       );

//       // ── Fetch chapter ─────────────────────────────────────────────────────
//       const [chapter] = await db
//         .select()
//         .from(chapters)
//         .where(eq(chapters.id, chapterId));

//       if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

//       // ── LLM Tag ───────────────────────────────────────────────────────────
//       const taggedSegments = await tagSpeakersAndEmotions(
//         chapter.rawText,
//         chapterIndex,
//       );

//       console.log(
//         `[llm-tag] Chapter ${chapterIndex}: ${taggedSegments.length} segments tagged`,
//       );

//       // ── Persist segments ──────────────────────────────────────────────────
//       await db
//         .update(chapters)
//         .set({ taggedSegments })
//         .where(eq(chapters.id, chapterId));

//       // ── Enqueue voice mapping ─────────────────────────────────────────────
//       // Collect unique speakers across the chapter
//       const uniqueSpeakers = [...new Set(taggedSegments.map((s) => s.speaker))];

//       await enqueue(QUEUES.LLM_VOICE_MAP, {
//         audiobookId,
//         chapterId,
//         chapterIndex,
//         speakers: uniqueSpeakers,
//       });

//       console.log(`[llm-tag] Done job ${job.id}`);
//     },
//   );
// }
