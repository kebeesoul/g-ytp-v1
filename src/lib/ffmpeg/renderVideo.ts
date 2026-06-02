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
  bgPreprocessed?: boolean;
  audioLocalPath: string;
  outputPath: string;
  snapshot: ProjectSnapshot;
  workDir: string;
  startTimeMs: number;
  onProgress?: (globalProgress: number, etaSec: number | null) => void;
  /** Pre-computed PNG card specs from preparePngCardSpecs(). Skip regeneration if provided. */
  pngCardSpecs?: PngCardSpec[] | null;
  preparedAssets?: PreparedRenderVideoAssets;
}

type RenderFilterPlan = {
  filterScript: string;
  extraInputs: string[];
};

export type PreparedRenderVideoAssets = {
  bgLoopClipPath?: string;
  filterPlan?: RenderFilterPlan;
};

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

export async function prepareRenderVideoAssets(options: {
  jobId: string;
  bgLocalPath: string;
  bgKind: "image" | "video";
  bgPreprocessed?: boolean;
  snapshot: ProjectSnapshot;
  workDir: string;
  pngCardSpecs?: PngCardSpec[] | null;
}): Promise<PreparedRenderVideoAssets> {
  const { jobId, bgLocalPath, bgKind, bgPreprocessed = false, snapshot, workDir } = options;
  const { overlay, waveform, hwaccel } = snapshot.renderConfig;
  const useVideotoolbox =
    hwaccel === "videotoolbox" && process.env.HWACCEL_DISABLED !== "1";
  const usesStaticLoop =
    bgKind === "image" && bgPreprocessed && waveform.style === "off";
  const isFastStaticCopy = usesStaticLoop && overlay.displayMode === "0";

  const bgLoopClipPath = usesStaticLoop ? join(workDir, "bg_loop_1s.mp4") : undefined;
  const bgLoopPromise = bgLoopClipPath
    ? createStaticImageLoopClip(`${jobId}:bg-loop`, bgLocalPath, bgLoopClipPath, useVideotoolbox)
    : Promise.resolve();

  const filterPlanPromise = isFastStaticCopy
    ? Promise.resolve(undefined)
    : buildRenderFilterPlan({
        snapshot,
        workDir,
        pngCardSpecs: options.pngCardSpecs,
        sourcePreprocessed: bgPreprocessed,
        extraInputStartIndex: 2,
      });

  const [filterPlan] = await Promise.all([filterPlanPromise, bgLoopPromise]);
  return { bgLoopClipPath, filterPlan };
}

export async function renderVideo(options: RenderVideoOptions): Promise<void> {
  const {
    jobId, bgLocalPath, bgKind, audioLocalPath, outputPath,
    bgPreprocessed = false, snapshot, workDir, startTimeMs, onProgress,
  } = options;

  const { renderConfig } = snapshot;
  const { overlay, waveform, hwaccel } = renderConfig;
  const repeatCount = renderConfig.playlistRepeatCount;

  const baseDurationSec = computePlaylistDurationSec(snapshot);
  const totalAudioSec = baseDurationSec * repeatCount;

  const useVideotoolbox =
    hwaccel === "videotoolbox" && process.env.HWACCEL_DISABLED !== "1";

  if (
    bgKind === "image" &&
    bgPreprocessed &&
    overlay.displayMode === "0" &&
    waveform.style === "off"
  ) {
    await renderStaticImageCopyPath({
      jobId,
      bgLocalPath,
      audioLocalPath,
      outputPath,
      workDir,
      useVideotoolbox,
      bgLoopClipPath: options.preparedAssets?.bgLoopClipPath,
    });
    onProgress?.(1.0, null);
    return;
  }

  let mainInput: string[] = bgKind === "video"
    ? [
        ...(useVideotoolbox
          ? ["-hwaccel", "videotoolbox"]
          : []),
        "-stream_loop", "-1", "-i", bgLocalPath,
      ]
    : ["-loop", "1", "-i", bgLocalPath];
  let audioInput: string[] = ["-i", audioLocalPath];
  let audioMap = "1:a";
  let extraInputStartIndex = 2;
  let sourcePreprocessed = bgPreprocessed;

  if (
    bgKind === "image" &&
    bgPreprocessed &&
    overlay.displayMode !== "0" &&
    waveform.style === "off"
  ) {
    const loopClipPath = options.preparedAssets?.bgLoopClipPath ?? join(workDir, "bg_loop_1s.mp4");
    if (!options.preparedAssets?.bgLoopClipPath) {
      await createStaticImageLoopClip(jobId, bgLocalPath, loopClipPath, useVideotoolbox);
    }
    mainInput = ["-stream_loop", "-1", "-i", loopClipPath];
    audioInput = ["-i", audioLocalPath];
    audioMap = "1:a";
    extraInputStartIndex = 2;
    sourcePreprocessed = true;
  }

  const colorArgs = [
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
  ];

  const videoCodecArgs: string[] = useVideotoolbox
    ? [
        "-c:v", "h264_videotoolbox",
        "-b:v", "5M",
        "-maxrate", "7M",
        "-bufsize", "14M",
        "-profile:v", "high",
        "-level:v", "4.1",
        "-g", "60",
        "-r", "30",
        ...colorArgs,
      ]
    : [
        "-c:v", "libx264",
        "-preset", "fast",
        "-profile:v", "high",
        "-b:v", "5M",
        "-maxrate", "7M",
        "-bufsize", "14M",
        "-g", "60",
        "-keyint_min", "15",
        "-r", "30",
        ...colorArgs,
      ];

  const formatArgs = ["-movflags", "+faststart"];

  const filterPlan = options.preparedAssets?.filterPlan ?? await buildRenderFilterPlan({
    snapshot,
    workDir,
    pngCardSpecs: options.pngCardSpecs,
    sourcePreprocessed,
    extraInputStartIndex,
  });

  const filterScriptPath = join(workDir, "filters.txt");
  await writeFile(filterScriptPath, filterPlan.filterScript, "utf8");

  const args: string[] = [
    "-y",
    ...mainInput,
    ...audioInput,
    ...filterPlan.extraInputs,
    "-filter_complex_script", filterScriptPath,
    "-map", "[vout]",
    "-map", audioMap,
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

async function renderStaticImageCopyPath(options: {
  jobId: string;
  bgLocalPath: string;
  audioLocalPath: string;
  outputPath: string;
  workDir: string;
  useVideotoolbox: boolean;
  bgLoopClipPath?: string;
}): Promise<void> {
  const loopClipPath = options.bgLoopClipPath ?? join(options.workDir, "bg_loop_1s.mp4");
  if (!options.bgLoopClipPath) {
    await createStaticImageLoopClip(
      options.jobId,
      options.bgLocalPath,
      loopClipPath,
      options.useVideotoolbox
    );
  }

  await runFfmpeg({
    jobId: options.jobId,
    args: [
      "-y",
      "-stream_loop", "-1",
      "-i", loopClipPath,
      "-i", options.audioLocalPath,
      "-c:v", "copy",
      "-c:a", "copy",
      "-shortest",
      "-movflags", "+faststart",
      options.outputPath,
    ],
  });
}

async function buildRenderFilterPlan(options: {
  snapshot: ProjectSnapshot;
  workDir: string;
  pngCardSpecs?: PngCardSpec[] | null;
  sourcePreprocessed: boolean;
  extraInputStartIndex: number;
}): Promise<RenderFilterPlan> {
  const { snapshot, workDir, sourcePreprocessed, extraInputStartIndex } = options;
  const { tracks, renderConfig } = snapshot;
  const { transition, overlay, waveform } = renderConfig;
  const preset = resolveOverlayPreset(overlay.presetId, overlay.presetVersion);
  const repeatCount = renderConfig.playlistRepeatCount;
  const timings = computeTrackTimings(tracks, transition);
  const trackStartSecs = timings.map((t) => t.startSec);
  const baseDurationSec = computePlaylistDurationSec(snapshot);
  const visualOutputLabel = waveform.style === "off" ? "vout" : "_visualbase";
  let filterScript: string;
  let extraInputs: string[] = [];

  if (preset.renderer === "png_card" && overlay.displayMode !== "0") {
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

    const bgFilter = buildBgFilter(snapshot.background, sourcePreprocessed);
    if (specs.length === 0) {
      filterScript = `${bgFilter};\n[_bgproc]copy[${visualOutputLabel}]`;
    } else {
      extraInputs = specs.flatMap((spec) => ["-loop", "1", "-i", spec.localPath]);
      const overlayLines = buildPngCardOverlayLines(
        specs,
        extraInputStartIndex,
        preset,
        visualOutputLabel
      );
      filterScript = `${bgFilter};\n${overlayLines.join(";\n")}`;
    }
  } else {
    const overlayFilters = compileOverlayFilters(
      tracks,
      trackStartSecs,
      overlay.displayMode,
      preset
    );
    filterScript = buildFilterScript(
      snapshot.background,
      overlayFilters,
      visualOutputLabel,
      sourcePreprocessed
    );
  }

  if (waveform.style !== "off") {
    const waveFile = join(process.cwd(), "public", "waveforms", `${waveform.style}.mov`);
    const waveInputIdx = extraInputStartIndex + extraInputs.length / 4;
    extraInputs = [...extraInputs, "-stream_loop", "-1", "-i", waveFile];
    filterScript =
      `${filterScript};\n` +
      `[${waveInputIdx}:v]format=rgba,scale=240:240[_wave];\n` +
      `[${visualOutputLabel}][_wave]overlay=x=(W-w)/2:y=H*0.85-h/2:format=auto:shortest=1[vout]`;
  }

  return { filterScript, extraInputs };
}

async function createStaticImageLoopClip(
  jobId: string,
  inputPath: string,
  outputPath: string,
  useVideotoolbox: boolean
): Promise<void> {
  const codecArgs = useVideotoolbox
    ? [
        "-c:v", "h264_videotoolbox",
        "-b:v", "5M",
        "-maxrate", "7M",
        "-bufsize", "14M",
        "-profile:v", "high",
        "-level:v", "4.1",
      ]
    : ["-c:v", "libx264", "-preset", "fast", "-profile:v", "high", "-b:v", "5M"];

  await runFfmpeg({
    jobId,
    args: [
      "-y",
      "-loop", "1",
      "-t", "1",
      "-i", inputPath,
      ...codecArgs,
      "-r", "30",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath,
    ],
  });
}

function computePlaylistDurationSec(snapshot: ProjectSnapshot): number {
  const timings = computeTrackTimings(snapshot.tracks, snapshot.renderConfig.transition);
  const lastTiming = timings[timings.length - 1];
  const lastTrack = snapshot.tracks[timings.length - 1];
  return lastTiming && lastTrack ? lastTiming.startSec + lastTrack.durationSec : 0;
}

function buildBgFilter(bg: ProjectSnapshot["background"], sourcePreprocessed = false): string {
  if (sourcePreprocessed) return "[0:v]copy[_bgproc]";

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
  finalLabel = "vout",
  sourcePreprocessed = false
): string {
  const bgFilter = buildBgFilter(bg, sourcePreprocessed);

  if (overlayFilters.length === 0) {
    return `${bgFilter};\n[_bgproc]copy[${finalLabel}]`;
  }

  const chain = `[_bgproc]${overlayFilters.join(",")}[${finalLabel}]`;
  return `${bgFilter};\n${chain}`;
}
