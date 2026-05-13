import { z } from "zod";
import { ProjectSnapshotSchema } from "@/lib/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";
import { startRenderJob } from "@/lib/render/startRenderJob";

// §11.4 Layer A — 얇은 진입점. FFmpeg 로직 없음.
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

  // Layer D: DB 동시성 — running/queued 잡 존재 시 409
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

  const jobId = crypto.randomUUID();

  // projects 즉시 INSERT (status='rendering')
  const { error: projErr } = await supabaseServer.from("projects").insert({
    id: exportId,
    title: snapshot.title,
    snapshot,
    status: "rendering",
    export_folder: `export/${exportId}/`,
    latest_job_id: jobId,
    exported_at: null,
  });
  if (projErr) {
    return Response.json(
      { error: `projects insert failed: ${projErr.message}` },
      { status: 500 }
    );
  }

  // render_jobs INSERT
  const { error: jobErr } = await supabaseServer.from("render_jobs").insert({
    id: jobId,
    project_id: exportId,
    status: "queued",
    progress: 0,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (jobErr) {
    return Response.json(
      { error: `render_jobs insert failed: ${jobErr.message}` },
      { status: 500 }
    );
  }

  // 비차단 실행 — Layer A
  void startRenderJob(jobId).catch((err: unknown) => {
    console.error("[render] startRenderJob threw:", err);
  });

  return Response.json({ jobId, exportId });
}
