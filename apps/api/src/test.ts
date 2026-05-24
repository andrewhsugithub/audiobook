import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  STORAGE_PROVIDER,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  SUPABASE_URL,
  SUPABASE_STORAGE_KEY,
  B2_ENDPOINT,
  B2_ACCESS_KEY_ID,
  B2_SECRET_ACCESS_KEY,
  CDN_BASE_URL,
} from "@audiobook/shared-libs/config/env.js";

export const BUCKETS = {
  RAW_UPLOADS: process.env.RAW_UPLOADS_BUCKET ?? "my-audiobook-raw-uploads-dev",
  MEDIA: process.env.MEDIA_BUCKET ?? "my-audiobook-media-dev",
} as const;

export const R2Keys = {
  rawUpload: (userId: string, bookId: string) =>
    `raw-uploads/${userId}/${bookId}.pdf`,

  systemVoice: (voiceId: string) => `system-voices/${voiceId}.mp3`,
  cover: (bookId: string) => `covers/${bookId}.jpg`,

  // Media bucket — signed secure
  customVoice: (userId: string, voiceId: string) =>
    `custom-voices/${userId}/${voiceId}.mp3`,

  // HLS structure
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

function createS3Client(): S3Client {
  switch (STORAGE_PROVIDER) {
    case "r2":
      return new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      });

    case "supabase":
      // Supabase exposes an S3-compatible endpoint
      return new S3Client({
        region: "auto",
        endpoint: `${SUPABASE_URL}/storage/v1/s3`,
        credentials: {
          accessKeyId: "service_role", // Supabase uses service role key as access key
          secretAccessKey: SUPABASE_STORAGE_KEY,
        },
        forcePathStyle: true,
      });

    case "backblaze":
      return new S3Client({
        region: "auto",
        endpoint: B2_ENDPOINT, // e.g. https://s3.us-west-004.backblazeb2.com
        credentials: {
          accessKeyId: B2_ACCESS_KEY_ID,
          secretAccessKey: B2_SECRET_ACCESS_KEY,
        },
      });

    default:
      throw new Error(`Unknown STORAGE_PROVIDER: ${STORAGE_PROVIDER}`);
  }
}

export const storage = createS3Client();

// ─── Presigned URL Helpers ─────────────────────────────────────────────────────

export interface PresignedUrl {
  url: string;
  key: string;
  expiresAt: string;
}

/**
 * Generate a presigned GET URL for private objects.
 * Public objects (system-voices/, covers/) should use CDN URL directly.
 */
export async function getPresignedGetUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 15 * 60,
): Promise<PresignedUrl> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await getSignedUrl(storage, command, {
    expiresIn: expiresInSeconds,
  });
  return {
    url,
    key,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}

/**
 * Public CDN URL for objects that are openly cached (system-voices, covers).
 */
export function getPublicCdnUrl(key: string): string {
  return `${CDN_BASE_URL}/${key}`;
}

// ─── Multipart Upload Helpers ──────────────────────────────────────────────────

export async function initiateMultipartUpload(
  bucket: string,
  key: string,
  contentType: string,
): Promise<string> {
  const { UploadId } = await storage.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      // R2/S3 server-side encryption if needed
      // ServerSideEncryption: "AES256",
    }),
  );
  if (!UploadId) throw new Error("Failed to initiate multipart upload");
  return UploadId;
}

/**
 * Generate presigned URLs for each part so the client uploads directly to R2.
 * Returns array aligned with part numbers (1-based).
 */
export async function getMultipartPresignedUrls(
  bucket: string,
  key: string,
  uploadId: string,
  totalParts: number,
  expiresInSeconds = 60 * 60, // 1 hour per part
): Promise<Array<{ partNumber: number; url: string }>> {
  const urls = await Promise.all(
    Array.from({ length: totalParts }, async (_, i) => {
      const partNumber = i + 1;
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const url = await getSignedUrl(storage, command, {
        expiresIn: expiresInSeconds,
      });
      return { partNumber, url };
    }),
  );
  return urls;
}

export async function completeMultipartUpload(
  bucket: string,
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
): Promise<void> {
  await storage.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  );
}

export async function abortMultipartUpload(
  bucket: string,
  key: string,
  uploadId: string,
): Promise<void> {
  await storage.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    }),
  );
}

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  await storage.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function objectExists(
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
