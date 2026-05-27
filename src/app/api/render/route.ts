import { z } from "zod";
import { ProjectSnapshotSchema } from "@/lib/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";
import { startRenderJob } from "@/lib/render/startRenderJob";

type ProjectRow = Record<string, unknown>;

// Restore a project to its previous state, or delete it if it didn't exist before.
async function rollbackProject(exportId: string, previousProject: ProjectRow | null): Promise<void> {
  if (previousProject) {
    await supabaseServer.from("projects").upsert(previousProject, { onConflict: "id" });
  } else {
    await supabaseServer.from("projects").delete().eq("id", exportId);
  }
}

export async function POST(req: Request): Promise<Response> {
  await ensureBootCleanup();

  const body: unknown = await req.json();
  const parsed = z
    .object({
      snapshot: ProjectSnapshotSchema,
      exportId: z.string().uuid(),
    })
    .safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { snapshot, exportId } = parsed.data;

  const { data: active } = await supabaseServer
    .from("render_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .limit(1);

  if (active && active.length > 0) {
    return Response.json(
      { error: "another render is in progress" },
      { status: 409 }
    );
  }

  // Save the current project state before overwriting — needed to rollback on failure.
  const { data: previousProject } = await supabaseServer
    .from("projects")
    .select("*")
    .eq("id", exportId)
    .maybeSingle();

  const jobId = crypto.randomUUID();

  const { error: projErr } = await supabaseServer.from("projects").upsert({
    id: exportId,
    title: snapshot.title,
    snapshot,
    status: "rendering",
    export_folder: `export/${exportId}/`,
    latest_job_id: null,
    exported_at: null,
  }, { onConflict: "id" });
  if (projErr) {
    return Response.json(
      { error: `projects insert failed: ${projErr.message}` },
      { status: 500 }
    );
  }

  const { error: jobErr } = await supabaseServer.from("render_jobs").insert({
    id: jobId,
    project_id: exportId,
    status: "queued",
    progress: 0,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (jobErr) {
    await rollbackProject(exportId, previousProject);
    return Response.json(
      { error: `render_jobs insert failed: ${jobErr.message}` },
      { status: 500 }
    );
  }

  const { error: linkErr } = await supabaseServer
    .from("projects")
    .update({ latest_job_id: jobId })
    .eq("id", exportId);
  if (linkErr) {
    await supabaseServer.from("render_jobs").delete().eq("id", jobId);
    await rollbackProject(exportId, previousProject);
    return Response.json(
      { error: `project/job link failed: ${linkErr.message}` },
      { status: 500 }
    );
  }

  void startRenderJob(jobId).catch((err: unknown) => {
    console.error("[render] startRenderJob threw:", err);
  });

  return Response.json({ jobId, exportId });
}
