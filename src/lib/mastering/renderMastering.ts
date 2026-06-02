import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { basename } from "node:path";
import type { Track } from "@/lib/schema";
import { registerProcess, unregisterProcess } from "@/lib/render/processRegistry";
import { assertInsideWorkspace, fileExists, workspacePaths } from "@/lib/workspace";
import { FIXED_MASTERING_SETTINGS, getMasteredStoragePath } from "./constants";

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
  await mkdir(workspacePaths.masteredCacheDir(), { recursive: true });

  return mapWithConcurrency(audioPaths, getMasteringConcurrency(), async (inputPath, i) => {
    const track = tracks[i];
    const safeBase = basename(track.filename).replace(/\.[^.]+$/, "");
    const outputBase = `${String(i + 1).padStart(3, "0")}_${safeBase}`;
    const localPath = `${masteredDir}/${outputBase}.wav`;
    const reportPath = `${masteredDir}/${outputBase}.json`;
    const storagePath = getMasteredStoragePath(exportId, track.id, i);
    const cachePath = workspacePaths.masteredCacheFile(await buildMasteringCacheKey(inputPath));
    assertInsideWorkspace(cachePath);

    if (fileExists(cachePath)) {
      await copyFile(cachePath, localPath);
      return { localPath, storagePath };
    }

    await renderMasteredTrack(jobId, inputPath, localPath, reportPath);
    await copyFile(localPath, cachePath);
    return { localPath, storagePath };
  });
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
    registerProcess(jobId, proc);

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });

    proc.on("close", (code) => {
      unregisterProcess(jobId, proc);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`master_audio.py failed with code ${code}:\n${stderr.slice(-4000)}`));
    });

    proc.on("error", (err) => {
      unregisterProcess(jobId, proc);
      reject(err);
    });
  });
}

function getMasteringConcurrency(): number {
  const parsed = Number.parseInt(process.env.MASTERING_CONCURRENCY ?? "2", 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(Math.max(parsed, 1), 3);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= items.length) return;

    results[index] = await worker(items[index], index);
    await runNext();
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runNext())
  );
  return results;
}

async function buildMasteringCacheKey(inputPath: string): Promise<string> {
  assertInsideWorkspace(inputPath);
  const hash = createHash("sha256");
  hash.update(JSON.stringify(FIXED_MASTERING_SETTINGS));

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(inputPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return hash.digest("hex");
}
