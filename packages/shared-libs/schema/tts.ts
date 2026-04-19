import { z } from "zod";

const ModelEnum = z.enum(["chatterbox-turbo", "fishaudio-s2-pro"]);

export const TTSRequestSchema = z.object({
  text: z.string(),

  audio_prompt_path: z.string().optional(),

  output_filename: z.string().default("output.mp3"),

  model: ModelEnum.default("chatterbox-turbo"),

  // chatterbox turbo params
  repetition_penalty: z.number().default(1.2),
  min_p: z.number().default(0.0),
  top_p: z.number().default(0.95),
  exaggeration: z.number().default(0.0),
  cfg_weight: z.number().default(0.0),
  temperature: z.number().default(0.8),
  top_k: z.number().int().default(1000),
  norm_loudness: z.boolean().default(true),
});

export type TTSRequest = z.infer<typeof TTSRequestSchema>;

export const TTSResponseSchema = z.object({
  file_path: z.string(),
  sample_rate: z.number(),
});

export type TTSResponse = z.infer<typeof TTSResponseSchema>;

export const JobStatusResponseSchema = z.discriminatedUnion("status", [
  z.object({
    jobId: z.string(),
    status: z.enum(["created", "retry", "active", "cancelled"]),
  }),
  z.object({
    jobId: z.string(),
    status: z.literal("completed"),
    file_path: z.string(),
    sample_rate: z.number(),
  }),
  z.object({
    jobId: z.string(),
    status: z.enum(["failed", "not_found"]),
    error: z.any(), // pg-boss output can be a string, object, or stack trace
  }),
]);

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
