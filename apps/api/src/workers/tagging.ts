import { OpenAI } from "openai/client";
import { eq, getDb } from "@audiobook/db/src";
import { storage } from "@audiobook/storage/src/storage.cf";
import { assets, audiobooks } from "@audiobook/db/src/schema/schema";
import type { LLMTagJobData, VoiceMappingJobData } from "../types/jobs";

//? maybe can be passed in the message body instead of hardcoding
const MODEL_ID = "@cf/google/gemma-4-26b-a4b-it";

// emotion list from https://docs.cartesia.ai/api-reference/tts/bytes#body-generation-config's emotion parameter
const SYSTEM_PROMPT = `You are an expert Audio Script Annotator. Your task is to process raw story text and format it into a highly detailed audio script with precise speaker identification, steady narration, and selective emotion/emphasis tags tailored for Cartesia sonic-3.5.

### CRITICAL SYSTEM OVERRIDE (ACT AS A COMPILER)
To prevent tagging errors, you MUST process emotions strictly like a computer compiler reading an ENUM array. Generating ANY word outside the defined array will cause a FATAL SYSTEM CRASH. 

### CORE RULES (STRICT COMPLIANCE REQUIRED)

1. IDENTIFY THE EXACT SPEAKER OR NARRATOR:
- Text INSIDE quotation marks ("..." or '...' or 「...」) is spoken by a specific character. 
- Text OUTSIDE quotation marks is ALWAYS [Narrator]. 

2. STRICT RULE FOR SPLITTING:
- You MUST separate quotes and narration into DIFFERENT lines. NEVER mix them.
- DO NOT delete quotation marks.

3. EMOTION TAG TYPE DEFINITION (STRICT ENUM LIST):
The <emotion value="..."> tag only accepts exact strings. You are strictly restricted to the following VALID_EMOTION_ENUM array ONLY:

VALID_EMOTION_ENUM = [
  "neutral", "happy", "excited", "enthusiastic", "elated", "euphoric", "triumphant", "amazed", "surprised", "flirtatious", "curious", "content", "peaceful", "serene", "calm", "grateful", "affectionate", "trust", "sympathetic", "anticipation", "mysterious", "angry", "mad", "outraged", "frustrated", "agitated", "threatened", "disgusted", "contempt", "envious", "sarcastic", "ironic", "sad", "dejected", "melancholic", "disappointed", "hurt", "guilty", "bored", "tired", "rejected", "nostalgic", "wistful", "apologetic", "hesitant", "insecure", "confused", "resigned", "anxious", "panicked", "alarmed", "scared", "proud", "confident", "distant", "skeptical", "contemplative", "determined"
]

4. TAG ASSIGNMENT STRATEGY:
- For [Narrator]: 
  ALWAYS output: [Narrator] <emotion value="neutral"/> Text
- For Characters: 
  * You MUST evaluate the character's tone and map it to exactly ONE string from the \`VALID_EMOTION_ENUM\` array.
  * If the character's tone does not perfectly match any word in the array, DO NOT ADD ANY EMOTION TAG.

### STRICT OUTPUT FORMAT
- Character (With Tag): [Speaker] <emotion value="EXACT_STRING_FROM_ENUM"/> "Text"
- Character (No Tag): [Speaker] "Text"
- Narration: [Narrator] <emotion value="neutral"/> Text

--- EXAMPLE INPUT ---
"We will be able to cure her, Argus," said Dumbledore patiently.
"I'll make it," Lockhart butted in. "I must have done it a hundred times."
Something in Ron’s voice made Harry ask, "You do believe me, don’t you?"
To his surprise, Ron stifled a snigger. "Well — it's Filch," he said.

--- EXAMPLE OUTPUT ---
[Dumbledore] <emotion value="confident"/> "We will be able to cure her, Argus,"
[Narrator] <emotion value="neutral"/> said Dumbledore patiently.
[Lockhart] <emotion value="enthusiastic"/> "I'll make it,"
[Narrator] <emotion value="neutral"/> Lockhart butted in.
[Lockhart] <emotion value="proud"/> "I must have done it a hundred times."
[Narrator] <emotion value="neutral"/> Something in Ron’s voice made Harry ask,
[Harry] <emotion value="anxious"/> "You do <emotion value="scared"/> believe me, don’t you?"
[Narrator] <emotion value="neutral"/> To his surprise, Ron stifled a snigger.
[Ron] <emotion value="sarcastic"/> "Well — it's Filch,"
[Narrator] <emotion value="neutral"/> he said.`;

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

    const { audiobookId, chunkIdx, chunkS3Key } = message.body;

    console.log(
      `[tagging queue] Processing chunk ${chunkIdx} for book ${audiobookId} (Message: ${message.id})`,
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
        temperature: 0.15,
        top_k: 40,
        top_p: 0.85,
        repetition_penalty: 1.1,
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
          `Failed to extract tagged content from LLM response for book ${audiobookId}, chunk ${chunkIdx} (Message: ${message.id}) error: ${JSON.stringify(response)}`,
        );
      }

      const taggedS3Key = `audiobooks/${audiobookId}/chunks/tagged_chunk_${chunkIdx}.txt`;

      await bucket.putObject(
        bucketName,
        taggedS3Key,
        taggedContent,
        "text/plain",
      );

      await db.insert(assets).values({
        audiobookId,
        type: "tagged_text",
        bucketName,
        s3Key: taggedS3Key,
        fileName: `tagged_chunk_${chunkIdx}.txt`,
        sequenceNumber: chunkIdx,
        mimeType: "text/plain",
        sizeBytes: new TextEncoder().encode(taggedContent).length,
      });

      console.log(
        `[tagging queue] ✓ Audiobook ${audiobookId} Chunk ${chunkIdx} tagged & saved successfully.`,
      );

      const data: VoiceMappingJobData = {
        audiobookId,
        chunkIdx,
        taggedS3Key,
      };
      await env.VOICE_MAPPING_QUEUE.send(data);

      message.ack();
    } catch (error) {
      console.error(`[tagging queue] ✗ Message ${message.id} failed:`, error);

      await db
        .update(audiobooks)
        .set({
          status: "failed",
          errorMessage: `Tagging Stage Failure: ${String(error)}`,
          updatedAt: new Date(),
        })
        .where(eq(audiobooks.id, audiobookId));

      // message.retry();
    }
  }
}
