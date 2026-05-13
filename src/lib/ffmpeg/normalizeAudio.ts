import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { AudioConfig } from "@/lib/schema";

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

export interface NormalizeAudioOptions {
  inputPath: string;   // concat_raw.wav
  workDir: string;     // workspace/tmp/{jobId}
  audioConfig: AudioConfig;
}

interface LoudnormStats {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  output_i: string;
  output_tp: string;
  output_lra: string;
  output_thresh: string;
  normalization_type: string;
  target_offset: string;
}

// → workspace/tmp/{jobId}/concat.m4a 경로 반환
export async function normalizeAudio(options: NormalizeAudioOptions): Promise<string> {
  const { inputPath, workDir, audioConfig } = options;
  const outputPath = join(workDir, "concat.m4a");

  if (audioConfig.normalize === "off") {
    // normalize=off: PCM → AAC 직접 인코딩
    await execFileAsync(FFMPEG, [
      "-y",
      "-i", inputPath,
      "-c:a", "aac",
      "-b:a", `${192}k`,
      outputPath,
    ], { maxBuffer: 64 * 1024 * 1024 });
    return outputPath;
  }

  // EBU R128 2-pass
  const { targetLufs, truePeakDb } = audioConfig;
  const lra = 11;
  const loudnormBase = `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}`;

  // Pass 1: 통계 측정 (stderr에서 JSON 파싱)
  const { stderr: pass1Stderr } = await execFileAsync(FFMPEG, [
    "-y",
    "-i", inputPath,
    "-af", `${loudnormBase}:print_format=json`,
    "-f", "null",
    "-",
  ], { maxBuffer: 64 * 1024 * 1024 });

  const stats = parseLoudnormJson(pass1Stderr);

  // Pass 2: 측정값 주입 + AAC 인코딩
  const filterPass2 = [
    loudnormBase,
    `measured_I=${stats.input_i}`,
    `measured_TP=${stats.input_tp}`,
    `measured_LRA=${stats.input_lra}`,
    `measured_thresh=${stats.input_thresh}`,
    `offset=${stats.target_offset}`,
    "linear=true",
  ].join(":");

  await execFileAsync(FFMPEG, [
    "-y",
    "-i", inputPath,
    "-af", filterPass2,
    "-c:a", "aac",
    "-b:a", "192k",
    outputPath,
  ], { maxBuffer: 64 * 1024 * 1024 });

  return outputPath;
}

function parseLoudnormJson(stderr: string): LoudnormStats {
  // FFmpeg이 stderr에 JSON 블록을 { } 형태로 출력
  const match = stderr.match(/\{[\s\S]*?\}/);
  if (!match) {
    throw new Error("normalizeAudio: loudnorm JSON not found in ffmpeg output");
  }
  const parsed: unknown = JSON.parse(match[0]);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("normalizeAudio: invalid loudnorm JSON");
  }
  return parsed as LoudnormStats;
}
