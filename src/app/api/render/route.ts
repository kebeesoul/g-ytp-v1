import { z } from "zod";
import { ProjectSnapshotSchema } from "@/lib/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";
import { startRenderJob } from "@/lib/render/startRenderJob";
import { validateRenderableSnapshot } from "@/lib/render/validateRenderableSnapshot";
import { fileExists, resolveStoragePath } from "@/lib/workspace";
import type { ProjectRecord } from "@/lib/schema";

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

function isActiveRenderConflict(error: SupabaseErrorLike): boolean {
  return (
    error.code === "23505" &&
    (error.message?.includes("idx_render_jobs_single_active") ?? false)
  );
}

type ProjectRollbackRecord = Pick<
  ProjectRecord,
  "id" | "title" | "snapshot" | "status" | "thumbnail_path" | "export_folder" | "latest_job_id" | "exported_at"
>;

async function rollbackProject(
  exportId: string,
  previousProject: ProjectRollbackRecord | null
): Promise<void> {
  if (!previousProject) {
    await supabaseServer.from("projects").delete().eq("id", exportId);
    return;
  }

  await supabaseServer.from("projects").upsert(previousProject, { onConflict: "id" });
}

function validateLocalInputFiles(snapshot: z.infer<typeof ProjectSnapshotSchema>): string | null {
  for (const track of snapshot.tracks) {
    const path = resolveStoragePath(track.storagePath);
    if (!fileExists(path)) {
      return `음원 파일이 로컬 workspace에 없습니다. 다시 업로드해주세요: ${track.storagePath}`;
    }
  }

  if (snapshot.background) {
    const path = resolveStoragePath(snapshot.background.storagePath);
    if (!fileExists(path)) {
      return `배경 이미지/영상 파일이 로컬 workspace에 없습니다. Visual Source에 다시 업로드해주세요: ${snapshot.background.storagePath}`;
    }
  }

  return null;
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
  const snapshotError = validateRenderableSnapshot(snapshot);
  if (snapshotError) {
    return Response.json({ error: snapshotError }, { status: 400 });
  }
  const inputFileError = validateLocalInputFiles(snapshot);
  if (inputFileError) {
    return Response.json({ error: inputFileError }, { status: 400 });
  }

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
  const { data: previousProject } = await supabaseServer
    .from("projects")
    .select("id, title, snapshot, status, thumbnail_path, export_folder, latest_job_id, exported_at")
    .eq("id", exportId)
    .maybeSingle();

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
    await rollbackProject(exportId, previousProject as ProjectRollbackRecord | null);
    if (isActiveRenderConflict(jobErr)) {
      return Response.json(
        { error: "another render is in progress" },
        { status: 409 }
      );
    }
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
    await rollbackProject(exportId, previousProject as ProjectRollbackRecord | null);
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
