export type UploadStrategy = "direct-write" | "multipart";

export interface InitiateUploadRequest {
  userId: string;
  title?: string;
  author?: string;
  description?: string;
  // Text path
  text?: string;
  // Multipart path
  fileName?: string;
  fileSizeBytes?: number;
}

export interface InitiateUploadResponse {
  bookId: string;
  status: "finished_upload" | "ready_to_upload";
  strategy: UploadStrategy;
  fileKey?: string;
  // Multipart-only fields
  uploadId?: string;
  expiresAt?: string;
}

export interface PresignedUrlsRequest {
  bookId: string;
  fileKey: string;
  uploadId: string;
  totalParts: number;
}

export interface PresignedUrlsResponse {
  presignedUrls: string[];
}

export interface UploadPart {
  // Accept both casings — normalised on the server
  partNumber?: number;
  PartNumber?: number;
  etag?: string;
  ETag?: string;
}

export interface NormalisedPart {
  PartNumber: number;
  ETag: string;
}

export interface CompleteUploadRequest {
  bookId: string;
  fileName: string;
  fileKey: string;
  uploadId: string;
  userId: string;
  parts: UploadPart[];
}

export interface CompleteUploadResponse {
  ok: boolean;
  bookId: string;
  status: "processing";
}

export interface AbortUploadRequest {
  bookId: string;
  uploadId: string;
  fileKey: string;
}

export interface AbortUploadResponse {
  ok: boolean;
  skipped?: boolean;
  note?: string;
}

export interface ReuploadRequest extends InitiateUploadRequest {
  // same shape as InitiateUploadRequest — userId required
}

export interface ReuploadResponse extends InitiateUploadResponse {
  // same shape — with ok: true added
  ok: boolean;
}
