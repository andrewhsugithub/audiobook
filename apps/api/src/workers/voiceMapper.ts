//! Across playlist updates: gaps/jumps are allowed.
//! Inside one playlist: segment sequence numbers are implicitly consecutive from the starting MEDIA-SEQUENCE.

import { getDb, eq, sql } from "@audiobook/db/src/index";
import { segments } from "@audiobook/db/src/schema/segments";
import { voices } from "@audiobook/db/src/schema/voices";
import { audiobooks } from "@audiobook/db/src/schema/schema";
import { storage } from "@audiobook/storage/src/storage.cf";
import type { TTSJobData, VoiceMappingJobData } from "../types/jobs";
import { OpenAI } from "openai/client";

const NARRATOR_TAG = "Narrator";
const MODEL_ID = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = `You are an expert Voice Casting Director for an audiobook.
Your task is to determine the gender of unmapped characters based on their names, traits, and dialogue in the provided script snippet.

You will be given:
1. "Unmapped Characters": A list of character names.
2. "Script Snippet": A chunk of the script to give you context.

Rules:
1. You MUST output exactly ONE gender ("masculine" or "feminine") for each character in the "Unmapped Characters" list.
2. Your output MUST be a valid JSON object where keys are character names and values are either "masculine" or "feminine".
3. DO NOT wrap the JSON in Markdown code blocks (e.g. \`\`\`json) or add any extra text.

Example Output:
{
  "Harry": "masculine",
  "Hermione": "feminine"
}`;

// Tagger emits `[Speaker] <emotion value="..."/> rest of line`.
// `[Speaker] rest of line` (no emotion tag) is also legal per the tagging prompt.
const SPEAKER_RE = /^\[([^\]]+)\]\s*/;
const EMOTION_RE = /^<emotion\s+value="([^"]+)"\s*\/>\s*/;

function parseTaggedLine(line: string): {
  speaker: string;
  emotion: string;
  content: string;
} {
  let rest = line;
  const speakerMatch = rest.match(SPEAKER_RE);
  const speaker = speakerMatch ? speakerMatch[1].trim() : "Unknown";
  if (speakerMatch) rest = rest.slice(speakerMatch[0].length);

  const emotionMatch = rest.match(EMOTION_RE);
  const emotion = emotionMatch ? emotionMatch[1].trim() : "neutral";
  if (emotionMatch) rest = rest.slice(emotionMatch[0].length);

  return { speaker, emotion, content: rest.trim() };
}

// Stable 32-bit FNV-1a so the same `(audiobookId, speakerTag)` always picks
// the same slot in the voice pool across chunks and re-runs.
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h = input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export async function handleVoiceMappingQueue(
  batch: MessageBatch<VoiceMappingJobData>,
  env: Cloudflare.Env,
) {
  console.log(
    `[voice-mapping queue] Received batch with ${batch.messages.length} messages, queue: ${batch.queue}`,
  );

  const db = getDb(env.HYPERDRIVE.connectionString);
  const bucketName = env.MEDIA_BUCKET_NAME;
  const bucket = storage.getInstance(env);

  for (const message of batch.messages) {
    const { audiobookId, chunkIdx, taggedS3Key } = message.body;

    console.log(
      `[voice-mapping queue] Processing tagged chunk ${chunkIdx} for book ${audiobookId} (Message: ${message.id})`,
    );

    if (!audiobookId || !taggedS3Key || chunkIdx === undefined) {
      console.error(
        `[voice-mapping queue] Invalid message body format.`,
        message.body,
      );
      message.ack();
      continue;
    }

    try {
      const textObject = await bucket.getObject(bucketName, taggedS3Key);
      if (!textObject) {
        throw new Error(`Tagged chunk file not found in S3: ${taggedS3Key}`);
      }

      const rawText = await textObject.transformToString();
      const lines = rawText.split("\n");

      // Load the Cartesia voice pool once per chunk. Narrator gets a reserved slot (first voice).
      const cartesiaVoices = await db
        .select({
          id: voices.id,
          name: voices.name,
          gender: voices.gender,
          description: voices.description,
        })
        .from(voices)
        .where(eq(voices.provider, "cartesia"))
        .orderBy(voices.id);

      if (cartesiaVoices.length === 0) {
        throw new Error(
          "No Cartesia voices available in `voices` table.",
        );
      }
      const narratorVoiceId = cartesiaVoices[0].id;
      const characterPool =
        cartesiaVoices.length > 1 ? cartesiaVoices.slice(1) : cartesiaVoices;

      // Split into gender pools
      const masculinePool = characterPool.filter((v) => v.gender === "masculine" || v.gender === "male");
      const femininePool = characterPool.filter((v) => v.gender === "feminine" || v.gender === "female");

      // Fallback if pools are empty
      if (masculinePool.length === 0) masculinePool.push(...characterPool);
      if (femininePool.length === 0) femininePool.push(...characterPool);

      // 1. Fetch Existing Mappings
      const existingMappingsList = await db
        .selectDistinct({
          speaker: segments.rawSpeakerTag,
          voiceId: segments.assignedVoiceId,
        })
        .from(segments)
        .where(eq(segments.audiobookId, audiobookId));

      const voiceMap: Record<string, string> = {
        [NARRATOR_TAG]: narratorVoiceId,
        Unknown: narratorVoiceId,
      };

      for (const m of existingMappingsList) {
        if (m.speaker && m.voiceId) {
          voiceMap[m.speaker] = m.voiceId;
        }
      }

      // 2. Identify Unmapped Speakers
      const chunkSpeakers = new Set<string>();
      for (const line of lines) {
        if (!line.trim()) continue;
        const { speaker, content } = parseTaggedLine(line);
        if (content) chunkSpeakers.add(speaker);
      }

      const unmappedCharacters: string[] = [];
      for (const spk of chunkSpeakers) {
        if (!voiceMap[spk] && spk !== NARRATOR_TAG && spk !== "Unknown") {
          unmappedCharacters.push(spk);
        }
      }

      // 3. Call LLM if there are unmapped characters
      if (unmappedCharacters.length > 0) {
        console.log(
          `[voice-mapping queue] Found unmapped characters: ${unmappedCharacters.join(", ")}`,
        );

        const userPrompt = `
Unmapped Characters:
${JSON.stringify(unmappedCharacters)}

Script Snippet:
${rawText.substring(0, 4000)}
`;

        const usedVoices = new Set(Object.values(voiceMap));

        const assignVoice = (char: string, gender: string) => {
          const pool = gender === "feminine" ? femininePool : masculinePool;
          let slot = fnv1a(`${audiobookId}:${char}`) % pool.length;
          let chosenVoiceId = pool[slot].id;

          // Hash Collision Resolution (Linear Probing)
          if (usedVoices.has(chosenVoiceId)) {
            for (let j = 1; j < pool.length; j++) {
              let nextSlot = (slot + j) % pool.length;
              let nextVoiceId = pool[nextSlot].id;
              if (!usedVoices.has(nextVoiceId)) {
                chosenVoiceId = nextVoiceId;
                break;
              }
            }
          }
          voiceMap[char] = chosenVoiceId;
          usedVoices.add(chosenVoiceId);
        };

        try {
          const response = (await env.AI.run(MODEL_ID, {
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
          })) as unknown as OpenAI.Chat.Completions.ChatCompletion;

          let llmOutput =
            (response as any).response ||
            response.choices?.[0]?.message?.content ||
            "{}";

          // Strip markdown code block if present
          llmOutput = llmOutput
            .replace(/\`\`\`json\n?/g, "")
            .replace(/\`\`\`\n?/g, "")
            .trim();

          const llmMappings = JSON.parse(llmOutput);
          console.log(`[voice-mapping queue] LLM Gender output:`, llmMappings);

          for (const char of unmappedCharacters) {
            const gender = llmMappings[char] || "masculine"; // Fallback to masculine
            assignVoice(char, gender);
          }

          console.log(`[voice-mapping queue] Final Voice Assignments for New Characters in Chunk:`);
          for (const char of unmappedCharacters) {
            const gender = llmMappings[char] || "masculine";
            const voiceId = voiceMap[char];
            const voiceObj = characterPool.find((v) => v.id === voiceId);
            console.log(`  ➤ ${char} (${gender}) -> Voice: ${voiceObj?.name || 'Unknown'} (${voiceId})`);
          }
        } catch (err) {
          console.error(
            `[voice-mapping queue] LLM mapping failed, falling back to hash:`,
            err,
          );
          // Fallback to deterministic hash mapping (defaulting to general pool)
          for (const char of unmappedCharacters) {
            let slot = fnv1a(`${audiobookId}:${char}`) % characterPool.length;
            let chosenVoiceId = characterPool[slot].id;

            if (usedVoices.has(chosenVoiceId)) {
              for (let j = 1; j < characterPool.length; j++) {
                let nextSlot = (slot + j) % characterPool.length;
                let nextVoiceId = characterPool[nextSlot].id;
                if (!usedVoices.has(nextVoiceId)) {
                  chosenVoiceId = nextVoiceId;
                  break;
                }
              }
            }
            voiceMap[char] = chosenVoiceId;
            usedVoices.add(chosenVoiceId);
          }

          console.log(`[voice-mapping queue]  Final Voice Assignments (Fallback Mode):`);
          for (const char of unmappedCharacters) {
            const voiceId = voiceMap[char];
            const voiceObj = characterPool.find((v) => v.id === voiceId);
            console.log(`   ${char} (hash-fallback) -> Voice: ${voiceObj?.name || 'Unknown'} (${voiceId})`);
          }
        }
      }

      const pickVoice = (speakerTag: string): string => {
        return voiceMap[speakerTag] || narratorVoiceId;
      };

      //! don't load whole file into memory, stream line by line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue; // skip empty lines

        const { speaker, emotion, content } = parseTaggedLine(line);
        if (!content) continue; // tag-only line with no transcript

        const assignedVoiceId = pickVoice(speaker);

        const result = await db
          .insert(segments)
          .values({
            audiobookId,
            chunkIdx,
            segmentIdx: i,
            content, //? maybe put into S3
            rawSpeakerTag: speaker,
            emotionTag: emotion,
            assignedVoiceId,
          })
          .onConflictDoUpdate({
            target: [
              segments.audiobookId,
              segments.chunkIdx,
              segments.segmentIdx,
            ],
            set: {
              content,
              rawSpeakerTag: speaker,
              emotionTag: emotion,
              assignedVoiceId,
            },
          })
          .returning({ id: segments.id });

        const segmentId = result[0].id;

        await db.transaction(async (tx) => {
          await tx
            .update(audiobooks)
            .set({ totalSegments: sql`${audiobooks.totalSegments} + 1` })
            .where(eq(audiobooks.id, audiobookId));
        });

        console.log(
          `[voice-mapping queue] Mapped segment "${content.substring(0, 30)}..." id: ${segmentId} idx: ${i} speaker: ${speaker} emotion: ${emotion} voice: ${assignedVoiceId} for tagged chunk ${chunkIdx} audiobook ${audiobookId}.`,
        );

        const data: TTSJobData = {
          audiobookId,
          segmentId,
          chunkIdx,
          segmentIdx: i,
        };

        await env.TTS_QUEUE.send(data);
      }

      console.log(
        `[voice-mapping queue]  Mapped ${lines.length} segments for tagged chunk ${chunkIdx} audiobook ${audiobookId} successfully.`,
      );
      message.ack();
    } catch (error) {
      console.error(
        `[voice-mapping queue]  Message ${message.id} failed:`,
        error,
      );
      // message.retry();
    }
  }
}
