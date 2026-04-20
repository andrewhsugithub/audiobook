import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { envSchema } from "../schema/env.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//! Development-only code for loading environment variables from .env.local and validating them against our schema. In production, we should rely on the environment variables being set properly and skip the file loading step.
if (process.env.NODE_ENV !== "production") {
  loadEnvFile(path.join(__dirname, "../../../.env.local")); // Load environment variables from .env.local
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

export const DATABASE_URL = parsedEnv.data.DATABASE_URL;
export const TTS_URL = parsedEnv.data.TTS_URL;

export const AWS_REGION = parsedEnv.data.AWS_REGION;
export const AWS_ENDPOINT = parsedEnv.data.AWS_ENDPOINT;
export const AWS_ACCESS_KEY_ID = parsedEnv.data.AWS_ACCESS_KEY_ID;
export const AWS_SECRET_ACCESS_KEY = parsedEnv.data.AWS_SECRET_ACCESS_KEY;

export const S3_PUBLIC_BUCKET = parsedEnv.data.S3_PUBLIC_BUCKET;
export const S3_PRIVATE_BUCKET = parsedEnv.data.S3_PRIVATE_BUCKET;
