export interface RangeResponse {
  start: number;
  end: number;
  total: number;
  bytes: Uint8Array;
}

export interface PresignedUrlResponse {
  url: string;
  key: string;
  expiresAt: string;
}

export interface MultipartPart {
  PartNumber: number;
  ETag: string;
}

export interface StorageObjectPayload {
  stream: ReadableStream<Uint8Array>;
  transformToString(): Promise<string>;
  transformToByteArray(): Promise<Uint8Array>;
  rangeResponse?: RangeResponse; // set when fetched with a Range header
}

export interface StorageProvider {
  getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresInSeconds?: number,
  ): Promise<PresignedUrlResponse>;
  getObject(bucket: string, key: string): Promise<StorageObjectPayload | null>;

  // Range-aware fetch — for HLS segment seeking
  getObjectWithRange(
    bucket: string,
    key: string,
    range?: string, // "bytes=0-1023"
  ): Promise<StorageObjectPayload | null>;

  putObject(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array | string | ReadableStream,
    contentType: string,
  ): Promise<void>;
  deleteObject(bucket: string, key: string): Promise<void>;
  // Recursively deletes all objects under a prefix — used for cleanup on book deletion
  deleteFolder(bucket: string, prefix: string): Promise<void>;
  objectExists(bucket: string, key: string): Promise<boolean>;

  // Multipart Upload support for large audiobook files
  initiateMultipartUpload(
    bucket: string,
    key: string,
    contentType: string,
  ): Promise<string>;
  getMultipartPresignedUrls(
    bucket: string,
    key: string,
    uploadId: string,
    totalParts: number,
    expiresInSeconds?: number,
  ): Promise<Array<{ partNumber: number; url: string }>>;
  completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: MultipartPart[],
  ): Promise<void>;
  abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void>;
}
