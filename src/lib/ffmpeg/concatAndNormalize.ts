import { spawn } from "node:child_process";
import { join } from "node:path";
import type { AudioConfig, TransitionConfig } from "@/lib/schema";
import { activeProcesses } from "@/lib/render/processRegistry";
import { runFfmpeg } from "./runFfmpeg";

export interface ConcatAndNormalizeOptions {
  jobId?: string;
  audioPaths: string[];
  transition: TransitionConfig;
  workDir: string;
  audioConfig: AudioConfig;
  playlistRepeatCount?: number;
  mastering?: boolean;
}

interface LoudnormStats {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

// Returns the filter_complex lines for audio concat and the output stream label.
// Single-track case needs no filter — returns empty filterLines and "0:a" as direct input.
function buildConcatFilter(
  n: number,
  transition: TransitionConfig
): { filterLines: string; outLabel: string } {
  if (n === 1) return { filterLines: "", outLabel: "0:a" };

  if (transition.type === "silence") {
    const ins = Array.from({ length: n }, (_, i) => `[${i}:a]`).join("");
    return { filterLines: `${ins}concat=n=${n}:v=0:a=1[acat]`, outLabel: "acat" };
  }

  // Chained acrossfade
  const d = transition.crossfadeSec;
  const parts: string[] = [];
  let prev = "[0:a]";
  for (let i = 1; i < n; i++) {
    const label = i === n - 1 ? "acat" : `cf${i}`;
    parts.push(`${prev}[${i}:a]acrossfade=d=${d}:c1=tri:c2=tri[${label}]`);
    prev = `[${label}]`;
  }
  return { filterLines: parts.join(";"), outLabel: "acat" };
}

// Appends an audio filter after the concat chain and labels the result [aout].
function buildFilterComplex(
  filterLines: string,
  inLabel: string,
  audioFilter: string
): string {
  const step = `[${inLabel}]${audioFilter}[aout]`;
  return filterLines ? `${filterLines};${step}` : step;
}

// Concat N audio tracks (with silence-gap or crossfade) and apply EBU R128 loudnorm
// in a single pipeline — no intermediate WAV file written to disk.
export async function concatAndNormalize(
  options: ConcatAndNormalizeOptions
): Promise<string> {
  const { jobId, audioPaths, transition, workDir, audioConfig, mastering } = options;
  const playlistRepeatCount = options.playlistRepeatCount ?? 1;
  if (audioPaths.length === 0) throw new Error("concatAndNormalize: no audio files");

  const outputPath = join(workDir, "concat.m4a");

  // Mastering: normalize each track individually, then concat without another normalize pass.
  if (mastering && audioConfig.normalize !== "off") {
    const { targetLufs, truePeakDb } = audioConfig;
    const lra = 11;
    const loudnormFilter = `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}`;
    const masteredPaths = await Promise.all(
      audioPaths.map(async (p, i) => {
        const out = join(workDir, `mastered_${i}.m4a`);
        await runFfmpeg({
          jobId,
          args: [
            "-y", "-i", p,
            "-af", loudnormFilter,
            "-c:a", "aac",
            "-ar", "48000",
            "-b:a", "384k",
            out,
          ],
        });
        return out;
      })
    );
    const masteredInputs = masteredPaths.flatMap((p) => ["-i", p]);
    const { filterLines: mfl, outLabel: mol } = buildConcatFilter(masteredPaths.length, transition);
    const hasMasteredConcat = !!mfl;
    await runFfmpeg({
      jobId,
      args: [
        "-y",
        ...masteredInputs,
        ...(hasMasteredConcat
          ? ["-filter_complex", mfl, "-map", `[${mol}]`]
          : ["-map", "0:a"]),
        "-c:a", "aac",
        "-ar", "48000",
        "-b:a", "384k",
        outputPath,
      ],
    });
    return repeatAudioIfNeeded(jobId, outputPath, workDir, playlistRepeatCount);
  }

  const inputs = audioPaths.flatMap((p) => ["-i", p]);
  const { filterLines, outLabel } = buildConcatFilter(audioPaths.length, transition);
  const hasConcat = !!filterLines;

  if (audioConfig.normalize === "off") {
    await runFfmpeg({
      jobId,
      args: [
        "-y",
        ...inputs,
        ...(hasConcat
          ? ["-filter_complex", filterLines, "-map", `[${outLabel}]`]
          : ["-map", "0:a"]),
        "-c:a", "aac",
        "-ar", "48000",
        "-b:a", "384k",
        outputPath,
      ],
    });
    return repeatAudioIfNeeded(jobId, outputPath, workDir, playlistRepeatCount);
  }

  const { targetLufs, truePeakDb } = audioConfig;
  const lra = 11;
  const loudnormBase = `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}`;

  if (audioConfig.normalize === "ebu_r128_fast") {
    // Single-pass loudnorm: no measurement pass. ~50% faster on long mixes.
    // EBU R128 target is still met; integrated measurement is less precise than two-pass.
    const fastFilter = buildFilterComplex(filterLines, outLabel, loudnormBase);
    await runFfmpeg({
      jobId,
      args: [
        "-y",
        ...inputs,
        "-filter_complex", fastFilter,
        "-map", "[aout]",
        "-c:a", "aac",
        "-ar", "48000",
        "-b:a", "384k",
        outputPath,
      ],
    });
    return repeatAudioIfNeeded(jobId, outputPath, workDir, playlistRepeatCount);
  }

  // Two-pass EBU R128 loudnorm — no WAV intermediate
  // Pass 1: measure loudness (output discarded)
  const pass1Filter = buildFilterComplex(filterLines, outLabel, `${loudnormBase}:print_format=json`);
  const pass1Stderr = await captureLoudnormStats(jobId, inputs, pass1Filter);
  const stats = parseLoudnormJson(pass1Stderr);

  // Pass 2: apply measured normalization
  const filterPass2 = [
    loudnormBase,
    `measured_I=${stats.input_i}`,
    `measured_TP=${stats.input_tp}`,
    `measured_LRA=${stats.input_lra}`,
    `measured_thresh=${stats.input_thresh}`,
    `offset=${stats.target_offset}`,
    "linear=true",
  ].join(":");

  const pass2Filter = buildFilterComplex(filterLines, outLabel, filterPass2);
  await runFfmpeg({
    jobId,
    args: [
      "-y",
      ...inputs,
      "-filter_complex", pass2Filter,
      "-map", "[aout]",
      "-c:a", "aac",
      "-ar", "48000",
      "-b:a", "384k",
      outputPath,
    ],
  });

  return repeatAudioIfNeeded(jobId, outputPath, workDir, playlistRepeatCount);
}

async function repeatAudioIfNeeded(
  jobId: string | undefined,
  inputPath: string,
  workDir: string,
  repeatCount: number
): Promise<string> {
  if (repeatCount <= 1) return inputPath;

  const repeatedPath = join(workDir, "concat_repeated.m4a");
  const inputs = Array.from({ length: repeatCount }, () => ["-i", inputPath]).flat();
  const inputLabels = Array.from({ length: repeatCount }, (_, i) => `[${i}:a]`).join("");

  await runFfmpeg({
    jobId,
    args: [
      "-y",
      ...inputs,
      "-filter_complex", `${inputLabels}concat=n=${repeatCount}:v=0:a=1[aout]`,
      "-map", "[aout]",
      "-c:a", "aac",
      "-ar", "48000",
      "-b:a", "384k",
      repeatedPath,
    ],
  });

  return repeatedPath;
}

// Runs FFmpeg with filter_complex → /dev/null and returns stderr (where loudnorm JSON lives).
function captureLoudnormStats(
  jobId: string | undefined,
  inputs: string[],
  filterComplex: string
): Promise<string> {
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(
      ffmpeg,
      ["-y", ...inputs, "-filter_complex", filterComplex, "-map", "[aout]", "-f", "null", "-"],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    if (jobId) activeProcesses.set(jobId, proc);
    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (jobId) activeProcesses.delete(jobId);
      if (code === 0) resolve(stderr);
      else reject(new Error(`loudnorm analysis failed (code ${code}):\n${stderr.slice(-2000)}`));
    });
    proc.on("error", (err) => {
      if (jobId) activeProcesses.delete(jobId);
      reject(err);
    });
  });
}

function parseLoudnormJson(stderr: string): LoudnormStats {
  const match = stderr.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("concatAndNormalize: loudnorm JSON not found in ffmpeg output");
  const parsed: unknown = JSON.parse(match[0]);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("concatAndNormalize: invalid loudnorm JSON");
  }
  return parsed as LoudnormStats;
}
