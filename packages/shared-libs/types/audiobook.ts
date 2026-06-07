export type AudiobookStatus =
  | "ready_to_upload"
  | "processing"
  | "completed"
  | "failed"
  | "initiated";

export type UploadStatus =
  | "pending_upload"
  | "ready_to_upload"
  | "finished_upload"
  | "failed";

export type AssetType = "raw_upload" | "hls_segment" | "hls_playlist" | "cover";

export interface AudiobookMeta {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  ratings: number | null;
  coverUrl: string;
  status: AudiobookStatus;
}

export interface AudiobookDetail extends AudiobookMeta {
  isReady: boolean;
  errorMessage: string | null;
}

export interface AudiobookStatusDetail {
  id: string;
  status: AudiobookStatus;
  durationSeconds: number | null;
  progress: number; // 0-100
  isReady: boolean;
  errorMessage: string | null;
}

export interface PatchAudiobookRequest {
  title?: string;
  author?: string;
  description?: string;
  ratings?: number;
}

export interface PatchAudiobookResponse {
  ok: boolean;
  book: {
    id: string;
    title: string;
    author: string | null;
    description: string | null;
    ratings: number | null;
    updatedAt: Date;
  };
}

export interface SearchParams {
  q?: string;
  limit?: number;
  offset?: number;
  completeOnly?: boolean;
}

export interface SearchResponse {
  results: AudiobookMeta[];
  total: number;
  query: string;
  limit: number;
  offset: number;
}
