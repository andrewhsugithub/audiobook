import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  TTS_URL: z.url(),

  AWS_REGION: z.string().default("us-east-1"),
  AWS_ENDPOINT: z.string().optional(), // e.g., http://localhost:4566 for LocalStack
  AWS_ACCESS_KEY_ID: z.string().default("test"),
  AWS_SECRET_ACCESS_KEY: z.string().default("test"),
});
