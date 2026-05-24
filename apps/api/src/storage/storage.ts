import {
  S3CompatibleStorageProvider,
  R2NativeStorageProvider,
} from "./provider.js";
import { type StorageProvider } from "./interface.js";

export const BUCKETS = {
  RAW_UPLOADS: process.env.RAW_UPLOADS_BUCKET ?? "my-audiobook-raw-uploads-dev",
  MEDIA: process.env.MEDIA_BUCKET ?? "my-audiobook-media-dev",
} as const;

export const R2Keys = {
  rawUpload: (userId: string, bookId: string) =>
    `raw-uploads/${userId}/${bookId}.pdf`,
  systemVoice: (voiceId: string) => `system-voices/${voiceId}.mp3`,
  cover: (bookId: string) => `covers/${bookId}.jpg`,
  customVoice: (userId: string, voiceId: string) =>
    `custom-voices/${userId}/${voiceId}.mp3`,
  hlsMaster: (bookId: string) => `audiobooks/${bookId}/master.m3u8`,
  hlsChapterIndex: (bookId: string, chapterIdx: number) =>
    `audiobooks/${bookId}/chapters/ch_${String(chapterIdx).padStart(2, "0")}/index.m3u8`,
  hlsInit: (bookId: string, chapterIdx: number) =>
    `audiobooks/${bookId}/chapters/ch_${String(chapterIdx).padStart(2, "0")}/init.mp4`,
  hlsSegment: (bookId: string, chapterIdx: number, segIdx: number) =>
    `audiobooks/${bookId}/chapters/ch_${String(chapterIdx).padStart(2, "0")}/seg_${String(segIdx).padStart(3, "0")}.m4s`,
  hlsChapterPrefix: (bookId: string, chapterIdx: number) =>
    `audiobooks/${bookId}/chapters/ch_${String(chapterIdx).padStart(2, "0")}/`,
} as const;

let globalBindings: Record<string, any> = {};

export function setWorkerBindings(env: Record<string, any>) {
  globalBindings = env;
}

function bootstrapStorage(env: Cloudflare.Env): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case "local":
    case "r2-native":
      return new R2NativeStorageProvider(globalBindings);
    case "r2":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      });
    case "supabase":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: true,
      });
    case "backblaze":
      return new S3CompatibleStorageProvider({
        region: "auto",
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      });
    default:
      throw new Error(
        `Unsupported storage provider configuration: ${env.STORAGE_PROVIDER}`,
      );
  }
}

// Exported Shared Storage Instance
export const storage = {
  getInstance: (env: Cloudflare.Env) => bootstrapStorage(env),
};

// Public CDN Utility helper remains standalone as it relies on DNS mapping, not S3 SDKs
// export function getPublicCdnUrl(key: string): string {
//   return `${CDN_BASE_URL}/${key}`;
// }
