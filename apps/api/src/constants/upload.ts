export const UPLOAD = {
  EXPIRY_SECONDS: 3_600,
  MAX_FILE_BYTES: 50 * 1024 * 1024, // 50 MB
  //   MIN_PART_BYTES: 5 * 1024 * 1024, // 5 MB — S3/R2 minimum per part
  MAX_PARTS: 10_000,
} as const;

//! new
/** Presigned URL validity — 1 hour */
export const UPLOAD_EXPIRY_SECONDS = 3_600;

/** 50 MB hard ceiling for all uploads */
export const MAX_FILE_SIZE_BYTES = 50 * 1_024 * 1_024;

/** S3 / R2 minimum part size — 5 MB */
export const MIN_PART_SIZE_BYTES = 5 * 1_024 * 1_024;
