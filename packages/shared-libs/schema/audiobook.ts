import { z } from "zod";
import { LLMRequestSchema } from "./llm.js";
import { TTSRequestSchema } from "./tts.js";

export const AudiobookRequestSchema = z.object({
  ...LLMRequestSchema.shape,
  ...TTSRequestSchema.omit({ text: true }).shape,
});

export type AudiobookRequest = z.infer<typeof AudiobookRequestSchema>;
