import { z } from "zod";

const MimeTypes = ["application/pdf", "text/markdown", "text/plain"] as const;

export const LLMRequestSchema = z
  .object({
    text: z.string().min(1).optional(),
    file: z
      .instanceof(File)
      .refine((file) => MimeTypes.includes(file.type as any), {
        message: "Unsupported file type",
      })
      .optional(),
  })
  .refine((data) => data.text || data.file, {
    message: "Either text or file is required",
    path: ["text"],
  });

export type LLMRequest = z.infer<typeof LLMRequestSchema>;
