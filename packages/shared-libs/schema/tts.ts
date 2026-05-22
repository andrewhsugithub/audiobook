import { z } from "zod";
import { AudiobookWorkerOutputSchema } from "./llm.js";

const ModelEnum = z.enum(["chatterbox-turbo", "fishaudio-s2-pro"]);

export const TTSRequestSchema = z.object({
  text: z.string(),
  voiceURI: z.url({ protocol: /^s3$/ }).optional(),
  targetURI: z.url({ protocol: /^s3$/ }),
  model: ModelEnum.default("chatterbox-turbo"),
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
  fileUrl: z.url(),
  fileBucket: z.string(),
  fileKey: z.string(),
  expiresAt: z.iso.datetime(),
});

export type TTSResponse = z.infer<typeof TTSResponseSchema>;

export const createJobStatusSchema = <T extends z.ZodObject<any>>(completedSchema: T) =>
  z.discriminatedUnion("status", [
    
    z.object({
      jobId: z.string(),
      status: z.enum(["created", "retry", "active", "cancelled"]),
    }),
    
    
    completedSchema.extend({
      jobId: z.string(),
      status: z.literal("completed"),
    }),

    
    z.object({
      jobId: z.string(),
      status: z.enum(["failed", "not_found"]),
      error: z.any().optional(), 
    }),
  ]);



export const JobStatusResponseSchema = createJobStatusSchema(TTSResponseSchema);
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;


export const AudiobookStatusSchema = createJobStatusSchema(AudiobookWorkerOutputSchema);
export type AudiobookStatus = z.infer<typeof AudiobookStatusSchema>;