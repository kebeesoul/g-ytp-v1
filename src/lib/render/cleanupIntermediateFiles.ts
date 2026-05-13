import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { getJobWorkDir } from "@/lib/workspace";

// finally 절에서 호출 — final.{mp4|mov}는 다운로드용으로 유지
export async function cleanupIntermediateFiles(jobId: string): Promise<void> {
  const workDir = getJobWorkDir(jobId);
  const keepPattern = /^final\.(mp4|mov)$/;

  try {
    const entries = await readdir(workDir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) return; // audio/ 등 하위 폴더는 별도 처리 생략
        if (keepPattern.test(entry.name)) return;
        await unlink(join(workDir, entry.name)).catch(() => undefined);
      })
    );
  } catch {
    // workDir이 없어도 무시
  }
}
