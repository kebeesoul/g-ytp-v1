import { mkdir, copyFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { supabaseServer } from "@/lib/supabase/server";
import { uploadToStorage } from "@/lib/supabase/storage";
import { concatAndNormalize } from "@/lib/ffmpeg/concatAndNormalize";
import { renderVideo, preparePngCardSpecs } from "@/lib/ffmpeg/renderVideo";
import { extractThumbnail } from "@/lib/ffmpeg/thumbnail";
import { generateTracklistText } from "@/lib/tracklist";
import { getJobWorkDir, getFinalOutputPath, resolveStoragePath } from "@/lib/workspace";
import { activeProcesses, cancelledJobs } from "./processRegistry";
import { jobQueue } from "./jobQueue";
import { cleanupIntermediateFiles } from "./cleanupIntermediateFiles";
import { PresetRowSchema, rowToPreset } from "@/lib/presets";
import { registerPreset } from "@/lib/design/presetRegistry";
import { ProjectSnapshotSchema, RenderJobRecordSchema } from "@/lib/schema";
import type { ProjectSnapshot, Track, Background } from "@/lib/schema";
import { masterTracksForRender } from "@/lib/mastering/masterTracksForRender";

export async function runRenderPipeline(jobId: string): Promise<void> {
  const supabase = supabaseServer;
  let exportId: string | null = null;
  const startTimeMs = Date.now();

  try {
    const { data: job } = await supabase
      .from("render_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (!job) throw new Error(`render_jobs: ${jobId} not found`);
    const jobParsed = RenderJobRecordSchema.safeParse(job);
    if (!jobParsed.success) {
      throw new Error(`render_jobs row invalid: ${jobParsed.error.issues[0]?.message}`);
    }
    exportId = jobParsed.data.project_id;

    const { data: project } = await supabase
      .from("projects")
      .select("snapshot")
      .eq("id", exportId)
      .single();
    if (!project) throw new Error(`projects: ${exportId} not found`);

    const snapshotParsed = ProjectSnapshotSchema.safeParse(project.snapshot);
    if (!snapshotParsed.success) {
      throw new Error(`project snapshot schema invalid: ${snapshotParsed.error.issues[0]?.message}`);
    }
    let snapshot = snapshotParsed.data;

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
    await supabase
      .from("projects")
      .update({ snapshot })
      .eq("id", exportId);

    const workDir = getJobWorkDir(jobId);
    await mkdir(workDir, { recursive: true });

    if (!snapshot.background) throw new Error("background is required");
    const bgLocalPath = resolveStoragePath(snapshot.background.storagePath);

    // A: Resolve track paths from local workspace + prepare PNG cards in parallel.
    // Files are already on disk from the upload step — no download needed.
    let audioPaths = snapshot.tracks.map((t) =>
      resolveStoragePath(t.storagePath)
    );
    const pngCardSpecs = await preparePngCardSpecs(snapshot, workDir);
    updateJobQueue(jobId, exportId, "running", 0.05, null, null);

    // Optional: run Python mastering worker before concat.
    // Mastering handles loudness internally, so normalize is set to "off".
    if (snapshot.renderConfig.mastering) {
      audioPaths = await masterTracksForRender(snapshot.tracks, workDir);
    }

    // B: Concat + normalize in one pipeline — no intermediate WAV file
    const concatM4aPath = await concatAndNormalize({
      jobId,
      audioPaths,
      transition: snapshot.renderConfig.transition,
      workDir,
      audioConfig: snapshot.renderConfig.mastering
        ? { ...snapshot.renderConfig.audio, normalize: "off" }
        : snapshot.renderConfig.audio,
    });
    updateJobQueue(jobId, exportId, "running", 0.15, null, null);
    await flushProgressToDB(jobId, 0.15, null);

    const outputFormat = snapshot.renderConfig.outputFormat;
    const outputPath = getFinalOutputPath(jobId, outputFormat);

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
      audioLocalPath: concatM4aPath,
      outputPath,
      snapshot,
      workDir,
      startTimeMs,
      onProgress,
      pngCardSpecs,
    });

    // C: Extract thumbnail and upload tracklist concurrently
    const tracklistText = generateTracklistText(snapshot);
    const thumbLocalPath = join(workDir, "thumbnail.jpg");

    await Promise.all([
      extractThumbnail(outputPath, thumbLocalPath),
      uploadToStorage(
        `export/${exportId}/tracklist.txt`,
        Buffer.from(tracklistText, "utf8"),
        "text/plain"
      ),
    ]);

    const thumbBuf = await readFileBuffer(thumbLocalPath);
    const thumbStoragePath = `import/${exportId}/thumbnail.jpg`;
    await uploadToStorage(thumbStoragePath, thumbBuf, "image/jpeg");

    const completedAt = new Date().toISOString();
    await supabase
      .from("render_jobs")
      .update({
        status: "done",
        progress: 1,
        output_path: outputPath,
        completed_at: completedAt,
        updated_at: completedAt,
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
    console.log(`[render] ${jobId} done`);
  } catch (err) {
    // Cancel endpoint already wiped DB + storage — skip error updates
    if (cancelledJobs.has(jobId)) {
      console.log(`[render] ${jobId} cancelled by user`);
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
    !snapshot.background.storagePath.startsWith(prefix);

  if (!trackNeedsCopy && !bgNeedsCopy) return snapshot;

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
      await copyFile(resolveStoragePath(track.storagePath), resolveStoragePath(newPath));
      updatedTracks[i] = { ...track, storagePath: newPath };
    }
  }

  let updatedBg: Background | null = snapshot.background;
  const bgJob =
    updatedBg && !updatedBg.storagePath.startsWith(prefix)
      ? (async () => {
          const bg = updatedBg!;
          const filename = basename(bg.storagePath);
          const newPath = `${prefix}${filename}`;
          await copyFile(resolveStoragePath(bg.storagePath), resolveStoragePath(newPath));
          updatedBg = { ...bg, storagePath: newPath };
        })()
      : Promise.resolve();

  await Promise.all([
    ...Array.from({ length: Math.min(COPY_CONCURRENCY, snapshot.tracks.length || 1) }, copyWorker),
    bgJob,
  ]);

  return { ...snapshot, tracks: updatedTracks, background: updatedBg };
}

async function readFileBuffer(filePath: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(filePath);
}

