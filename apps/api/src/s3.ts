import {
  AWS_ENDPOINT,
  AWS_ACCESS_KEY_ID,
  AWS_REGION,
  AWS_SECRET_ACCESS_KEY,
} from "@audiobook/shared-libs/config/env.js";
import type { TTSResponse } from "@audiobook/shared-libs/schema/tts.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: AWS_REGION,
  endpoint: process.env.NODE_ENV !== "production" ? AWS_ENDPOINT : undefined, // e.g., http://localhost:4566
  forcePathStyle: process.env.NODE_ENV !== "production" ? true : undefined, // for LocalStack
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

export async function getFreshPresignedUrl(
  key: string,
  bucket: string,
  expiresIn = 15 * 60, // 15 minutes
): Promise<TTSResponse> {
  console.log("Generating fresh presigned URL for key:", key);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    fileUrl: url,
    fileBucket: bucket,
    fileKey: key,
    expiresAt: expiresAt,
  };
}
