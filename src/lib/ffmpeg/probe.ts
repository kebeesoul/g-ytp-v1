import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

interface ProbeResult {
  durationSec: number;
  format: string;
}

const FfprobeOutputSchema = z.object({
  format: z.object({
    duration: z.string().transform((v) => Number(v)),
    format_name: z.string().optional(),
  }),
});

export async function probeMediaFile(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    filePath,
  ]);

  const result = FfprobeOutputSchema.safeParse(JSON.parse(stdout));
  if (!result.success) {
    throw new Error(`ffprobe returned unexpected output for: ${filePath}`);
  }

  const { duration, format_name } = result.data.format;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not extract valid duration from: ${filePath}`);
  }

  return {
    durationSec: duration,
    format: format_name ?? "unknown",
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
