export interface TTSJobData {
  audiobookId: string;
  segmentId: string;
  chunkIdx: number;
  segmentIdx: number;
}

export interface VoiceMappingJobData {
  audiobookId: string;
  chunkIdx: number;
  taggedS3Key: string;
}

export interface LLMTagJobData {
  audiobookId: string;
  chunkIdx: number;
  chunkS3Key: string;
}

export interface ChunkingJobData {
  audiobookId: string;
  parsedS3TextKey: string;
  totalCharacterCount: number;
}

export interface ParserJobData {
  audiobookId: string;
  userId: string;
  s3FileKey: string;
  fileName: string;
}
