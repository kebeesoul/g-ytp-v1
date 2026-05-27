import { spawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import type { AudioConfig } from "@/lib/schema";
import { activeProcesses } from "@/lib/render/processRegistry";
import { runFfmpeg } from "./runFfmpeg";

export interface NormalizeAudioOptions {
  jobId?: string;
  inputPath: string;
  workDir: string;
  audioConfig: AudioConfig;
}

const LoudnormStatsSchema = z.object({
  input_i: z.string(),
  input_tp: z.string(),
  input_lra: z.string(),
  input_thresh: z.string(),
  target_offset: z.string(),
});
type LoudnormStats = z.infer<typeof LoudnormStatsSchema>;

export async function normalizeAudio(options: NormalizeAudioOptions): Promise<string> {
  const { jobId, inputPath, workDir, audioConfig } = options;
  const outputPath = join(workDir, "concat.m4a");

  if (audioConfig.normalize === "off") {
    await runFfmpeg({
      jobId,
      args: [
        "-y",
        "-i", inputPath,
        "-c:a", "aac",
        "-b:a", "192k",
        outputPath,
      ],
    });
    return outputPath;
  }

  const { targetLufs, truePeakDb } = audioConfig;
  const lra = 11;
  const loudnormBase = `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}`;
  const pass1Stderr = await captureLoudnormStats(jobId, inputPath, loudnormBase);
  const stats = parseLoudnormJson(pass1Stderr);

  const filterPass2 = [
    loudnormBase,
    `measured_I=${stats.input_i}`,
    `measured_TP=${stats.input_tp}`,
    `measured_LRA=${stats.input_lra}`,
    `measured_thresh=${stats.input_thresh}`,
    `offset=${stats.target_offset}`,
    "linear=true",
  ].join(":");

  await runFfmpeg({
    jobId,
    args: [
      "-y",
      "-i", inputPath,
      "-af", filterPass2,
      "-c:a", "aac",
      "-b:a", "192k",
      outputPath,
    ],
  });

  return outputPath;
}

function captureLoudnormStats(
  jobId: string | undefined,
  inputPath: string,
  loudnormBase: string
): Promise<string> {
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(ffmpeg, [
      "-y",
      "-i", inputPath,
      "-af", `${loudnormBase}:print_format=json`,
      "-f", "null",
      "-",
    ], { stdio: ["ignore", "ignore", "pipe"] });

    if (jobId) activeProcesses.set(jobId, proc);
    let stderr = "";

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (jobId) activeProcesses.delete(jobId);
      if (code === 0) resolve(stderr);
      else reject(new Error(`FFmpeg loudnorm pass failed with code ${code}:\n${stderr}`));
    });

    proc.on("error", (err) => {
      if (jobId) activeProcesses.delete(jobId);
      reject(err);
    });
  });
}

function parseLoudnormJson(stderr: string): LoudnormStats {
  const match = stderr.match(/\{[\s\S]*?\}/);
  if (!match) {
    throw new Error("normalizeAudio: loudnorm JSON not found in ffmpeg output");
  }
  const result = LoudnormStatsSchema.safeParse(JSON.parse(match[0]));
  if (!result.success) {
    throw new Error(`normalizeAudio: loudnorm JSON missing required fields: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}
