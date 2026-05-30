/**
ffmpeg \
  -f concat \
  -safe 0 \
  -i inputs.txt \
  -c:a aac \
  -ar 48000 \
  -ac 2 \
  -b:a 192k \
  -movflags +faststart \
  -f hls \
  -hls_time 4 \
  -hls_playlist_type vod \
  -hls_segment_type fmp4 \
  -hls_flags independent_segments \
  -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename "seg_%05d.m4s" \
  stream.m3u8
 */

import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

interface FFmpegOptions {
  inputDir: string;
  outputDir: string;
  // Audio encoding options
  sampleRate?: number; // default 48000
  channels?: number; // default 2
  bitrate?: string; // default "192k"
  // HLS segmenting options
  segmentDuration?: number; // default 4 seconds
}

export async function runFFmpeg(opts: FFmpegOptions): Promise<void> {
  const {
    inputDir,
    outputDir,
    sampleRate = 48000,
    channels = 2,
    bitrate = "192k",
    segmentDuration = 4,
  } = opts;

  // Build concat input file
  // readdir returns names in filesystem order — our zero-padded names
  // guarantee correct sort without extra sorting logic
  const wavFiles = readdirSync(inputDir)
    .filter((f) => f.endsWith(".wav"))
    .sort();

  if (wavFiles.length === 0) {
    throw new Error("No WAV files found in input directory");
  }

  const concatLines = wavFiles.map((f) => `file '${f}'`).join("\n");

  const concatFilePath = join(inputDir, "inputs.txt");
  writeFileSync(concatFilePath, concatLines);

  console.log(`📝 inputs.txt: ${wavFiles.length} entries`);

  const streamM3u8 = join(outputDir, "stream.m3u8");
  const segPattern = join(outputDir, "seg_%05d.m4s");

  const args: string[] = [
    // Never prompt — we are non-interactive in Docker
    "-y",

    // Input: concat demuxer reads inputs.txt
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatFilePath,

    // Audio encoding
    "-c:a",
    "aac",
    "-ar",
    String(sampleRate),
    "-ac",
    String(channels),
    "-b:a",
    bitrate,
    "-movflags",
    "+faststart",

    // HLS muxer
    "-f",
    "hls",
    "-hls_time",
    String(segmentDuration),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "fmp4",
    "-hls_flags",
    "independent_segments",
    "-hls_fmp4_init_filename",
    "init.mp4",
    "-hls_segment_filename",
    segPattern,

    // Output playlist
    streamM3u8,
  ];

  console.log("🎞️  Running FFmpeg...");
  console.log(`   ffmpeg ${args.join(" ")}`);

  const startMs = Date.now();

  const result = spawnSync("ffmpeg", args, {
    // Pipe stderr to our process so Northflank job logs capture FFmpeg output
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60 * 60 * 1000, // 1 hour hard limit
    maxBuffer: 100 * 1024 * 1024, // 100MB stdout/stderr buffer
  });

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  // FFmpeg writes progress to stderr — always log it
  if (result.stderr) {
    const stderrStr = result.stderr.toString();
    // Only print the last few lines to avoid flooding logs
    const lines = stderrStr.split("\n");
    const tail = lines.slice(-20).join("\n");
    console.log("FFmpeg output (tail):\n", tail);
  }

  if (result.status !== 0) {
    // Print full stderr on failure for debugging
    console.error("FFmpeg full stderr:\n", result.stderr?.toString());
    throw new Error(`FFmpeg exited with code ${result.status}`);
  }

  // Verify output files were created
  const outputFiles = readdirSync(outputDir);
  const m3u8Files = outputFiles.filter((f) => f.endsWith(".m3u8"));
  const m4sFiles = outputFiles.filter((f) => f.endsWith(".m4s"));
  const mp4Files = outputFiles.filter((f) => f.endsWith(".mp4"));

  if (m3u8Files.length === 0) {
    throw new Error("FFmpeg produced no .m3u8 playlist — something went wrong");
  }

  console.log(`✅ FFmpeg complete in ${elapsedSec}s`);
  console.log(`   Playlists:  ${m3u8Files.length} (.m3u8)`);
  console.log(`   Init:       ${mp4Files.length} (.mp4)`);
  console.log(`   Segments:   ${m4sFiles.length} (.m4s)`);
}
