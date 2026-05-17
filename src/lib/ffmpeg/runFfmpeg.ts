import { spawn } from "node:child_process";
import { activeProcesses } from "@/lib/render/processRegistry";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

export interface RunFfmpegOptions {
  jobId?: string;
  args: string[];
  maxStderrTailLines?: number;
  onStdout?: (chunk: Buffer) => void;
}

export function runFfmpeg(options: RunFfmpegOptions): Promise<void> {
  const { jobId, args, maxStderrTailLines = 10, onStdout } = options;

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    if (jobId) activeProcesses.set(jobId, proc);

    let stderrBuf = "";
    // Cap stderr buffer to prevent unbounded memory growth during long renders
    const MAX_STDERR_BYTES = 64 * 1024;

    proc.stdout?.on("data", (chunk: Buffer) => {
      onStdout?.(chunk);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.length > MAX_STDERR_BYTES) {
        stderrBuf = stderrBuf.slice(-MAX_STDERR_BYTES);
      }
    });

    proc.on("close", (code) => {
      if (jobId) activeProcesses.delete(jobId);
      if (code === 0) {
        resolve();
        return;
      }

      const lines = stderrBuf.trim().split("\n");
      const tail = lines.slice(-maxStderrTailLines).join("\n");
      reject(new Error(`FFmpeg exited with code ${code}:\n${tail}`));
    });

    proc.on("error", (err) => {
      if (jobId) activeProcesses.delete(jobId);
      reject(err);
    });
  });
}
