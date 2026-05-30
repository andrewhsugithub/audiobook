import type { StorageProvider } from "@audiobook/storage/src/interface.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

interface UploadOptions {
  store: StorageProvider;
  outputDir: string;
  outputBucket: string;
  outputPrefix: string; // "audiobooks/{id}/hls/"
  concurrency?: number;
}

interface UploadedFile {
  localPath: string;
  s3Key: string;
  sizeBytes: number;
}

export async function uploadHLSFiles(
  opts: UploadOptions,
): Promise<UploadedFile[]> {
  const {
    store,
    outputDir,
    outputBucket,
    outputPrefix,
    concurrency = 10,
  } = opts;

  const files = readdirSync(outputDir)
    .filter((f) => !f.endsWith(".txt")) // skip inputs.txt if it ended up here
    .map((filename) => ({
      filename,
      localPath: join(outputDir, filename),
      s3Key: `${outputPrefix}${filename}`,
    }));

  if (files.length === 0) {
    throw new Error("No output files found to upload");
  }

  console.log(`⬆️  Uploading ${files.length} HLS files to S3...`);

  const startMs = Date.now();
  const uploaded: UploadedFile[] = [];

  // Upload in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);

    const results = await Promise.all(
      batch.map(async ({ filename, localPath, s3Key }) => {
        const fileBytes = readFileSync(localPath);
        const contentType = getContentType(filename);

        await store.putObject(outputBucket, s3Key, fileBytes, contentType);

        const sizeBytes = statSync(localPath).size;
        console.log(`  ⬆️  ${s3Key} (${(sizeBytes / 1024).toFixed(1)} KB)`);

        return { localPath, s3Key, sizeBytes };
      }),
    );

    uploaded.push(...results);
  }

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  const totalKb = (
    uploaded.reduce((sum, f) => sum + f.sizeBytes, 0) / 1024
  ).toFixed(1);

  console.log(
    `✅ Uploaded ${uploaded.length} files (${totalKb} KB total) in ${elapsedSec}s`,
  );

  return uploaded;
}

// ─── Content type mapping ──────────────────────────────────────────────────────

function getContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();

  switch (ext) {
    case ".m3u8":
      // Short cache — playlist may change during live events
      // For VOD this is fine to cache longer, but 60s is safe
      return "application/vnd.apple.mpegurl";

    case ".m4s":
      // Immutable segments — content-addressed by sequence number
      return "video/iso.segment";

    case ".mp4":
      // init.mp4 — also immutable
      return "video/mp4";

    default:
      return "application/octet-stream";
  }
}
