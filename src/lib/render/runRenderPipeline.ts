import { statSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { supabaseServer } from "@/lib/supabase/server";
import { uploadToStorage } from "@/lib/supabase/storage";
import { concatAndNormalize } from "@/lib/ffmpeg/concatAndNormalize";
import {
  renderVideo,
  preparePngCardSpecs,
  prepareRenderVideoAssets,
  repeatRenderedVideo,
} from "@/lib/ffmpeg/renderVideo";
import { extractThumbnail } from "@/lib/ffmpeg/thumbnail";
import { masterTracksForRender } from "@/lib/mastering/renderMastering";
import { generateTracklistText } from "@/lib/tracklist";
import { computeTrackTimings } from "@/lib/timecode";
import {
  assertInsideWorkspace,
  fileExists,
  getJobWorkDir,
  resolveStoragePath,
  workspacePaths,
} from "@/lib/workspace";
import { activeProcesses, cancelledJobs } from "./processRegistry";
import { jobQueue } from "./jobQueue";
import { cleanupIntermediateFiles } from "./cleanupIntermediateFiles";
import { PresetRowSchema, rowToPreset } from "@/lib/presets";
import { registerPreset } from "@/lib/design/presetRegistry";
import type { ProjectSnapshot, Track, Background } from "@/lib/schema";

export async function runRenderPipeline(jobId: string): Promise<void> {
  const supabase = supabaseServer;
  let exportId: string | null = null;
  let masteredFromCache = false;
  const startTimeMs = Date.now();

  try {
    const { data: job } = await supabase
      .from("render_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (!job) throw new Error(`render_jobs: ${jobId} not found`);
    exportId = job.project_id as string;

    const { data: project } = await supabase
      .from("projects")
      .select("snapshot")
      .eq("id", exportId)
      .single();
    if (!project) throw new Error(`projects: ${exportId} not found`);

    let snapshot = project.snapshot as ProjectSnapshot;

    // Load user-saved overlay preset from DB into the in-memory registry before rendering.
    // The default preset is already in the registry; skip the DB lookup for it.
    const overlayConfig = snapshot.renderConfig.overlay;
    if (overlayConfig.presetId !== "default") {
      const { data: presetRow, error: presetErr } = await supabase
        .from("overlay_presets")
        .select("*")
        .eq("id", overlayConfig.presetId)
        .single();
      if (presetErr || !presetRow) {
        throw new Error(`overlay preset not found in DB: ${overlayConfig.presetId} (${presetErr?.message ?? "no row"})`);
      }
      const rowParsed = PresetRowSchema.safeParse(presetRow);
      if (!rowParsed.success) {
        throw new Error(`overlay preset schema invalid: ${rowParsed.error.issues[0]?.message}`);
      }
      const preset = rowToPreset(rowParsed.data);
      if (!preset) {
        throw new Error(`overlay preset mapping failed: ${overlayConfig.presetId}`);
      }
      // Register under the version the snapshot expects so resolveOverlayPreset succeeds.
      registerPreset({ ...preset, version: overlayConfig.presetVersion });
    }

    const now = new Date().toISOString();
    await supabase
      .from("render_jobs")
      .update({ status: "running", started_at: now, updated_at: now })
      .eq("id", jobId);

    updateJobQueue(jobId, exportId, "running", 0, null, null);

    snapshot = await copyImportIfNeeded(exportId, snapshot);
    const repeatCount = snapshot.renderConfig.playlistRepeatCount;
    const singlePassSnapshot: ProjectSnapshot = {
      ...snapshot,
      renderConfig: {
        ...snapshot.renderConfig,
        playlistRepeatCount: 1,
      },
    };
    await supabase
      .from("projects")
      .update({ snapshot })
      .eq("id", exportId);

    const workDir = getJobWorkDir(jobId);
    await mkdir(workDir, { recursive: true });

    if (!snapshot.background) throw new Error("background is required");
    const bgStoragePath =
      snapshot.background.processedStoragePath ?? snapshot.background.storagePath;
    const bgLocalPath = resolveStoragePath(bgStoragePath);
    if (!fileExists(bgLocalPath)) {
      throw new Error(`input file not found: ${bgStoragePath}`);
    }

    // A: Resolve local input files + prepare PNG cards in parallel.
    // PNG card generation only requires snapshot data (no downloaded files needed).
    const [audioPaths, pngCardSpecs] = await Promise.all([
      resolveTrackPaths(snapshot.tracks),
      preparePngCardSpecs(singlePassSnapshot, workDir),
    ]);
    updateJobQueue(jobId, exportId, "running", 0.05, null, null);

    let renderAudioPaths = audioPaths;
    if (snapshot.renderConfig.mastering) {
      const masteredResult = await masterTracksForRender({
          jobId,
          exportId,
          audioPaths,
          tracks: snapshot.tracks,
          workDir,
      });
      masteredFromCache = masteredResult.some(
        (track) => "fromCache" in track && track.fromCache === true
      );
      renderAudioPaths = masteredResult.map((track) => track.localPath);
    }

    if (snapshot.renderConfig.mastering) {
      updateJobQueue(jobId, exportId, "running", 0.1, null, null);
      await flushProgressToDB(jobId, 0.1, null);
    }

    const [concatM4aPath, preparedVideoAssets] = await Promise.all([
      concatAndNormalize({
        jobId,
        audioPaths: renderAudioPaths,
        transition: snapshot.renderConfig.transition,
        workDir,
        audioConfig: snapshot.renderConfig.mastering
          ? { ...snapshot.renderConfig.audio, normalize: "off" }
          : snapshot.renderConfig.audio,
      }),
      prepareRenderVideoAssets({
        jobId,
        bgLocalPath,
        bgKind: snapshot.background.kind,
        bgPreprocessed: !!snapshot.background.processedStoragePath,
        snapshot: singlePassSnapshot,
        workDir,
        pngCardSpecs,
      }),
    ]);
    updateJobQueue(jobId, exportId, "running", 0.15, null, null);
    await flushProgressToDB(jobId, 0.15, null);

    const exportDir = workspacePaths.exportDir(exportId);
    assertInsideWorkspace(exportDir);
    await mkdir(exportDir, { recursive: true });
    const outputPath = workspacePaths.finalVideo(exportId, "mp4");
    assertInsideWorkspace(outputPath);
    const singlePassOutputPath =
      repeatCount > 1 ? `${workDir.replace(/\/$/, "")}/final_once.mp4` : outputPath;

    let lastFlush = Date.now();
    const onProgress = async (globalProgress: number, etaSec: number | null) => {
      updateJobQueue(jobId, exportId!, "running", globalProgress, etaSec, null);
      if (Date.now() - lastFlush > 5000) {
        lastFlush = Date.now();
        void flushProgressToDB(jobId, globalProgress, etaSec);
      }
    };

    await renderVideo({
      jobId,
      bgLocalPath,
      bgKind: snapshot.background.kind,
      bgPreprocessed: !!snapshot.background.processedStoragePath,
      audioLocalPath: concatM4aPath,
      outputPath: singlePassOutputPath,
      snapshot: singlePassSnapshot,
      workDir,
      startTimeMs,
      onProgress,
      pngCardSpecs,
      preparedAssets: preparedVideoAssets,
    });

    if (repeatCount > 1) {
      await repeatRenderedVideo({
        jobId,
        inputPath: singlePassOutputPath,
        outputPath,
        workDir,
        repeatCount,
      });
    }

    // C: Extract thumbnail and upload tracklist concurrently
    const tracklistText = generateTracklistText(snapshot);
    const thumbLocalPath = workspacePaths.thumbnail(exportId);
    assertInsideWorkspace(thumbLocalPath);
    await mkdir(dirname(thumbLocalPath), { recursive: true });

    await Promise.all([
      extractThumbnail(outputPath, thumbLocalPath),
      uploadToStorage(
        `export/${exportId}/tracklist.txt`,
        Buffer.from(tracklistText, "utf8"),
        "text/plain"
      ),
    ]);

    const thumbStoragePath = `import/${exportId}/thumbnail.jpg`;

    const completedAt = new Date().toISOString();
    const renderDurationSec = Math.round((Date.now() - startTimeMs) / 1000);
    const timings = computeTrackTimings(
      snapshot.tracks,
      snapshot.renderConfig.transition
    );
    const lastTiming = timings[timings.length - 1];
    const audioDurationSec =
      (lastTiming?.endSec ?? 0) * snapshot.renderConfig.playlistRepeatCount;
    const encoder =
      snapshot.renderConfig.hwaccel === "videotoolbox" &&
      process.env.HWACCEL_DISABLED !== "1"
        ? "hevc_videotoolbox"
        : "libx264";
    let outputSizeBytes: number | null = null;
    try {
      outputSizeBytes = statSync(outputPath).size;
    } catch {
      // Keep telemetry nullable if the completed output cannot be statted.
    }

    await supabase
      .from("render_jobs")
      .update({
        status: "done",
        progress: 1,
        output_path: outputPath,
        completed_at: completedAt,
        updated_at: completedAt,
        render_duration_sec: renderDurationSec,
        audio_duration_sec: audioDurationSec,
        encoder,
        output_size_bytes: outputSizeBytes,
        cache_hit: masteredFromCache,
      })
      .eq("id", jobId);

    await supabase
      .from("projects")
      .update({
        status: "done",
        thumbnail_path: thumbStoragePath,
        exported_at: completedAt,
        latest_job_id: jobId,
      })
      .eq("id", exportId);

    updateJobQueue(jobId, exportId, "done", 1, null, null, outputPath, completedAt);
  } catch (err) {
    // Cancel endpoint already wiped DB + storage — skip error updates
    if (cancelledJobs.has(jobId)) {
      return;
    }

    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[render] ${jobId} error:`, msg);

    const completedAt = new Date().toISOString();
    await supabaseServer
      .from("render_jobs")
      .update({ status: "error", error_msg: msg, completed_at: completedAt, updated_at: completedAt })
      .eq("id", jobId);

    if (exportId) {
      await supabaseServer
        .from("projects")
        .update({ status: "error" })
        .eq("id", exportId);
    }

    updateJobQueue(jobId, exportId ?? "", "error", 0, null, msg);
  } finally {
    activeProcesses.delete(jobId);
    cancelledJobs.delete(jobId);
    await cleanupIntermediateFiles(jobId);
  }
}

function updateJobQueue(
  jobId: string,
  projectId: string,
  status: "queued" | "running" | "done" | "error",
  progress: number,
  etaSec: number | null,
  errorMsg: string | null,
  outputPath: string | null = null,
  completedAt: string | null = null
): void {
  const now = new Date().toISOString();
  jobQueue.set(jobId, {
    id: jobId,
    project_id: projectId,
    status,
    progress,
    eta_sec: etaSec,
    error_msg: errorMsg,
    output_path: outputPath,
    started_at: jobQueue.get(jobId)?.started_at ?? now,
    updated_at: now,
    completed_at: completedAt,
  });
}

async function flushProgressToDB(
  jobId: string,
  progress: number,
  etaSec: number | null
): Promise<void> {
  await supabaseServer
    .from("render_jobs")
    .update({
      progress,
      eta_sec: etaSec,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function copyImportIfNeeded(
  exportId: string,
  snapshot: ProjectSnapshot
): Promise<ProjectSnapshot> {
  const prefix = `import/${exportId}/`;

  const trackNeedsCopy = snapshot.tracks.some(
    (t) => !t.storagePath.startsWith(prefix)
  );
  const bgNeedsCopy =
    snapshot.background &&
    (!snapshot.background.storagePath.startsWith(prefix) ||
      (!!snapshot.background.processedStoragePath &&
        !snapshot.background.processedStoragePath.startsWith(prefix)));

  if (!trackNeedsCopy && !bgNeedsCopy) return snapshot;

  const destDir = workspacePaths.importDir(exportId);
  assertInsideWorkspace(destDir);
  await mkdir(destDir, { recursive: true });

  const COPY_CONCURRENCY = 3;
  const updatedTracks: Track[] = new Array(snapshot.tracks.length);
  let nextIdx = 0;

  async function copyWorker(): Promise<void> {
    while (nextIdx < snapshot.tracks.length) {
      const i = nextIdx++;
      const track = snapshot.tracks[i];
      if (track.storagePath.startsWith(prefix)) {
        updatedTracks[i] = track;
        continue;
      }
      const filename = basename(track.storagePath);
      const newPath = `${prefix}${filename}`;
      const src = resolveStoragePath(track.storagePath);
      const dest = workspacePaths.importFile(exportId, filename);
      assertInsideWorkspace(src);
      assertInsideWorkspace(dest);
      await copyFile(src, dest);
      updatedTracks[i] = { ...track, storagePath: newPath };
    }
  }

  let updatedBg: Background | null = snapshot.background;
  const bgJob =
    updatedBg && (
      !updatedBg.storagePath.startsWith(prefix) ||
      (!!updatedBg.processedStoragePath && !updatedBg.processedStoragePath.startsWith(prefix))
    )
      ? (async () => {
          const bg = updatedBg!;
          let nextBg = bg;
          if (!bg.storagePath.startsWith(prefix)) {
            const filename = basename(bg.storagePath);
            const newPath = `${prefix}${filename}`;
            const src = resolveStoragePath(bg.storagePath);
            const dest = workspacePaths.importFile(exportId, filename);
            assertInsideWorkspace(src);
            assertInsideWorkspace(dest);
            await copyFile(src, dest);
            nextBg = { ...nextBg, storagePath: newPath };
          }
          if (bg.processedStoragePath && !bg.processedStoragePath.startsWith(prefix)) {
            const filename = basename(bg.processedStoragePath);
            const newPath = `${prefix}${filename}`;
            const src = resolveStoragePath(bg.processedStoragePath);
            const dest = workspacePaths.importFile(exportId, filename);
            assertInsideWorkspace(src);
            assertInsideWorkspace(dest);
            await copyFile(src, dest);
            nextBg = { ...nextBg, processedStoragePath: newPath };
          }
          updatedBg = nextBg;
        })()
      : Promise.resolve();

  await Promise.all([
    ...Array.from({ length: Math.min(COPY_CONCURRENCY, snapshot.tracks.length || 1) }, copyWorker),
    bgJob,
  ]);

  return { ...snapshot, tracks: updatedTracks, background: updatedBg };
}

function resolveTrackPaths(tracks: Track[]): string[] {
  return tracks.map((track) => {
    const absPath = resolveStoragePath(track.storagePath);
    if (!fileExists(absPath)) {
      throw new Error(`input file not found: ${track.storagePath}`);
    }
    return absPath;
  });
}
