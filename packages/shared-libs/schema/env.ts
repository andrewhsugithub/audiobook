import { z } from "zod";

function isLocalUrl(urlStr: string) {
  try {
    const url = new URL(urlStr);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: z
      .url()
      .optional(),

    S3_ENDPOINT: z.url().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),

    TTS_URL: z.url(),
    TTS_API_KEY: z.string().optional(),

    LLM_URL: z.url().optional(),
    LLM_API_TOKEN: z.string().optional(),

    STORAGE_PROVIDER: z.enum([
      "local",
      "r2-native",
      "r2",
      "supabase",
      "backblaze",
    ]),
  })
  .superRefine((data, ctx) => {
    // if database url isn't local, then CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE must match DATABASE_URL
    if (data.DATABASE_URL && !isLocalUrl(data.DATABASE_URL)) {
      if (
        data.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE !==
        data.DATABASE_URL
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE"],
          message: "Must match DATABASE_URL when using a non-local database.",
        });
      }
    }

    // if STORAGE_PROVIDER isn't local or r2-native, S3 credentials must be provided
    if (
      data.STORAGE_PROVIDER !== "local" &&
      data.STORAGE_PROVIDER !== "r2-native"
    ) {
      if (!data.S3_ENDPOINT) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_ENDPOINT"],
          message:
            "S3_ENDPOINT is required when storage provider is not local or r2-native.",
        });
      }
      if (!data.S3_ACCESS_KEY_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_ACCESS_KEY_ID"],
          message:
            "S3_ACCESS_KEY_ID is required when storage provider is not local or r2-native.",
        });
      }
      if (!data.S3_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_SECRET_ACCESS_KEY"],
          message:
            "S3_SECRET_ACCESS_KEY is required when storage provider is not local or r2-native.",
        });
      }
    }

    // if TTS_URL isn't local, TTS_API_KEY must be provided
    if (data.TTS_URL && !isLocalUrl(data.TTS_URL)) {
      if (!data.TTS_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["TTS_API_KEY"],
          message: "TTS_API_KEY is required when using a remote TTS_URL.",
        });
      }
    }
  });
