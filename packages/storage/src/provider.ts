import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  StorageProvider,
  PresignedUrlResponse,
  MultipartPart,
  StorageObjectPayload,
} from "./interface.js";

export class S3CompatibleStorageProvider implements StorageProvider {
  private client: S3Client;

  constructor(config: {
    endpoint?: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
  }) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });
  }

  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 900,
  ): Promise<PresignedUrlResponse> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return {
      url,
      key,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async getObject(
    bucket: string,
    key: string,
  ): Promise<StorageObjectPayload | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!response.Body) return null;

      return {
        get stream() {
          return response.Body!.transformToWebStream();
        },
        async transformToString() {
          return await response.Body!.transformToString();
        },
        async transformToByteArray() {
          const buffer = await response.Body!.transformToByteArray();
          return new Uint8Array(buffer);
        },
      };
    } catch (error: any) {
      // Cloudflare AWS SDK workaround: When DOMParser fails during an error throw,
      // it means the underlying call got a 404 (or 403) from S3.
      if (
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404 ||
        error.message.includes("DOMParser is not defined")
      ) {
        console.error(`Object not found: s3://${bucket}/${key}`);
        return null;
      }
      throw error;
    }
  }

  async putObject(
    bucket: string,
    key: string,
    body: any,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async initiateMultipartUpload(
    bucket: string,
    key: string,
    contentType: string,
  ): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!res.UploadId) throw new Error("Failed to initiate multipart upload");
    return res.UploadId;
  }

  async getMultipartPresignedUrls(
    bucket: string,
    key: string,
    uploadId: string,
    totalParts: number,
    expiresInSeconds = 3600,
  ) {
    return Promise.all(
      Array.from({ length: totalParts }, async (_, i) => {
        const partNumber = i + 1;
        const command = new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });
        const url = await getSignedUrl(this.client, command, {
          expiresIn: expiresInSeconds,
        });
        return { partNumber, url };
      }),
    );
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: MultipartPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  async abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }
}

//! need fix
export class R2NativeStorageProvider implements StorageProvider {
  // bindings maps bucket names to actual R2Bucket objects (e.g., env.RAW_UPLOADS)
  constructor(private bindings: Record<string, any>) {}

  private getBucket(name: string): any {
    const bucket = this.bindings[name];
    if (!bucket) {
      throw new Error(
        `R2 Bucket binding or mock not found for bucket: ${name}`,
      );
    }
    return bucket;
  }

  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 900,
  ): Promise<PresignedUrlResponse> {
    // Locally or natively via workers, custom signing or a public/piped route is used.
    // For local dev, we point back to our local server worker endpoint.
    const url = `http://localhost:8787/local-download?bucket=${bucket}&key=${encodeURIComponent(key)}`;
    return {
      url,
      key,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async getObject(
    bucketName: string,
    key: string,
  ): Promise<StorageObjectPayload | null> {
    const bucket = this.getBucket(bucketName).key(key);
    const r2Object = await bucket.get(key);

    if (!r2Object || !r2Object.body) return null;

    return {
      stream: r2Object.body,
      async transformToString() {
        return await r2Object.text();
      },
      async transformToByteArray() {
        const buffer = await r2Object.arrayBuffer();
        return new Uint8Array(buffer);
      },
    };
  }

  async putObject(
    bucket: string,
    key: string,
    body: any,
    contentType: string,
  ): Promise<void> {
    await this.getBucket(bucket).put(key, body, {
      httpMetadata: { contentType },
    });
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.getBucket(bucket).delete(key);
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    const obj = await this.getBucket(bucket).head(key);
    return obj !== null;
  }

  // Local Wrangler development simulates multipart uploads using standard R2 features
  async initiateMultipartUpload(
    bucket: string,
    key: string,
    contentType: string,
  ): Promise<string> {
    const upload = await this.getBucket(bucket).createMultipartUpload(key, {
      httpMetadata: { contentType },
    });
    return upload.uploadId;
  }

  async getMultipartPresignedUrls(
    bucket: string,
    key: string,
    uploadId: string,
    totalParts: number,
  ) {
    // For local dev, we generate mock URLs pointing back to our local worker router
    // that intercepts the PUT request and calls upload.uploadPart()
    return Array.from({ length: totalParts }, (_, i) => {
      const partNumber = i + 1;
      return {
        partNumber,
        url: `http://localhost:8787/local-upload-part?bucket=${bucket}&key=${encodeURIComponent(key)}&uploadId=${uploadId}&partNumber=${partNumber}`,
      };
    });
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: MultipartPart[],
  ): Promise<void> {
    const upload = await this.getBucket(bucket).resumeMultipartUpload(
      key,
      uploadId,
    );
    // Format interface parts to match what Cloudflare's native API expects
    const r2Parts = parts.map((p) => ({
      partNumber: p.PartNumber,
      etag: p.ETag,
    }));
    await upload.complete(r2Parts);
  }

  async abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void> {
    const upload = await this.getBucket(bucket).resumeMultipartUpload(
      key,
      uploadId,
    );
    await upload.abort();
  }
}
