import { mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { supabaseServer } from "@/lib/supabase/server";
import {
  downloadToFile,
  copyInStorage,
  uploadToStorage,
} from "@/lib/supabase/storage";
import { concatAndNormalize } from "@/lib/ffmpeg/concatAndNormalize";
import { renderVideo } from "@/lib/ffmpeg/renderVideo";
import { extractThumbnail } from "@/lib/ffmpeg/thumbnail";
import { generateTracklistText } from "@/lib/tracklist";
import { getJobWorkDir, getJobAudioDir, getFinalOutputPath } from "@/lib/workspace";
import { activeProcesses } from "./processRegistry";
import { jobQueue } from "./jobQueue";
import { cleanupIntermediateFiles } from "./cleanupIntermediateFiles";
import type { ProjectSnapshot, Track, Background } from "@/lib/schema";

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
    exportId = job.project_id as string;

    const { data: project } = await supabase
      .from("projects")
      .select("snapshot")
      .eq("id", exportId)
      .single();
    if (!project) throw new Error(`projects: ${exportId} not found`);

    let snapshot = project.snapshot as ProjectSnapshot;

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
    const audioDir = getJobAudioDir(jobId);
    await mkdir(audioDir, { recursive: true });

    if (!snapshot.background) throw new Error("background is required");
    const bgLocalName = basename(snapshot.background.storagePath);
    const bgLocalPath = join(workDir, bgLocalName);

    // A: Download tracks (up to 3 concurrent) and background simultaneously
    const [audioPaths] = await Promise.all([
      downloadTracksParallel(snapshot.tracks, audioDir),
      downloadToFile(snapshot.background.storagePath, bgLocalPath),
    ]);
    updateJobQueue(jobId, exportId, "running", 0.05, null, null);

    // B: Concat + normalize in one pipeline — no intermediate WAV file
    const concatM4aPath = await concatAndNormalize({
      jobId,
      audioPaths,
      transition: snapshot.renderConfig.transition,
      workDir,
      audioConfig: snapshot.renderConfig.audio,
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

  // Sequential to avoid N concurrent Supabase connections spiking memory + bandwidth
  const updatedTracks: Track[] = [];
  for (const track of snapshot.tracks) {
    if (track.storagePath.startsWith(prefix)) {
      updatedTracks.push(track);
      continue;
    }
    const filename = basename(track.storagePath);
    const newPath = `${prefix}${filename}`;
    await copyInStorage(track.storagePath, newPath);
    updatedTracks.push({ ...track, storagePath: newPath });
  }

  let updatedBg: Background | null = snapshot.background;
  if (updatedBg && !updatedBg.storagePath.startsWith(prefix)) {
    const filename = basename(updatedBg.storagePath);
    const newPath = `${prefix}${filename}`;
    await copyInStorage(updatedBg.storagePath, newPath);
    updatedBg = { ...updatedBg, storagePath: newPath };
  }

  return { ...snapshot, tracks: updatedTracks, background: updatedBg };
}

async function readFileBuffer(filePath: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(filePath);
}

// A: Download up to CONCURRENCY tracks at a time to avoid saturating memory.
// Order is preserved — audioPaths[i] corresponds to tracks[i].
const DOWNLOAD_CONCURRENCY = 3;

async function downloadTracksParallel(
  tracks: Track[],
  audioDir: string
): Promise<string[]> {
  const audioPaths = new Array<string>(tracks.length);
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (nextIdx < tracks.length) {
      const i = nextIdx++;
      const track = tracks[i];
      const localPath = join(audioDir, basename(track.storagePath));
      await downloadToFile(track.storagePath, localPath);
      audioPaths[i] = localPath;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, tracks.length) }, worker)
  );
  return audioPaths;
}
