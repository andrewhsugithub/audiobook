const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  m3u8: "application/vnd.apple.mpegurl",
  m4s: "video/iso.segment",
  mp4: "video/mp4",
};

export function getMimeType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? null;
}

export function getContentType(filename: string): string {
  return getMimeType(filename) ?? "application/octet-stream";
}

export function isAllowedUploadMime(fileName: string): boolean {
  const mime = getMimeType(fileName);
  return mime === "application/pdf" || mime === "text/plain";
}

//! new
/** Map HLS / fMP4 segment extensions to the correct MIME type */
export function getSegmentContentType(filename: string): string {
  if (filename.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filename.endsWith(".m4s")) return "video/iso.segment";
  if (filename.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

/** Resolve MIME type for raw-upload files */
export function getRawFileMimeType(fileName: string): string | null {
  if (fileName.endsWith(".pdf")) return "application/pdf";
  if (fileName.endsWith(".txt")) return "text/plain";
  return null;
}
