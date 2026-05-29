// for node services

import {
  S3CompatibleStorageProvider,
  R2NativeStorageProvider,
} from "./provider.js";
import { type StorageProvider } from "./interface.js";
import {
  STORAGE_PROVIDER,
  S3_ENDPOINT,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  CLOUDFLARE_ACCOUNT_ID,
} from "@audiobook/shared-libs/config/env.js";

let globalBindings: Record<string, any> = {};

function bootstrapStorage(): StorageProvider {
  if (
    STORAGE_PROVIDER !== "local" &&
    STORAGE_PROVIDER !== "r2-native" &&
    (!STORAGE_PROVIDER || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
  ) {
    throw new Error("Missing required storage configuration");
  }

  switch (STORAGE_PROVIDER) {
    case "local":
    case "r2-native":
      return new R2NativeStorageProvider(globalBindings);
    case "r2":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        accessKeyId: S3_ACCESS_KEY_ID!,
        secretAccessKey: S3_SECRET_ACCESS_KEY!,
      });
    case "supabase":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: S3_ENDPOINT,
        accessKeyId: S3_ACCESS_KEY_ID!,
        secretAccessKey: S3_SECRET_ACCESS_KEY!,
        forcePathStyle: true,
      });
    case "backblaze":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: S3_ENDPOINT,
        accessKeyId: S3_ACCESS_KEY_ID!,
        secretAccessKey: S3_SECRET_ACCESS_KEY!,
      });
    default:
      throw new Error(
        `Unsupported storage provider configuration: ${STORAGE_PROVIDER}`,
      );
  }
}

export const storage = {
  getInstance: () => bootstrapStorage(),
};
