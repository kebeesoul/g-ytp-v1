import { z } from "zod";
import { rm } from "node:fs/promises";
import { supabaseServer } from "@/lib/supabase/server";
import { activeProcesses, cancelledJobs } from "@/lib/render/processRegistry";
import { listStorageFiles, removeFromStorage } from "@/lib/supabase/storage";
import { getJobWorkDir } from "@/lib/workspace";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function POST(_req: Request, { params }: RouteParams): Promise<Response> {
  const { jobId } = await params;
  const parsed = z.string().uuid().safeParse(jobId);
  if (!parsed.success) {
    return Response.json({ error: "invalid jobId" }, { status: 400 });
  }

  const { data: job } = await supabaseServer
    .from("render_jobs")
    .select("project_id, status")
    .eq("id", jobId)
    .single();

  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }

  if (job.status !== "queued" && job.status !== "running") {
    return Response.json({ error: "job is not active" }, { status: 409 });
  }

  const projectId = job.project_id as string;

  // Signal runRenderPipeline catch block to skip DB error updates
  cancelledJobs.add(jobId);

  // Kill FFmpeg process
  const proc = activeProcesses.get(jobId);
  if (proc) {
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL");
    }, 2000);
  }

  // DB cleanup: delink job, then delete both records
  await supabaseServer
    .from("projects")
    .update({ latest_job_id: null })
    .eq("id", projectId);

  await supabaseServer
    .from("render_jobs")
    .delete()
    .eq("id", jobId);

  await supabaseServer
    .from("projects")
    .delete()
    .eq("id", projectId);

  // Storage cleanup (best-effort — partial files must not persist)
  const [exportFiles, importFiles] = await Promise.all([
    listStorageFiles(`export/${projectId}`).catch(() => [] as string[]),
    listStorageFiles(`import/${projectId}`).catch(() => [] as string[]),
  ]);
  const allFiles = [...exportFiles, ...importFiles];
  if (allFiles.length > 0) {
    await removeFromStorage(allFiles).catch(() => {});
  }

  // Local work directory cleanup
  await rm(getJobWorkDir(jobId), { recursive: true, force: true }).catch(() => {});

  return Response.json({ ok: true });
}
