import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectSnapshot } from "@/lib/schema";
import { computeTrackTimings } from "@/lib/timecode";
import { resolveOverlayPreset } from "@/lib/design/presetRegistry";
import { compileOverlayFilters, resolveOverlayTimings } from "./overlayCompiler";
import {
  buildPngCardOverlayLines,
  generatePngCards,
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
  const repeatCount = renderConfig.playlistRepeatCount;

  if (preset.renderer !== "png_card" || overlay.displayMode === "0") return null;

  const timings = computeTrackTimings(tracks, transition);
  const trackStartSecs = timings.map((t) => t.startSec);
  const baseDurationSec = computePlaylistDurationSec(snapshot);

  const specs: PngCardSpec[] = [];
  for (let cycle = 0; cycle < repeatCount; cycle++) {
    const cycleOffset = cycle * baseDurationSec;
    for (let i = 0; i < tracks.length; i++) {
      const timing = resolveOverlayTimings(
        trackStartSecs[i] + cycleOffset,
        tracks[i].durationSec,
        overlay.displayMode
      );
      if (timing.skip) continue;
      specs.push({
        localPath: join(workDir, `card_${cycle}_${i}.png`),
        track: tracks[i],
        tStart: timing.tStart,
        tEnd: timing.tEnd,
        fadeOut: timing.fadeOut,
      });
    }
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
  const { transition, overlay, waveform, hwaccel } = renderConfig;
  const bg = snapshot.background;
  const repeatCount = renderConfig.playlistRepeatCount;

  const timings = computeTrackTimings(tracks, transition);
  const trackStartSecs = timings.map((t) => t.startSec);
  const baseDurationSec = computePlaylistDurationSec(snapshot);
  const totalAudioSec = baseDurationSec * repeatCount;

  const preset = resolveOverlayPreset(overlay.presetId, overlay.presetVersion);

  const useVideotoolbox =
    hwaccel === "videotoolbox" && process.env.HWACCEL_DISABLED !== "1";

  // Hardware decode for video backgrounds (VideoToolbox, nv12 keeps frames CPU-accessible).
  const bgInput: string[] = bgKind === "video"
    ? [
        ...(useVideotoolbox
          ? ["-hwaccel", "videotoolbox", "-hwaccel_output_format", "nv12"]
          : []),
        "-stream_loop", "-1", "-i", bgLocalPath,
      ]
    : ["-loop", "1", "-i", bgLocalPath];

  const colorArgs = [
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
  ];

  const videoCodecArgs: string[] = useVideotoolbox
    ? [
        "-c:v", "h264_videotoolbox",
        "-profile:v", "high",
        "-b:v", "16M",
        "-g", "60",
        "-r", "30",
        ...colorArgs,
      ]
    : [
        "-c:v", "libx264",
        "-preset", "fast",
        "-profile:v", "high",
        "-b:v", "16M",
        "-maxrate", "20M",
        "-bufsize", "32M",
        "-g", "60",
        "-keyint_min", "15",
        "-r", "30",
        ...colorArgs,
      ];

  const formatArgs = ["-movflags", "+faststart"];

  let filterScript: string;
  let extraInputs: string[] = [];
  const visualOutputLabel = waveform.style === "off" ? "vout" : "_visualbase";

  if (preset.renderer === "png_card" && overlay.displayMode !== "0") {
    // Use pre-computed specs (from preparePngCardSpecs run concurrently with downloads),
    // or fall back to generating them inline.
    let specs: PngCardSpec[];
    if (options.pngCardSpecs !== undefined && options.pngCardSpecs !== null) {
      specs = options.pngCardSpecs;
    } else {
      const built: PngCardSpec[] = [];
      for (let cycle = 0; cycle < repeatCount; cycle++) {
        const cycleOffset = cycle * baseDurationSec;
        for (let i = 0; i < tracks.length; i++) {
          const timing = resolveOverlayTimings(
            trackStartSecs[i] + cycleOffset,
            tracks[i].durationSec,
            overlay.displayMode
          );
          if (timing.skip) continue;
          built.push({
            localPath: join(workDir, `card_${cycle}_${i}.png`),
            track: tracks[i],
            tStart: timing.tStart,
            tEnd: timing.tEnd,
            fadeOut: timing.fadeOut,
          });
        }
      }
      await generatePngCards(built, preset);
      specs = built;
    }

    const bgFilter = buildBgFilter(bg);

    if (specs.length === 0) {
      filterScript = `${bgFilter};\n[_bgproc]copy[${visualOutputLabel}]`;
    } else {
      extraInputs = specs.flatMap((spec) => ["-loop", "1", "-i", spec.localPath]);
      const overlayLines = buildPngCardOverlayLines(specs, 2, preset, visualOutputLabel);
      filterScript = `${bgFilter};\n${overlayLines.join(";\n")}`;
    }
  } else {
    // drawtext path (or displayMode "0")
    const overlayFilters = compileOverlayFilters(
      tracks,
      trackStartSecs,
      overlay.displayMode,
      preset
    );
    filterScript = buildFilterScript(bg, overlayFilters, visualOutputLabel);
  }

  if (waveform.style !== "off") {
    const waveFile = join(process.cwd(), "public", "waveforms", `${waveform.style}.mov`);
    // Input index: 0=bg, 1=audio, 2..N=PNG cards (4 tokens each = -loop 1 -i <path>)
    const waveInputIdx = 2 + extraInputs.length / 4;
    extraInputs = [...extraInputs, "-stream_loop", "-1", "-i", waveFile];
    filterScript =
      `${filterScript};\n` +
      `[${waveInputIdx}:v]format=rgba,scale=420:420[_wave];\n` +
      `[${visualOutputLabel}][_wave]overlay=x=(W-w)/2:y=H*0.85-h/2:format=auto:shortest=1[vout]`;
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

function computePlaylistDurationSec(snapshot: ProjectSnapshot): number {
  const timings = computeTrackTimings(snapshot.tracks, snapshot.renderConfig.transition);
  const lastTiming = timings[timings.length - 1];
  const lastTrack = snapshot.tracks[timings.length - 1];
  return lastTiming && lastTrack ? lastTiming.startSec + lastTrack.durationSec : 0;
}

function buildBgFilter(bg: ProjectSnapshot["background"]): string {
  const fit = bg?.fit ?? "cover";
  const dim = bg?.dim ?? 0;
  const blur = bg?.blur ?? 0;
  const cropX = bg?.cropX ?? 0.5;
  const cropY = bg?.cropY ?? 0.5;
  const cropW = bg?.cropW ?? 1.0;

  // Crop a cropW-fraction of the largest 16:9 box that fits inside the source.
  // The min() guards prevent near-16:9 images from requesting a crop 1-2px
  // larger than the source because of ratio rounding.
  const wCoef = cropW.toFixed(6);
  const xCoef = cropX.toFixed(6);
  const yCoef = cropY.toFixed(6);
  const cropExpr =
    `crop=min(in_w\\,in_h*16/9)*${wCoef}:min(in_h\\,in_w*9/16)*${wCoef}:` +
    `(in_w-out_w)*${xCoef}:(in_h-out_h)*${yCoef},` +
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
  overlayFilters: string[],
  finalLabel = "vout"
): string {
  const bgFilter = buildBgFilter(bg);

  if (overlayFilters.length === 0) {
    return `${bgFilter};\n[_bgproc]copy[${finalLabel}]`;
  }

  const chain = `[_bgproc]${overlayFilters.join(",")}[${finalLabel}]`;
  return `${bgFilter};\n${chain}`;
}
