import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Track } from "@/lib/schema";
import { resolveStoragePath } from "@/lib/workspace";

// Runs the Python mastering worker on each track sequentially and returns
// the local paths to the mastered WAV files. Mastered files are written
// to workDir so they're cleaned up along with other intermediate files.
export async function masterTracksForRender(
  tracks: Track[],
  workDir: string
): Promise<string[]> {
  const python = process.env.PYTHON_PATH ?? "python3";
  const workerPath = join(process.cwd(), "workers", "master_audio.py");

  const masteredPaths: string[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const inputPath = resolveStoragePath(track.storagePath);
    const outputPath = join(workDir, `mastered_${String(i + 1).padStart(3, "0")}.wav`);

    await runMasteringWorker(python, workerPath, inputPath, outputPath);
    masteredPaths.push(outputPath);
  }

  return masteredPaths;
}

function runMasteringWorker(
  python: string,
  workerPath: string,
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(python, [workerPath, inputPath, outputPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mastering worker failed (code ${code}):\n${stderr.slice(-1000)}`));
    });
    proc.on("error", (err) => reject(err));
  });
}
