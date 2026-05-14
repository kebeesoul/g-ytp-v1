import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectSnapshot } from "@/lib/schema";
import { computeTrackTimings } from "@/lib/timecode";
import { resolveOverlayPreset } from "@/lib/design/presetRegistry";
import { compileOverlayFilters } from "./overlayCompiler";
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
  const overlayFilters = compileOverlayFilters(
    tracks,
    trackStartSecs,
    overlay.displayMode,
    preset
  );

  const filterScript = buildFilterScript(bg, overlayFilters);
  const filterScriptPath = join(workDir, "filters.txt");
  await writeFile(filterScriptPath, filterScript, "utf8");

  const useVideotoolbox =
    hwaccel === "videotoolbox" && process.env.HWACCEL_DISABLED !== "1";

  const bgInput: string[] = bgKind === "video"
    ? ["-stream_loop", "-1", "-i", bgLocalPath]
    : ["-loop", "1", "-i", bgLocalPath];

  const videoCodecArgs: string[] = useVideotoolbox
    ? ["-c:v", "h264_videotoolbox", "-q:v", "60"]
    : ["-c:v", "libx264", "-preset", "medium", "-crf", "18"];

  const formatArgs: string[] = outputFormat === "mp4"
    ? ["-movflags", "+faststart"]
    : [];

  const args: string[] = [
    "-y",
    ...bgInput,
    "-i", audioLocalPath,
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

function buildFilterScript(
  bg: ProjectSnapshot["background"],
  overlayFilters: string[]
): string {
  const fit = bg?.fit ?? "cover";
  const dim = bg?.dim ?? 0.25;
  const blur = bg?.blur ?? 0;

  let bgFilter: string;

  if (fit === "blurred_contain") {
    const blurVal = blur > 0 ? blur : 20;
    bgFilter =
      `[0:v]split[_bg1][_bg2];\n` +
      `[_bg1]scale=1920:1080:force_original_aspect_ratio=increase,` +
      `crop=1920:1080,boxblur=${blurVal}:1[_blurred];\n` +
      `[_bg2]scale=1920:1080:force_original_aspect_ratio=decrease[_fg];\n` +
      `[_blurred][_fg]overlay=(W-w)/2:(H-h)/2,eq=brightness=${(-dim).toFixed(3)}[_bgproc]`;
  } else {
    bgFilter =
      `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,` +
      `crop=1920:1080,eq=brightness=${(-dim).toFixed(3)}[_bgproc]`;
  }

  if (overlayFilters.length === 0) {
    return `${bgFilter};\n[_bgproc]copy[vout]`;
  }

  const chain = `[_bgproc]${overlayFilters.join(",")}[vout]`;
  return `${bgFilter};\n${chain}`;
}
