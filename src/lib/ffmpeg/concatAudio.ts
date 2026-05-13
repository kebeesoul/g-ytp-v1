import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TransitionConfig } from "@/lib/schema";

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

export interface ConcatAudioOptions {
  audioPaths: string[];   // 절대경로, order 순
  transition: TransitionConfig;
  workDir: string;        // workspace/tmp/{jobId}
}

// → workspace/tmp/{jobId}/concat_raw.wav 경로 반환
export async function concatAudio(options: ConcatAudioOptions): Promise<string> {
  const { audioPaths, transition, workDir } = options;
  if (audioPaths.length === 0) throw new Error("concatAudio: no audio files");

  const outputPath = join(workDir, "concat_raw.wav");

  if (audioPaths.length === 1 || transition.type === "silence") {
    await concatSilence(audioPaths, outputPath, workDir);
  } else {
    await concatCrossfade(audioPaths, transition.crossfadeSec, outputPath);
  }

  return outputPath;
}

async function concatSilence(
  audioPaths: string[],
  outputPath: string,
  workDir: string
): Promise<void> {
  const listPath = join(workDir, "concat_list.txt");
  // ffmpeg concat list: single-quote 내부 '는 '\\'' 처리
  const listContent = audioPaths
    .map((p) => `file '${p.replace(/\\/g, "\\\\").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, listContent, "utf8");

  await execFileAsync(FFMPEG, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c:a", "pcm_s16le",
    outputPath,
  ], { maxBuffer: 64 * 1024 * 1024 });
}

async function concatCrossfade(
  audioPaths: string[],
  crossfadeSec: number,
  outputPath: string
): Promise<void> {
  // 단일 트랙: 그냥 PCM 변환
  if (audioPaths.length === 1) {
    await execFileAsync(FFMPEG, [
      "-y", "-i", audioPaths[0],
      "-c:a", "pcm_s16le", outputPath,
    ], { maxBuffer: 64 * 1024 * 1024 });
    return;
  }

  const inputs: string[] = [];
  for (const p of audioPaths) inputs.push("-i", p);

  // [0:a][1:a]acrossfade=d=N[a1]; [a1][2:a]acrossfade=d=N[a2]; ... → [aout]
  const filterParts: string[] = [];
  let prev = "[0:a]";
  for (let i = 1; i < audioPaths.length; i++) {
    const out = i === audioPaths.length - 1 ? "[aout]" : `[a${i}]`;
    filterParts.push(`${prev}[${i}:a]acrossfade=d=${crossfadeSec}:c1=tri:c2=tri${out}`);
    prev = out;
  }

  await execFileAsync(FFMPEG, [
    "-y",
    ...inputs,
    "-filter_complex", filterParts.join(";"),
    "-map", "[aout]",
    "-c:a", "pcm_s16le",
    outputPath,
  ], { maxBuffer: 64 * 1024 * 1024 });
}
