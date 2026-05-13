import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { getJobWorkDir } from "@/lib/workspace";

export async function cleanupIntermediateFiles(jobId: string): Promise<void> {
  const workDir = getJobWorkDir(jobId);
  const keepPattern = /^final\.(mp4|mov)$/;

  try {
    const entries = await readdir(workDir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (keepPattern.test(entry.name)) return;
        await rm(join(workDir, entry.name), { recursive: true, force: true });
      })
    );
  } catch {
    // Ignore missing workspace directories and best-effort cleanup failures.
  }
}
