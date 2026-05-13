import { mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { supabaseServer } from "@/lib/supabase/server";
import {
  downloadFromStorage,
  copyInStorage,
  uploadToStorage,
} from "@/lib/supabase/storage";
import { concatAudio } from "@/lib/ffmpeg/concatAudio";
import { normalizeAudio } from "@/lib/ffmpeg/normalizeAudio";
import { renderVideo } from "@/lib/ffmpeg/renderVideo";
import { extractThumbnail } from "@/lib/ffmpeg/thumbnail";
import { generateTracklistText } from "@/lib/tracklist";
import { getJobWorkDir, getJobAudioDir, getFinalOutputPath } from "@/lib/workspace";
import { computeGlobalProgress, computeEtaSec } from "@/lib/ffmpeg/parseProgress";
import { activeProcesses } from "./processRegistry";
import { jobQueue } from "./jobQueue";
import { cleanupIntermediateFiles } from "./cleanupIntermediateFiles";
import type { ProjectSnapshot, Track, Background } from "@/lib/schema";

export async function runRenderPipeline(jobId: string): Promise<void> {
  const supabase = supabaseServer;
  let exportId: string | null = null;
  const startTimeMs = Date.now();

  try {
    // ── 잡 + 스냅샷 로드 ────────────────────────────────────────────────────
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

    // ── 상태: running ────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    await supabase
      .from("render_jobs")
      .update({ status: "running", started_at: now, updated_at: now })
      .eq("id", jobId);

    updateJobQueue(jobId, exportId, "running", 0, null, null);

    // ── STEP A: import 파일 복사 (재익스포트인 경우) ─────────────────────────
    snapshot = await copyImportIfNeeded(exportId, snapshot);
    // snapshot 업데이트 (storagePath 변경 가능)
    await supabase
      .from("projects")
      .update({ snapshot })
      .eq("id", exportId);

    // ── 워크스페이스 준비 ────────────────────────────────────────────────────
    const workDir = getJobWorkDir(jobId);
    const audioDir = getJobAudioDir(jobId);
    await mkdir(audioDir, { recursive: true });

    // ── STEP B: 음원 다운로드 ────────────────────────────────────────────────
    const audioPaths: string[] = [];
    for (const track of snapshot.tracks) {
      const localName = basename(track.storagePath);
      const localPath = join(audioDir, localName);
      const buf = await downloadFromStorage(track.storagePath);
      await writeFile(localPath, buf);
      audioPaths.push(localPath);
    }

    // ── 배경 다운로드 ────────────────────────────────────────────────────────
    if (!snapshot.background) throw new Error("background is required");
    const bgLocalName = basename(snapshot.background.storagePath);
    const bgLocalPath = join(workDir, bgLocalName);
    const bgBuf = await downloadFromStorage(snapshot.background.storagePath);
    await writeFile(bgLocalPath, bgBuf);

    updateJobQueue(jobId, exportId, "running", 0.05, null, null);

    // ── STEP B: Phase 1 — concat (progress 0 → 0.10) ─────────────────────────
    const concatRawPath = await concatAudio({
      audioPaths,
      transition: snapshot.renderConfig.transition,
      workDir,
    });
    updateJobQueue(jobId, exportId, "running", 0.10, null, null);
    await flushProgressToDB(jobId, 0.10, null);

    // ── STEP C: Phase 1 — normalize (progress 0.10 → 0.15) ───────────────────
    const concatM4aPath = await normalizeAudio({
      inputPath: concatRawPath,
      workDir,
      audioConfig: snapshot.renderConfig.audio,
    });
    updateJobQueue(jobId, exportId, "running", 0.15, null, null);
    await flushProgressToDB(jobId, 0.15, null);

    // ── STEP D: Phase 2 — 영상 합성 (progress 0.15 → 1.0) ────────────────────
    const outputFormat = snapshot.renderConfig.outputFormat;
    const outputPath = getFinalOutputPath(jobId, outputFormat);

    // DB flush 인터벌 (5초)
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

    // ── STEP E: 썸네일 추출 + 업로드 ─────────────────────────────────────────
    const thumbLocalPath = join(workDir, "thumbnail.jpg");
    await extractThumbnail(outputPath, thumbLocalPath);
    const thumbBuf = await readFileBuffer(thumbLocalPath);
    const thumbStoragePath = `import/${exportId}/thumbnail.jpg`;
    await uploadToStorage(thumbStoragePath, thumbBuf, "image/jpeg");

    // ── STEP E: tracklist.txt 생성 + 업로드 ──────────────────────────────────
    const tracklistText = generateTracklistText(snapshot);
    const tracklistPath = `export/${exportId}/tracklist.txt`;
    await uploadToStorage(
      tracklistPath,
      Buffer.from(tracklistText, "utf8"),
      "text/plain"
    );

    // ── 완료 갱신 ─────────────────────────────────────────────────────────────
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

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

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

// 재익스포트 시 import 파일 복사 (§3.2, §8 STEP A)
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

  const updatedTracks: Track[] = await Promise.all(
    snapshot.tracks.map(async (track) => {
      if (track.storagePath.startsWith(prefix)) return track;
      const filename = basename(track.storagePath);
      const newPath = `${prefix}${filename}`;
      await copyInStorage(track.storagePath, newPath);
      return { ...track, storagePath: newPath };
    })
  );

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
