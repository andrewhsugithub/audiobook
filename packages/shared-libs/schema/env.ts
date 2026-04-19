import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  TTS_URL: z.url(),
});
