import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectSnapshot } from "@/lib/schema";
import { computeTrackTimings } from "@/lib/timecode";
import { resolveOverlayPreset } from "@/lib/design/presetRegistry";
import { compileOverlayFilters } from "./overlayCompiler";
import { parseFFmpegProgress, computeEtaSec } from "./parseProgress";
import { activeProcesses } from "@/lib/render/processRegistry";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

export interface RenderVideoOptions {
  jobId: string;
  bgLocalPath: string;
  bgKind: "image" | "video";
  audioLocalPath: string;  // concat.m4a
  outputPath: string;      // workspace/tmp/{jobId}/final.{mp4|mov}
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

  // 전체 오디오 길이 계산 (ETA 기준)
  const timings = computeTrackTimings(tracks, transition);
  const trackStartSecs = timings.map((t) => t.startSec);
  const lastTiming = timings[timings.length - 1];
  const totalAudioSec = lastTiming
    ? lastTiming.startSec + tracks[timings.length - 1].durationSec
    : 0;

  // 오버레이 프리셋 로드
  const preset = resolveOverlayPreset(overlay.presetId, overlay.presetVersion);

  // overlay 필터 생성
  const overlayFilters = compileOverlayFilters(
    tracks,
    trackStartSecs,
    overlay.displayMode,
    preset
  );

  // filter_complex 문자열 빌드
  const filterScript = buildFilterScript(bg, overlayFilters);
  const filterScriptPath = join(workDir, "filters.txt");
  await writeFile(filterScriptPath, filterScript, "utf8");

  // FFmpeg 인수 구성
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

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    activeProcesses.set(jobId, proc);

    let stdoutBuf = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      // -progress 출력: "progress=continue\n" 또는 "progress=end\n" 단위로 블록 분리
      const blocks = stdoutBuf.split(/progress=(?:continue|end)/);
      stdoutBuf = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;
        const result = parseFFmpegProgress(block, totalAudioSec);
        if (result && onProgress) {
          // renderVideo phase: globalProgress 0.15 ~ 1.0
          const global = 0.15 + result.progress * 0.85;
          const eta = computeEtaSec(global, startTimeMs);
          onProgress(global, eta);
        }
      }
    });

    let stderrBuf = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", (code) => {
      activeProcesses.delete(jobId);
      if (code === 0) {
        onProgress?.(1.0, null);
        resolve();
      } else {
        // stderr 마지막 10줄만 에러 메시지로
        const lines = stderrBuf.trim().split("\n");
        const tail = lines.slice(-10).join("\n");
        reject(new Error(`FFmpeg exited with code ${code}:\n${tail}`));
      }
    });

    proc.on("error", (err) => {
      activeProcesses.delete(jobId);
      reject(err);
    });
  });
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
    // 블러 배경 + 원본 contain
    const blurVal = blur > 0 ? blur : 20;
    bgFilter =
      `[0:v]split[_bg1][_bg2];\n` +
      `[_bg1]scale=1920:1080:force_original_aspect_ratio=increase,` +
      `crop=1920:1080,boxblur=${blurVal}:1[_blurred];\n` +
      `[_bg2]scale=1920:1080:force_original_aspect_ratio=decrease[_fg];\n` +
      `[_blurred][_fg]overlay=(W-w)/2:(H-h)/2,eq=brightness=${(-dim).toFixed(3)}[_bgproc]`;
  } else {
    // cover (기본)
    bgFilter =
      `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,` +
      `crop=1920:1080,eq=brightness=${(-dim).toFixed(3)}[_bgproc]`;
  }

  if (overlayFilters.length === 0) {
    // 오버레이 없음 — bgproc → vout
    return `${bgFilter};\n[_bgproc]copy[vout]`;
  }

  // 오버레이 체인: [_bgproc] → drawtext → ... → [vout]
  const chain = `[_bgproc]${overlayFilters.join(",")}[vout]`;
  return `${bgFilter};\n${chain}`;
}
