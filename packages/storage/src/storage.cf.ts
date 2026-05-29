// for cloudflare

import {
  S3CompatibleStorageProvider,
  R2NativeStorageProvider,
} from "./provider.js";
import { type StorageProvider } from "./interface.js";

let globalBindings: Record<string, any> = {};

export function setWorkerBindings(env: Record<string, any>) {
  globalBindings = env;
}

function bootstrapStorage(env: Record<string, any>): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case "local":
    case "r2-native":
      return new R2NativeStorageProvider(globalBindings);
    case "r2":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      });
    case "supabase":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        forcePathStyle: true,
      });
    case "backblaze":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      });
    default:
      throw new Error(
        `Unsupported storage provider configuration: ${env.STORAGE_PROVIDER}`,
      );
  }
}

// Exported Shared Storage Instance
export const storage = {
  getInstance: (env: Record<string, any>) => bootstrapStorage(env),
};

// Public CDN Utility helper remains standalone as it relies on DNS mapping, not S3 SDKs
// export function getPublicCdnUrl(key: string): string {
//   return `${CDN_BASE_URL}/${key}`;
// }
