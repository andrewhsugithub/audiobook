import { eq, getDb } from "@audiobook/db/src/index.js";
import { storage } from "@audiobook/storage/src/storage.node.js";
import { downloadSegments } from "./download.js";
import { runFFmpeg } from "./ffmpeg.js";
import { uploadHLSFiles } from "./upload.js";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_URL } from "@audiobook/shared-libs/config/env.js";
import { audiobooks, segments } from "@audiobook/db/src/schema/schema.js";

// must match what CF HLS worker sends
export interface HLSJobData {
  audiobookId: string;
  outputBucket: string;
  outputPrefix: string; // "audiobooks/{audiobookId}/hls/"
}

const rawPayload = process.env.JOB_PAYLOAD;

if (!rawPayload) {
  console.error("❌ JOB_PAYLOAD env var is missing");
  process.exit(1);
}

let job: HLSJobData;
try {
  job = JSON.parse(rawPayload) as HLSJobData;
} catch {
  console.error("❌ JOB_PAYLOAD is not valid JSON");
  process.exit(1);
}

if (!job.audiobookId || !job.outputBucket || !job.outputPrefix) {
  console.error("❌ JOB_PAYLOAD missing required fields:", job);
  process.exit(1);
}

const store = storage.getInstance();
const db = getDb(DATABASE_URL);

async function main(): Promise<void> {
  const { audiobookId, outputBucket, outputPrefix: tmpPrefix } = job;
  const version = Date.now().toString(); // unix timestamp to bust cache
  const outputPrefix = tmpPrefix + version + "/"; // final output prefix with version for cache busting

  console.log("═".repeat(60));
  console.log(`🎬 HLS Generation starting`);
  console.log(`   Book:     ${audiobookId}`);
  console.log(`   Output:   ${outputBucket}/${outputPrefix}`);
  console.log(`   Version:  ${version}`);
  console.log("═".repeat(60));

  const workDir = `tmp/hls_${audiobookId}`;
  const inputDir = join(workDir, "inputs");
  const outputDir = join(workDir, "output");

  mkdirSync(inputDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  try {
    const allSegments = await db
      .select({
        audioSegmentS3Key: segments.audioSegmentS3Key,
        bucketName: segments.bucketName,
        chunkIdx: segments.chunkIdx,
        segmentIdx: segments.segmentIdx,
      })
      .from(segments)
      .where(eq(segments.audiobookId, audiobookId))
      .orderBy(segments.chunkIdx, segments.segmentIdx);

    // Validate all have audio
    const missing = allSegments.filter((s) => !s.audioSegmentS3Key);
    if (missing.length > 0) {
      throw new Error(
        `${missing.length}/${allSegments.length} segments still missing audio`,
      );
    }

    const orderedWavKeys = allSegments.map((s) => ({
      key: s.audioSegmentS3Key!,
      bucket: s.bucketName!,
      chunkIdx: s.chunkIdx,
      segmentIdx: s.segmentIdx,
    }));

    const padWidth = String(orderedWavKeys.length).length; // for zero-padding filenames like seg_00001.wav

    await downloadSegments({
      store,
      orderedWavKeys,
      inputDir,
      padWidth,
    });

    await runFFmpeg({ inputDir, outputDir, padWidth });

    await uploadHLSFiles({
      store,
      outputDir,
      outputBucket,
      outputPrefix,
    });

    await db
      .update(audiobooks)
      .set({
        version,
        status: "completed",
        errorMessage: null,
      })
      .where(eq(audiobooks.id, audiobookId));

    console.log("═".repeat(60));
    console.log(`✅ Book ${audiobookId} HLS generated successfully`);
    console.log("═".repeat(60));
  } catch (err) {
    console.error("❌ HLS failed:", err);
    await db
      .update(audiobooks)
      .set({
        status: "failed",
        errorMessage: `HLS Generation Failure: ${String(err)}`,
        updatedAt: new Date(),
      })
      .where(eq(audiobooks.id, audiobookId));
    process.exit(1);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    console.log("🧹 Cleaned up temp directory");
    process.exit(0); // to close db connection and end the process
  }
}

main();
