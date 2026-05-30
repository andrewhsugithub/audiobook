import type { HLSJobData } from "./index.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StorageProvider } from "@audiobook/storage/src/interface.js";

interface DownloadOptions {
  store: StorageProvider;
  orderedWavKeys: Array<{
    key: string;
    bucket: string;
    chunkIdx: number;
    segmentIdx: number;
  }>;
  inputDir: string;
  concurrency?: number;
  padWidth: number; // for zero-padding segment filenames, e.g. 5 for seg_00001.wav
}

export async function downloadSegments(opts: DownloadOptions): Promise<void> {
  const { store, orderedWavKeys, inputDir, padWidth, concurrency = 20 } = opts;
  const total = orderedWavKeys.length;

  console.log(
    `⬇️  Downloading ${total} WAV segments (concurrency: ${concurrency})...`,
  );

  const startMs = Date.now();
  let completed = 0;

  for (let i = 0; i < total; i += concurrency) {
    const batch = orderedWavKeys.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (seg, batchIdx) => {
        const globalIdx = i + batchIdx;

        const localFilename = `seg_${String(globalIdx).padStart(padWidth)}.wav`; // e.g. seg_00001.wav for readdir() sorting
        const localPath = join(inputDir, localFilename);

        const payload = await store.getObject(seg.bucket, seg.key);

        if (!payload) {
          throw new Error(
            `S3 object not found: ${seg.bucket}/${seg.key} ` +
              `(chunkIdx=${seg.chunkIdx} segmentIdx=${seg.segmentIdx})`,
          );
        }

        const bytes = await payload.transformToByteArray();
        writeFileSync(localPath, bytes);

        completed++;
        // Log every 10% of progress
        if (completed % Math.max(1, Math.floor(total / 10)) === 0) {
          console.log(`  ⬇️  ${completed}/${total} segments downloaded`);
        }
      }),
    );
  }

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`✅ All ${total} segments downloaded in ${elapsedSec}s`);
}
