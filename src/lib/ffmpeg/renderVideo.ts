import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectSnapshot } from "@/lib/schema";
import { computeTrackTimings } from "@/lib/timecode";
import { resolveOverlayPreset } from "@/lib/design/presetRegistry";
import { compileOverlayFilters, resolveOverlayTimings } from "./overlayCompiler";
import {
  generatePngCards,
  buildPngCardOverlayLines,
  type PngCardSpec,
} from "./overlayPngRenderer";
import { parseFFmpegProgress, computeEtaSec } from "./parseProgress";
import { runFfmpeg } from "./runFfmpeg";

export interface RenderVideoOptions {
  jobId: string;
  bgLocalPath: string;
  bgKind: "image" | "video";
  audioLocalPath: string;
  outputPath: string;
  snapshot: ProjectSnapshot;
  workDir: string;
  startTimeMs: number;
  onProgress?: (globalProgress: number, etaSec: number | null) => void;
  /** Pre-computed PNG card specs from preparePngCardSpecs(). Skip regeneration if provided. */
  pngCardSpecs?: PngCardSpec[] | null;
}

/**
 * Build and generate PNG card overlays for the given snapshot.
 * Returns null when the drawtext path or displayMode="0" is active.
 * Safe to run concurrently with audio downloading/processing.
 */
export async function preparePngCardSpecs(
  snapshot: ProjectSnapshot,
  workDir: string
): Promise<PngCardSpec[] | null> {
  const { tracks, renderConfig } = snapshot;
  const { transition, overlay } = renderConfig;
  const preset = resolveOverlayPreset(overlay.presetId, overlay.presetVersion);

  if (preset.renderer !== "png_card" || overlay.displayMode === "0") return null;

  const timings = computeTrackTimings(tracks, transition);
  const trackStartSecs = timings.map((t) => t.startSec);

  const specs: PngCardSpec[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const timing = resolveOverlayTimings(trackStartSecs[i], tracks[i].durationSec, overlay.displayMode);
    if (timing.skip) continue;
    specs.push({
      localPath: join(workDir, `card_${i}.png`),
      track: tracks[i],
      tStart: timing.tStart,
      tEnd: timing.tEnd,
      fadeOut: timing.fadeOut,
    });
  }

  await generatePngCards(specs, preset);
  return specs;
}

export async function renderVideo(options: RenderVideoOptions): Promise<void> {
  const {
    jobId, bgLocalPath, bgKind, audioLocalPath, outputPath,
    snapshot, workDir, startTimeMs, onProgress,
  } = options;

  const { tracks, renderConfig } = snapshot;
  const { transition, overlay, outputFormat, hwaccel } = renderConfig;
  const bg = snapshot.background;

  const timings = computeTrackTimings(tracks, transition);
  const trackStartSecs = timings.map((t) => t.startSec);
  const lastTiming = timings[timings.length - 1];
  const totalAudioSec = lastTiming
    ? lastTiming.startSec + tracks[timings.length - 1].durationSec
    : 0;

  const preset = resolveOverlayPreset(overlay.presetId, overlay.presetVersion);

  const useVideotoolbox =
    hwaccel === "videotoolbox" && process.env.HWACCEL_DISABLED !== "1";

  const bgInput: string[] = bgKind === "video"
    ? ["-stream_loop", "-1", "-i", bgLocalPath]
    : ["-loop", "1", "-i", bgLocalPath];

  const videoCodecArgs: string[] = useVideotoolbox
    ? ["-c:v", "h264_videotoolbox", "-q:v", "60"]
    : ["-c:v", "libx264", "-preset", "fast", "-crf", "18"];

  const formatArgs: string[] = outputFormat === "mp4"
    ? ["-movflags", "+faststart"]
    : [];

  let filterScript: string;
  let extraInputs: string[] = [];

  if (preset.renderer === "png_card" && overlay.displayMode !== "0") {
    // Use pre-computed specs (from preparePngCardSpecs run concurrently with downloads),
    // or fall back to generating them inline.
    let specs: PngCardSpec[];
    if (options.pngCardSpecs !== undefined && options.pngCardSpecs !== null) {
      specs = options.pngCardSpecs;
    } else {
      const built: PngCardSpec[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const timing = resolveOverlayTimings(trackStartSecs[i], tracks[i].durationSec, overlay.displayMode);
        if (timing.skip) continue;
        built.push({
          localPath: join(workDir, `card_${i}.png`),
          track: tracks[i],
          tStart: timing.tStart,
          tEnd: timing.tEnd,
          fadeOut: timing.fadeOut,
        });
      }
      await generatePngCards(built, preset);
      specs = built;
    }
    extraInputs = specs.flatMap((s) => ["-loop", "1", "-i", s.localPath]);

    // 0=bg, 1=audio, 2..N=png cards
    const bgFilter = buildBgFilter(bg);
    const overlayLines = buildPngCardOverlayLines(specs, 2, preset);
    filterScript = overlayLines.length === 0
      ? `${bgFilter};\n[_bgproc]copy[vout]`
      : `${bgFilter};\n${overlayLines.join(";\n")}`;
  } else {
    // drawtext path (or displayMode "0")
    const overlayFilters = compileOverlayFilters(
      tracks,
      trackStartSecs,
      overlay.displayMode,
      preset
    );
    filterScript = buildFilterScript(bg, overlayFilters);
  }

  const filterScriptPath = join(workDir, "filters.txt");
  await writeFile(filterScriptPath, filterScript, "utf8");

  const args: string[] = [
    "-y",
    ...bgInput,
    "-i", audioLocalPath,
    ...extraInputs,
    "-filter_complex_script", filterScriptPath,
    "-map", "[vout]",
    "-map", "1:a",
    ...videoCodecArgs,
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-shortest",
    "-progress", "pipe:1",
    "-nostats",
    ...formatArgs,
    outputPath,
  ];

  let stdoutBuf = "";
  await runFfmpeg({
    jobId,
    args,
    onStdout: (chunk) => {
      stdoutBuf += chunk.toString();
      const blocks = stdoutBuf.split(/progress=(?:continue|end)/);
      stdoutBuf = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;
        const result = parseFFmpegProgress(block, totalAudioSec);
        if (result && onProgress) {
          const global = 0.15 + result.progress * 0.85;
          const eta = computeEtaSec(global, startTimeMs);
          onProgress(global, eta);
        }
      }
    },
  });

  onProgress?.(1.0, null);
}

function buildBgFilter(bg: ProjectSnapshot["background"]): string {
  const fit = bg?.fit ?? "cover";
  const dim = bg?.dim ?? 0.25;
  const blur = bg?.blur ?? 0;
  const cropX = bg?.cropX ?? 0.5;
  const cropY = bg?.cropY ?? 0.5;
  const cropW = bg?.cropW ?? 1.0;

  // Crop a cropW-fraction of the original image (16:9 box) centered at (cropX, cropY),
  // then scale up to 1920×1080. Coefficients are pre-computed so no commas appear inside
  // FFmpeg expressions (which would conflict with filter option separators).
  const wCoef = cropW.toFixed(6);
  const hCoef = (cropW * 9 / 16).toFixed(6);
  const xCoef = (cropX - cropW / 2).toFixed(6);   // left edge as fraction of in_w
  const yInH  = cropY.toFixed(6);                  // center-y as fraction of in_h
  const yInW  = (cropW * 9 / 32).toFixed(6);       // half box-height as fraction of in_w
  const cropExpr =
    `crop=in_w*${wCoef}:in_w*${hCoef}:in_w*${xCoef}:in_h*${yInH}-in_w*${yInW},` +
    `scale=1920:1080:flags=lanczos`;

  if (fit === "blurred_contain") {
    const blurVal = blur > 0 ? blur : 20;
    return (
      `[0:v]split[_bg1][_bg2];\n` +
      `[_bg1]${cropExpr},boxblur=${blurVal}:1[_blurred];\n` +
      `[_bg2]scale=1920:1080:force_original_aspect_ratio=decrease[_fg];\n` +
      `[_blurred][_fg]overlay=(W-w)/2:(H-h)/2,eq=brightness=${(-dim).toFixed(3)}[_bgproc]`
    );
  }

  return (
    `[0:v]${cropExpr},eq=brightness=${(-dim).toFixed(3)}[_bgproc]`
  );
}

function buildFilterScript(
  bg: ProjectSnapshot["background"],
  overlayFilters: string[]
): string {
  const bgFilter = buildBgFilter(bg);

  if (overlayFilters.length === 0) {
    return `${bgFilter};\n[_bgproc]copy[vout]`;
  }

  const chain = `[_bgproc]${overlayFilters.join(",")}[vout]`;
  return `${bgFilter};\n${chain}`;
}
