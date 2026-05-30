import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { envSchema } from "../schema/env.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//! Development-only code for loading environment variables from .env and validating them against our schema. In production, we should rely on the environment variables being set properly and skip the file loading step.
if (process.env.NODE_ENV !== "production") {
  try {
    loadEnvFile(path.join(__dirname, "../../../.env")); // Load environment variables from .env
  } catch (err) {
    // If the error is just a missing file, log it safely and continue execution
    if (err && (err as any).code === "ENOENT") {
      console.log(
        "ℹ️ No local .env file found. Falling back to system environment memory.",
      );
    } else {
      throw err; // Rethrow if it's a different, unexpected file error
    }
  }
}

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error(
    "Invalid environment variables:",
    z.treeifyError(parsedEnv.error),
  );
  throw new Error(
    `Invalid environment variables ${z.treeifyError(parsedEnv.error)}`,
  );
}

// currently only need database url for drizzle, others are imported via cloudflare wrangler
export const DATABASE_URL = parsedEnv.data.DATABASE_URL;

export const S3_ENDPOINT = parsedEnv.data.S3_ENDPOINT;
export const S3_ACCESS_KEY_ID = parsedEnv.data.S3_ACCESS_KEY_ID;
export const S3_SECRET_ACCESS_KEY = parsedEnv.data.S3_SECRET_ACCESS_KEY;
export const STORAGE_PROVIDER = parsedEnv.data.STORAGE_PROVIDER;

export const CLOUDFLARE_ACCOUNT_ID = parsedEnv.data.CLOUDFLARE_ACCOUNT_ID;

// export const TTS_URL = parsedEnv.data.TTS_URL;

// export const LLM_URL = parsedEnv.data.LLM_URL;
// export const LLM_API_TOKEN = parsedEnv.data.LLM_API_TOKEN;
