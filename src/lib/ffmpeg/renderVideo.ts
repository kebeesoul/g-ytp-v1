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

const SEGMENT_KEYFRAME_SEC = 0.5;
const SEGMENT_KEYFRAME_FRAMES = 15;

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

export interface RepeatRenderedVideoOptions {
  jobId: string;
  inputPath: string;
  outputPath: string;
  workDir: string;
  repeatCount: number;
}

type RenderFilterPlan = {
  filterScript: string;
  extraInputs: string[];
};

export type PreparedRenderVideoAssets = {
  bgLoopClipPath?: string;
  filterPlan?: RenderFilterPlan;
  waveformBaked?: boolean;
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

  if (preset.renderer !== "png_card" || overlay.displayMode === "0") return null;

  const timings = computeTrackTimings(tracks, transition);
  const trackStartSecs = timings.map((t) => t.startSec);
  const baseDurationSec = computePlaylistDurationSec(snapshot);

  const specs: PngCardSpec[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const timing = resolveOverlayTimings(
      trackStartSecs[i],
      tracks[i].durationSec,
      overlay.displayMode
    );
    if (timing.skip) continue;
    specs.push({
      localPath: join(workDir, `card_0_${i}.png`),
      track: tracks[i],
      tStart: timing.tStart,
      tEnd: Math.min(timing.tEnd, baseDurationSec),
      fadeOut: timing.fadeOut,
    });
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
    bgKind === "image" && bgPreprocessed;
  const isFastStaticCopy = usesStaticLoop && overlay.displayMode === "0";
  const waveformBaked = usesStaticLoop && waveform.style !== "off";

  const bgLoopClipPath = usesStaticLoop ? join(workDir, "bg_loop_1s.mp4") : undefined;
  const bgLoopPromise = bgLoopClipPath
    ? createStaticImageLoopClip(
        `${jobId}:bg-loop`,
        bgLocalPath,
        bgLoopClipPath,
        useVideotoolbox,
        waveform.style
      )
    : Promise.resolve();

  const filterPlanPromise = isFastStaticCopy
    ? Promise.resolve(undefined)
    : buildRenderFilterPlan({
        snapshot,
        workDir,
        pngCardSpecs: options.pngCardSpecs,
        sourcePreprocessed: bgPreprocessed,
        extraInputStartIndex: 2,
        waveformBaked,
      });

  const [filterPlan] = await Promise.all([filterPlanPromise, bgLoopPromise]);
  return { bgLoopClipPath, filterPlan, waveformBaked };
}

export async function renderVideo(options: RenderVideoOptions): Promise<void> {
  const {
    jobId, bgLocalPath, bgKind, audioLocalPath, outputPath,
    bgPreprocessed = false, snapshot, workDir, startTimeMs, onProgress,
  } = options;

  const { renderConfig } = snapshot;
  const { overlay, waveform, hwaccel } = renderConfig;

  const baseDurationSec = computePlaylistDurationSec(snapshot);
  const totalAudioSec = baseDurationSec;

  const useVideotoolbox =
    hwaccel === "videotoolbox" && process.env.HWACCEL_DISABLED !== "1";

  if (
    bgKind === "image" &&
    bgPreprocessed &&
    overlay.displayMode === "0"
  ) {
    await renderStaticImageCopyPath({
      jobId,
      bgLocalPath,
      audioLocalPath,
      outputPath,
      workDir,
      useVideotoolbox,
      bgLoopClipPath: options.preparedAssets?.bgLoopClipPath,
      waveformStyle: waveform.style,
    });
    onProgress?.(1.0, null);
    return;
  }

  const preset = resolveOverlayPreset(overlay.presetId, overlay.presetVersion);
  if (
    bgKind === "image" &&
    bgPreprocessed &&
    preset.renderer === "png_card" &&
    (overlay.displayMode === "2" || overlay.displayMode === "5") &&
    options.pngCardSpecs &&
    options.pngCardSpecs.length > 0
  ) {
    await renderPngOverlaySegmentCopyPath({
      jobId,
      bgLocalPath,
      audioLocalPath,
      outputPath,
      workDir,
      snapshot,
      useVideotoolbox,
      bgLoopClipPath: options.preparedAssets?.bgLoopClipPath,
      pngCardSpecs: options.pngCardSpecs,
      startTimeMs,
      onProgress,
    });
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

  const videoCodecArgs = buildVideoCodecArgs(useVideotoolbox);

  const formatArgs = ["-movflags", "+faststart"];

  const filterPlan = options.preparedAssets?.filterPlan ?? await buildRenderFilterPlan({
    snapshot,
    workDir,
    pngCardSpecs: options.pngCardSpecs,
    sourcePreprocessed,
    extraInputStartIndex,
    waveformBaked: options.preparedAssets?.waveformBaked ?? false,
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
  waveformStyle?: ProjectSnapshot["renderConfig"]["waveform"]["style"];
}): Promise<void> {
  const loopClipPath = options.bgLoopClipPath ?? join(options.workDir, "bg_loop_1s.mp4");
  if (!options.bgLoopClipPath) {
    await createStaticImageLoopClip(
      options.jobId,
      options.bgLocalPath,
      loopClipPath,
      options.useVideotoolbox,
      options.waveformStyle
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

async function renderPngOverlaySegmentCopyPath(options: {
  jobId: string;
  bgLocalPath: string;
  audioLocalPath: string;
  outputPath: string;
  workDir: string;
  snapshot: ProjectSnapshot;
  useVideotoolbox: boolean;
  bgLoopClipPath?: string;
  pngCardSpecs: PngCardSpec[];
  startTimeMs: number;
  onProgress?: (globalProgress: number, etaSec: number | null) => void;
}): Promise<void> {
  const baseVideoPath = join(options.workDir, "base_visual_audio.mp4");
  await renderStaticImageCopyPath({
    jobId: options.jobId,
    bgLocalPath: options.bgLocalPath,
    audioLocalPath: options.audioLocalPath,
    outputPath: baseVideoPath,
    workDir: options.workDir,
    useVideotoolbox: options.useVideotoolbox,
    bgLoopClipPath: options.bgLoopClipPath,
    waveformStyle: options.snapshot.renderConfig.waveform.style,
  });

  const totalAudioSec =
    computePlaylistDurationSec(options.snapshot);
  const segments = buildOverlaySegments(options.pngCardSpecs, totalAudioSec);
  const segmentPaths: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentPath = join(options.workDir, `segment_${String(i).padStart(4, "0")}.mp4`);
    if (segment.card) {
      await renderOverlaySegment({
        jobId: options.jobId,
        inputPath: baseVideoPath,
        card: segment.card,
        outputPath: segmentPath,
        startSec: segment.startSec,
        durationSec: segment.endSec - segment.startSec,
        overlayStartSec: segment.overlayStartSec,
        overlayEndSec: segment.overlayEndSec,
        useVideotoolbox: options.useVideotoolbox,
        snapshot: options.snapshot,
      });
    } else {
      await copyVideoSegment({
        jobId: options.jobId,
        inputPath: baseVideoPath,
        outputPath: segmentPath,
        startSec: segment.startSec,
        durationSec: segment.endSec - segment.startSec,
      });
    }

    segmentPaths.push(segmentPath);
    const globalProgress = 0.15 + ((i + 1) / segments.length) * 0.85;
    options.onProgress?.(globalProgress, computeEtaSec(globalProgress, options.startTimeMs));
  }

  const listPath = join(options.workDir, "segments.txt");
  await writeFile(
    listPath,
    segmentPaths.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join("\n"),
    "utf8"
  );

  await runFfmpeg({
    jobId: options.jobId,
    args: [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      options.outputPath,
    ],
  });

  options.onProgress?.(1.0, null);
}

async function buildRenderFilterPlan(options: {
  snapshot: ProjectSnapshot;
  workDir: string;
  pngCardSpecs?: PngCardSpec[] | null;
  sourcePreprocessed: boolean;
  extraInputStartIndex: number;
  waveformBaked?: boolean;
}): Promise<RenderFilterPlan> {
  const { snapshot, workDir, sourcePreprocessed, extraInputStartIndex, waveformBaked = false } = options;
  const { tracks, renderConfig } = snapshot;
  const { transition, overlay, waveform } = renderConfig;
  const preset = resolveOverlayPreset(overlay.presetId, overlay.presetVersion);
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
      for (let i = 0; i < tracks.length; i++) {
        const timing = resolveOverlayTimings(
          trackStartSecs[i],
          tracks[i].durationSec,
          overlay.displayMode
        );
        if (timing.skip) continue;
        built.push({
          localPath: join(workDir, `card_0_${i}.png`),
          track: tracks[i],
          tStart: timing.tStart,
          tEnd: Math.min(timing.tEnd, baseDurationSec),
          fadeOut: timing.fadeOut,
        });
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

  if (waveform.style !== "off" && !waveformBaked) {
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

export async function repeatRenderedVideo(options: RepeatRenderedVideoOptions): Promise<void> {
  if (options.repeatCount <= 1) {
    if (options.inputPath !== options.outputPath) {
      await runFfmpeg({
        jobId: options.jobId,
        args: ["-y", "-i", options.inputPath, "-c", "copy", "-movflags", "+faststart", options.outputPath],
      });
    }
    return;
  }

  const listPath = join(options.workDir, "repeat_list.txt");
  await writeFile(
    listPath,
    Array.from({ length: options.repeatCount }, () => `file '${options.inputPath.replaceAll("'", "'\\''")}'`).join("\n"),
    "utf8"
  );

  await runFfmpeg({
    jobId: options.jobId,
    args: [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      options.outputPath,
    ],
  });
}

async function createStaticImageLoopClip(
  jobId: string,
  inputPath: string,
  outputPath: string,
  useVideotoolbox: boolean,
  waveformStyle: ProjectSnapshot["renderConfig"]["waveform"]["style"] = "off"
): Promise<void> {
  const codecArgs = buildVideoCodecArgs(useVideotoolbox, SEGMENT_KEYFRAME_FRAMES);
  const hasWaveform = waveformStyle !== "off";
  const waveFile = hasWaveform
    ? join(process.cwd(), "public", "waveforms", `${waveformStyle}.mov`)
    : null;

  await runFfmpeg({
    jobId,
    args: [
      "-y",
      "-loop", "1",
      "-i", inputPath,
      ...(waveFile ? ["-stream_loop", "-1", "-i", waveFile] : []),
      ...(waveFile
        ? [
            "-filter_complex",
            "[0:v]copy[_bgproc];[1:v]format=rgba,scale=240:240[_wave];[_bgproc][_wave]overlay=x=(W-w)/2:y=H*0.85-h/2:format=auto:shortest=1[vout]",
            "-map", "[vout]",
          ]
        : []),
      "-t", waveFile ? "2" : "1",
      ...codecArgs,
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath,
    ],
  });
}

type OverlaySegment =
  | {
      startSec: number;
      endSec: number;
      card: PngCardSpec;
      overlayStartSec: number;
      overlayEndSec: number;
    }
  | { startSec: number; endSec: number; card: null };

function buildOverlaySegments(specs: PngCardSpec[], totalDurationSec: number): OverlaySegment[] {
  const sorted = [...specs].sort((a, b) => a.tStart - b.tStart);
  const segments: OverlaySegment[] = [];
  let cursor = 0;

  for (const spec of sorted) {
    const overlayStartSec = Math.max(0, spec.tStart);
    const overlayEndSec = Math.min(totalDurationSec, spec.tEnd);
    const startSec = Math.max(0, snapDownToSegmentKeyframe(overlayStartSec));
    const endSec = Math.min(totalDurationSec, snapUpToSegmentKeyframe(overlayEndSec));
    if (endSec <= startSec) continue;

    const segmentStartSec = Math.max(startSec, cursor);
    if (endSec <= segmentStartSec) continue;
    if (startSec > cursor) {
      segments.push({ startSec: cursor, endSec: startSec, card: null });
    }

    segments.push({
      startSec: segmentStartSec,
      endSec,
      card: spec,
      overlayStartSec,
      overlayEndSec,
    });
    cursor = Math.max(cursor, endSec);
  }

  if (cursor < totalDurationSec) {
    segments.push({ startSec: cursor, endSec: totalDurationSec, card: null });
  }

  return segments.filter((segment) => segment.endSec - segment.startSec > 0.01);
}

function snapDownToSegmentKeyframe(sec: number): number {
  return Math.floor(sec / SEGMENT_KEYFRAME_SEC) * SEGMENT_KEYFRAME_SEC;
}

function snapUpToSegmentKeyframe(sec: number): number {
  return Math.ceil(sec / SEGMENT_KEYFRAME_SEC) * SEGMENT_KEYFRAME_SEC;
}

async function copyVideoSegment(options: {
  jobId: string;
  inputPath: string;
  outputPath: string;
  startSec: number;
  durationSec: number;
}): Promise<void> {
  await runFfmpeg({
    jobId: options.jobId,
    args: [
      "-y",
      "-ss", options.startSec.toFixed(3),
      "-i", options.inputPath,
      "-t", options.durationSec.toFixed(3),
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      options.outputPath,
    ],
  });
}

async function renderOverlaySegment(options: {
  jobId: string;
  inputPath: string;
  card: PngCardSpec;
  outputPath: string;
  startSec: number;
  durationSec: number;
  overlayStartSec: number;
  overlayEndSec: number;
  useVideotoolbox: boolean;
  snapshot: ProjectSnapshot;
}): Promise<void> {
  const preset = resolveOverlayPreset(
    options.snapshot.renderConfig.overlay.presetId,
    options.snapshot.renderConfig.overlay.presetVersion
  );
  const localSpec: PngCardSpec = {
    ...options.card,
    tStart: options.overlayStartSec - options.startSec,
    tEnd: options.overlayEndSec - options.startSec,
  };
  const overlayLines = buildPngCardOverlayLines([localSpec], 1, preset);
  const filterScriptPath = options.outputPath.replace(/\.mp4$/, ".txt");
  await writeFile(
    filterScriptPath,
    `[0:v]copy[_bgproc];\n${overlayLines.join(";\n")}`,
    "utf8"
  );

  await runFfmpeg({
    jobId: options.jobId,
    args: [
      "-y",
      "-ss", options.startSec.toFixed(3),
      "-i", options.inputPath,
      "-loop", "1",
      "-i", options.card.localPath,
      "-t", options.durationSec.toFixed(3),
      "-filter_complex_script", filterScriptPath,
      "-map", "[vout]",
      "-map", "0:a",
      ...buildVideoCodecArgs(options.useVideotoolbox),
      "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      "-avoid_negative_ts", "make_zero",
      options.outputPath,
    ],
  });
}

function buildVideoCodecArgs(
  useVideotoolbox: boolean,
  keyframeIntervalFrames = 60
): string[] {
  const colorArgs = [
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
  ];

  return useVideotoolbox
    ? [
        "-c:v", "hevc_videotoolbox",
        "-b:v", "4M",
        "-maxrate", "6M",
        "-bufsize", "12M",
        "-tag:v", "hvc1",
        "-g", String(keyframeIntervalFrames),
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
        "-g", String(keyframeIntervalFrames),
        "-keyint_min", String(keyframeIntervalFrames),
        "-r", "30",
        ...colorArgs,
      ];
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
