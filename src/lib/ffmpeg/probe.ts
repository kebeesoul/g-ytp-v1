import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

interface ProbeResult {
  durationSec: number;
  format: string;
}

export async function probeMediaFile(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    filePath,
  ]);

  const parsed: unknown = JSON.parse(stdout);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("format" in parsed) ||
    typeof (parsed as Record<string, unknown>).format !== "object"
  ) {
    throw new Error(`ffprobe returned unexpected output for: ${filePath}`);
  }

  const fmt = (parsed as { format: Record<string, unknown> }).format;
  const duration = Number(fmt["duration"]);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not extract valid duration from: ${filePath}`);
  }

  return {
    durationSec: duration,
    format: String(fmt["format_name"] ?? "unknown"),
  };
}

export async function checkFFmpegAvailable(): Promise<void> {
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
  try {
    await execFileAsync(ffmpeg, ["-version"]);
  } catch {
    throw new Error(
      `FFmpeg not found at "${ffmpeg}". Set FFMPEG_PATH env var or install FFmpeg.`
    );
  }
}
