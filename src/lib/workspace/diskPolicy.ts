import fs from "node:fs";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";
import { assertInsideWorkspace, workspacePaths } from "@/lib/workspace";

export async function cleanOrphanedTmpDirs(): Promise<void> {
  const tmpRoot = path.join(workspacePaths.root, "tmp");
  assertInsideWorkspace(tmpRoot);
  if (!fs.existsSync(tmpRoot)) return;

  const entries = await fs.promises.readdir(tmpRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const jobId = entry.name;
    const { data } = await supabaseServer
      .from("render_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();

    const status = data?.status as string | undefined;
    const isOrphan = !data || status === "done" || status === "error";
    if (!isOrphan) continue;

    const dir = path.join(tmpRoot, jobId);
    assertInsideWorkspace(dir);
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}
