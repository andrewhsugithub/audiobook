import { z } from "zod";

const ModelEnum = z.enum(["chatterbox-turbo", "fishaudio-s2-pro"]);

export const TTSRequestSchema = z.object({
  text: z.string(),

  voiceURI: z.url({ protocol: /^s3$/ }).optional(), // S3 URI reference audio for voice cloning
  targetURI: z.url({ protocol: /^s3$/ }), // S3 URI destination folder for where to upload the generated audio, e.g. "s3://bucket/test/"

  model: ModelEnum.default("chatterbox-turbo"),

  // chatterbox turbo params
  repetitionPenalty: z.number().default(1.2),
  min_p: z.number().default(0.0),
  top_p: z.number().default(0.95),
  exaggeration: z.number().default(0.0),
  cfgWeight: z.number().default(0.0),
  temperature: z.number().default(0.8),
  top_k: z.number().int().default(1000),
  normLoudness: z.boolean().default(true),
});

export type TTSRequest = z.infer<typeof TTSRequestSchema>;

export const TTSResponseSchema = z.object({
  fileUrl: z.url(), // presigned URL if private, or public URL if public bucket
  fileBucket: z.string(),
  fileKey: z.string(),
  expiresAt: z.iso.datetime(), // ISO string of expiration time for the presigned URL, or a far future date for public files
});

export type TTSResponse = z.infer<typeof TTSResponseSchema>;

export const JobStatusResponseSchema = z.discriminatedUnion("status", [
  z.object({
    jobId: z.string(),
    status: z.enum(["created", "retry", "active", "cancelled"]),
  }),
  TTSResponseSchema.extend({
    jobId: z.string(),
    status: z.literal("completed"),
  }),
  z.object({
    jobId: z.string(),
    status: z.enum(["failed", "not_found"]),
    error: z.any(), // pg-boss output can be a string, object, or stack trace
  }),
]);

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
