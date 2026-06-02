import { execa } from "execa";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

type PreprocessResult = {
  processedPath: string;
  width: number;
  height: number;
  durationSec?: number;
};

export async function preprocessBackground(
  inputPath: string,
  kind: "image" | "video",
  dim: number,
  outputDir: string
): Promise<PreprocessResult> {
  const ext = kind === "image" ? "jpg" : "mp4";
  const processedPath = path.join(outputDir, `bg_processed.${ext}`);

  if (kind === "image") {
    await execa(FFMPEG, [
      "-i", inputPath,
      "-vf", [
        "scale=1920:1080:force_original_aspect_ratio=increase",
        "crop=1920:1080",
        `eq=brightness=${-dim}`,
      ].join(","),
      "-q:v", "2",
      "-y",
      processedPath,
    ]);
    return { processedPath, width: 1920, height: 1080 };
  }

  await execa(FFMPEG, [
    "-i", inputPath,
    "-vf", [
      "scale=1920:1080:force_original_aspect_ratio=increase",
      "crop=1920:1080",
    ].join(","),
    "-c:v", "h264_videotoolbox",
    "-b:v", "5M",
    "-maxrate", "7M",
    "-bufsize", "14M",
    "-profile:v", "high",
    "-level:v", "4.1",
    "-pix_fmt", "yuv420p",
    "-an",
    "-movflags", "+faststart",
    "-y",
    processedPath,
  ]);

  const { stdout } = await execa(FFPROBE, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    processedPath,
  ]);
  const info = JSON.parse(stdout) as { format?: { duration?: string } };
  const durationSec = parseFloat(info.format?.duration ?? "");

  return {
    processedPath,
    width: 1920,
    height: 1080,
    durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
  };
}
