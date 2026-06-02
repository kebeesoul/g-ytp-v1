import { join } from "node:path";
import type { AudioConfig, TransitionConfig } from "@/lib/schema";
import { runFfmpeg } from "./runFfmpeg";

export interface ConcatAndNormalizeOptions {
  jobId?: string;
  audioPaths: string[];
  transition: TransitionConfig;
  workDir: string;
  audioConfig: AudioConfig;
  mastering?: boolean;
}

const AUDIO_BITRATE = "192k";

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
            "-b:a", AUDIO_BITRATE,
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
        "-b:a", AUDIO_BITRATE,
        outputPath,
      ],
    });
    return outputPath;
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
        "-b:a", AUDIO_BITRATE,
        outputPath,
      ],
    });
    return outputPath;
  }

  const { targetLufs, truePeakDb } = audioConfig;
  const lra = 11;
  const loudnormBase = `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}`;

  if (audioConfig.normalize === "ebu_r128" || audioConfig.normalize === "ebu_r128_fast") {
    const fastFilter = buildFilterComplex(filterLines, outLabel, `${loudnormBase}:linear=true`);
    await runFfmpeg({
      jobId,
      args: [
        "-y",
        ...inputs,
        "-filter_complex", fastFilter,
        "-map", "[aout]",
        "-c:a", "aac",
        "-ar", "48000",
        "-b:a", AUDIO_BITRATE,
        outputPath,
      ],
    });
    return outputPath;
  }

  throw new Error(`unsupported normalize mode: ${audioConfig.normalize}`);
}
