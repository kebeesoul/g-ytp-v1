import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TransitionConfig } from "@/lib/schema";
import { runFfmpeg } from "./runFfmpeg";

export interface ConcatAudioOptions {
  jobId?: string;
  audioPaths: string[];
  transition: TransitionConfig;
  workDir: string;
}

export async function concatAudio(options: ConcatAudioOptions): Promise<string> {
  const { jobId, audioPaths, transition, workDir } = options;
  if (audioPaths.length === 0) throw new Error("concatAudio: no audio files");

  const outputPath = join(workDir, "concat_raw.wav");

  if (audioPaths.length === 1 || transition.type === "silence") {
    await concatSilence(jobId, audioPaths, outputPath, workDir);
  } else {
    await concatCrossfade(jobId, audioPaths, transition.crossfadeSec, outputPath);
  }

  return outputPath;
}

async function concatSilence(
  jobId: string | undefined,
  audioPaths: string[],
  outputPath: string,
  workDir: string
): Promise<void> {
  const listPath = join(workDir, "concat_list.txt");
  const listContent = audioPaths
    .map((p) => `file '${p.replace(/\\/g, "\\\\").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, listContent, "utf8");

  await runFfmpeg({
    jobId,
    args: [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c:a", "pcm_s16le",
      outputPath,
    ],
  });
}

async function concatCrossfade(
  jobId: string | undefined,
  audioPaths: string[],
  crossfadeSec: number,
  outputPath: string
): Promise<void> {
  if (audioPaths.length === 1) {
    await runFfmpeg({
      jobId,
      args: [
        "-y", "-i", audioPaths[0],
        "-c:a", "pcm_s16le", outputPath,
      ],
    });
    return;
  }

  const inputs: string[] = [];
  for (const p of audioPaths) inputs.push("-i", p);

  const filterParts: string[] = [];
  let prev = "[0:a]";
  for (let i = 1; i < audioPaths.length; i++) {
    const out = i === audioPaths.length - 1 ? "[aout]" : `[a${i}]`;
    filterParts.push(`${prev}[${i}:a]acrossfade=d=${crossfadeSec}:c1=tri:c2=tri${out}`);
    prev = out;
  }

  await runFfmpeg({
    jobId,
    args: [
      "-y",
      ...inputs,
      "-filter_complex", filterParts.join(";"),
      "-map", "[aout]",
      "-c:a", "pcm_s16le",
      outputPath,
    ],
  });
}
