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
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  StorageProvider,
  PresignedUrlResponse,
  MultipartPart,
  StorageObjectPayload,
  RangeResponse,
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
        error.message?.includes("DOMParser is not defined")
      ) {
        console.error(`Object not found: s3://${bucket}/${key}`);
        return null;
      }
      throw error;
    }
  }

  async getObjectWithRange(
    bucket: string,
    key: string,
    range?: string,
  ): Promise<StorageObjectPayload | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          Range: range,
        }),
      );
      if (!response.Body) return null;

      let rangeResponse: RangeResponse | undefined;

      // Extract details from Content-Range if available (e.g., "bytes 0-1023/2048")
      if (response.ContentRange) {
        const match = response.ContentRange.match(
          /bytes (\d+)-(\d+)\/(\d+|\*)/,
        );
        if (match) {
          rangeResponse = {
            start: parseInt(match[1], 10),
            end: parseInt(match[2], 10),
            total: match[3] === "*" ? 0 : parseInt(match[3], 10),
            // We omit the `bytes` array here to avoid buffering entire segments unless necessary,
            // but satisfying the type requires it. If you need it eagerly evaluated:
            bytes: new Uint8Array(),
          };

          // Because AWS streams the response, building the bytes array eagerly on
          // every fetch defeats the purpose of streams. If your interface strictly
          // requires `.bytes` inside `RangeResponse`, we wait until required or provide a stub.
        }
      }

      return {
        get stream() {
          return response.Body!.transformToWebStream();
        },
        async transformToString() {
          return await response.Body!.transformToString();
        },
        async transformToByteArray() {
          const buffer = await response.Body!.transformToByteArray();
          const bytes = new Uint8Array(buffer);
          if (rangeResponse) {
            rangeResponse.bytes = bytes;
          }
          return bytes;
        },
        rangeResponse,
      };
    } catch (error: any) {
      if (
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404 ||
        error.message?.includes("DOMParser is not defined")
      ) {
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

  async deleteFolder(bucket: string, prefix: string): Promise<void> {
    // Trailing slash prevents "book-1" matching "book-10", "book-11", etc.
    const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
    let continuationToken: string | undefined;

    do {
      const listRes = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: safePrefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = (listRes.Contents ?? [])
        .filter((item) => item.Key)
        .map((item) => ({ Key: item.Key! }));

      if (objects.length > 0) {
        // S3 DeleteObjects: max 1,000 keys per request
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }

      continuationToken = listRes.IsTruncated
        ? listRes.NextContinuationToken
        : undefined;
    } while (continuationToken);
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
  ): Promise<Array<{ partNumber: number; url: string }>> {
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

// ── R2 Native provider (local Wrangler dev via miniflare bindings) ─────────
//
// Wrangler's local R2 simulation does not support the S3 API (no presigned
// URLs, no real multipart). Instead we:
//   • Use the R2Bucket binding directly for get/put/delete/head/deleteFolder
//   • Simulate multipart by routing part uploads through a local worker
//     endpoint (/local-upload-part) that calls bucket.uploadPart() via the
//     binding — the route must be registered in your dev router (see below)

export class R2NativeStorageProvider implements StorageProvider {
  constructor(private bindings: Record<string, any>) {}

  private getBucket(name: string): any {
    const bucket = this.bindings[name];
    if (!bucket) {
      throw new Error(`R2 bucket binding not found: "${name}"`);
    }
    return bucket;
  }

  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 900,
  ): Promise<PresignedUrlResponse> {
    // Local dev only — route must proxy the download through your worker
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
    const bucket = this.getBucket(bucketName);
    const obj = await bucket.get(key);
    if (!obj?.body) return null;

    return {
      stream: obj.body as ReadableStream<Uint8Array>,
      transformToString: () => obj.text(),
      transformToByteArray: async () => new Uint8Array(await obj.arrayBuffer()),
    };
  }

  async getObjectWithRange(
    bucketName: string,
    key: string,
    rangeHeader?: string,
  ): Promise<StorageObjectPayload | null> {
    const bucket = this.getBucket(bucketName);

    let r2Options: Record<string, any> = {};
    let parsedStart = 0;
    let parsedEnd: number | undefined;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        parsedStart = parseInt(match[1], 10);
        parsedEnd = match[2] ? parseInt(match[2], 10) : undefined;
        r2Options = {
          range:
            parsedEnd !== undefined
              ? { offset: parsedStart, length: parsedEnd - parsedStart + 1 }
              : { offset: parsedStart },
        };
      }
    }

    const obj = await bucket.get(key, r2Options);
    if (!obj) return null;

    let rangeResponse: RangeResponse | undefined;

    if (rangeHeader && obj.size != null) {
      const total: number = obj.size;
      const start = parsedStart;
      const end = parsedEnd ?? total - 1;
      rangeResponse = { start, end, total, bytes: new Uint8Array() };
    }

    return {
      stream: obj.body as ReadableStream<Uint8Array>,
      transformToString: () => obj.text(),
      transformToByteArray: async () => {
        const arr = new Uint8Array(await obj.arrayBuffer());
        if (rangeResponse) rangeResponse.bytes = arr;
        return arr;
      },
      rangeResponse,
    };
  }

  async putObject(
    bucketName: string,
    key: string,
    body: any,
    contentType: string,
  ): Promise<void> {
    await this.getBucket(bucketName).put(key, body, {
      httpMetadata: { contentType },
    });
  }

  async deleteObject(bucketName: string, key: string): Promise<void> {
    await this.getBucket(bucketName).delete(key);
  }

  async deleteFolder(bucketName: string, prefix: string): Promise<void> {
    const bucket = this.getBucket(bucketName);
    const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
    let cursor: string | undefined;

    do {
      // R2 list() returns at most 1,000 keys per call
      const listed = await bucket.list({
        prefix: safePrefix,
        cursor,
        limit: 1000,
      });

      const keys: string[] = (listed.objects ?? []).map((o: any) => o.key);

      if (keys.length > 0) {
        // R2 native binding deletes one key at a time — run in parallel
        await Promise.all(keys.map((k: string) => bucket.delete(k)));
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  async objectExists(bucketName: string, key: string): Promise<boolean> {
    const obj = await this.getBucket(bucketName).head(key);
    return obj !== null;
  }

  // ── Local multipart simulation ─────────────────────────────────────────
  // Wrangler miniflare supports createMultipartUpload / uploadPart natively.
  // Part uploads are proxied through a local worker route so the browser can
  // PUT to a real URL (presigned URLs don't exist locally).

  async initiateMultipartUpload(
    bucketName: string,
    key: string,
    contentType: string,
  ): Promise<string> {
    const upload = await this.getBucket(bucketName).createMultipartUpload(key, {
      httpMetadata: { contentType },
    });
    return upload.uploadId;
  }

  async getMultipartPresignedUrls(
    bucketName: string,
    key: string,
    uploadId: string,
    totalParts: number,
    _expiresInSeconds?: number, // unused locally
  ): Promise<Array<{ partNumber: number; url: string }>> {
    return Array.from({ length: totalParts }, (_, i) => {
      const partNumber = i + 1;
      return {
        partNumber,
        // This route must exist in your local dev Hono router — see note below
        url: `http://localhost:8787/local-upload-part?bucket=${bucketName}&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
      };
    });
  }

  async completeMultipartUpload(
    bucketName: string,
    key: string,
    uploadId: string,
    parts: MultipartPart[],
  ): Promise<void> {
    const upload = await this.getBucket(bucketName).resumeMultipartUpload(
      key,
      uploadId,
    );
    await upload.complete(
      parts.map((p) => ({ partNumber: p.PartNumber, etag: p.ETag })),
    );
  }

  async abortMultipartUpload(
    bucketName: string,
    key: string,
    uploadId: string,
  ): Promise<void> {
    const upload = await this.getBucket(bucketName).resumeMultipartUpload(
      key,
      uploadId,
    );
    await upload.abort();
  }
}
