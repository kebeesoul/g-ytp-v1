import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename } from "node:path";
import type { Track } from "@/lib/schema";
import { runFfmpeg } from "@/lib/ffmpeg/runFfmpeg";
import { activeProcesses } from "@/lib/render/processRegistry";
import { getMasteredProxyStoragePath } from "./constants";

export interface MasterTracksForRenderOptions {
  jobId: string;
  exportId: string;
  audioPaths: string[];
  tracks: Track[];
  workDir: string;
}

export interface MasteredTrackResult {
  localPath: string;
  storagePath: string;
}

export async function masterTracksForRender(
  options: MasterTracksForRenderOptions
): Promise<MasteredTrackResult[]> {
  const { jobId, exportId, audioPaths, tracks, workDir } = options;
  if (audioPaths.length !== tracks.length) {
    throw new Error("masterTracksForRender: audioPaths and tracks length mismatch");
  }

  const masteredDir = `${workDir.replace(/\/$/, "")}/mastered`;
  await mkdir(masteredDir, { recursive: true });

  const results: MasteredTrackResult[] = [];
  for (let i = 0; i < audioPaths.length; i++) {
    const track = tracks[i];
    const inputPath = audioPaths[i];
    const safeBase = basename(track.filename).replace(/\.[^.]+$/, "");
    const outputBase = `${String(i + 1).padStart(3, "0")}_${safeBase}`;
    const localPath = `${masteredDir}/${outputBase}.wav`;
    const proxyPath = `${masteredDir}/${outputBase}.m4a`;
    const reportPath = `${masteredDir}/${outputBase}.json`;
    const storagePath = getMasteredProxyStoragePath(exportId, track.id, i);

    await renderMasteredTrack(jobId, inputPath, localPath, reportPath);
    await renderStorageProxy(jobId, localPath, proxyPath);
    results.push({ localPath, storagePath });
  }

  return results;
}

async function renderMasteredTrack(
  jobId: string,
  inputPath: string,
  outputPath: string,
  reportPath: string
): Promise<void> {
  const python = process.env.PYTHON_BIN ?? "python3";
  const worker = process.env.MASTER_AUDIO_WORKER_PATH ?? "workers/master_audio.py";

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      python,
      [worker, inputPath, outputPath, "--report", reportPath],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    activeProcesses.set(jobId, proc);

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });

    proc.on("close", (code) => {
      activeProcesses.delete(jobId);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`master_audio.py failed with code ${code}:\n${stderr.slice(-4000)}`));
    });

    proc.on("error", (err) => {
      activeProcesses.delete(jobId);
      reject(err);
    });
  });
}

async function renderStorageProxy(
  jobId: string,
  inputPath: string,
  outputPath: string
): Promise<void> {
  await runFfmpeg({
    jobId,
    args: [
      "-y",
      "-i", inputPath,
      "-c:a", "aac",
      "-b:a", "256k",
      "-ar", "48000",
      outputPath,
    ],
  });
}
