import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { ProjectRecordSchema } from "@/lib/schema";
import { activeProcesses } from "@/lib/render/processRegistry";
import { listStorageFiles, removeFromStorage } from "@/lib/supabase/storage";
import { workspacePaths } from "@/lib/workspace";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const exportId = parsed.data;

  const { data, error } = await supabaseServer
    .from("projects")
    .select("*")
    .eq("id", exportId)
    .single();

  if (error || !data) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const record = ProjectRecordSchema.safeParse(data);
  if (!record.success) {
    return Response.json({ error: "schema validation failed" }, { status: 500 });
  }

  return Response.json({
    ...record.data,
    filesAvailable: existsSync(join(workspacePaths.import, exportId)),
  });
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const exportId = parsed.data;

  // STEP 0: running/queued 잡 차단 (DB + in-memory 이중 체크)
  const { data: activeJobs } = await supabaseServer
    .from("render_jobs")
    .select("id, status")
    .eq("project_id", exportId)
    .in("status", ["queued", "running"]);

  const hasActiveDbJob = (activeJobs?.length ?? 0) > 0;
  const hasActiveProcess = (activeJobs ?? []).some((j) => activeProcesses.has(j.id));

  if (hasActiveDbJob || hasActiveProcess) {
    return Response.json(
      { error: "cannot delete project while render is running" },
      { status: 409 }
    );
  }

  // STEP 1: DB 레코드 존재 확인
  const { data: record } = await supabaseServer
    .from("projects")
    .select("id")
    .eq("id", exportId)
    .single();
  if (!record) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // STEP 2: export 폴더 삭제 + 검증
  const exportPrefix = `export/${exportId}`;
  const exportList = await listStorageFiles(exportPrefix);
  if (exportList.length > 0) {
    await removeFromStorage(exportList);
    const exportLeft = await listStorageFiles(exportPrefix);
    if (exportLeft.length > 0) {
      return Response.json({ error: "export not empty after remove" }, { status: 500 });
    }
  }

  // STEP 3: import 폴더 삭제 + 검증
  const importPrefix = `import/${exportId}`;
  const importList = await listStorageFiles(importPrefix);
  if (importList.length > 0) {
    await removeFromStorage(importList);
    const importLeft = await listStorageFiles(importPrefix);
    if (importLeft.length > 0) {
      return Response.json({ error: "import not empty after remove" }, { status: 500 });
    }
  }

  // STEP 4: latest_job_id NULL 해제
  await supabaseServer
    .from("projects")
    .update({ latest_job_id: null })
    .eq("id", exportId);

  // STEP 5: render_jobs 삭제
  const { error: rjError } = await supabaseServer
    .from("render_jobs")
    .delete()
    .eq("project_id", exportId);
  if (rjError) {
    return Response.json({ error: "render_jobs delete failed" }, { status: 500 });
  }

  // STEP 6: projects 삭제 + 검증
  const { error: pError } = await supabaseServer
    .from("projects")
    .delete()
    .eq("id", exportId);
  if (pError) {
    return Response.json({ error: "projects delete failed" }, { status: 500 });
  }

  const { data: check } = await supabaseServer
    .from("projects")
    .select("id")
    .eq("id", exportId)
    .maybeSingle();
  if (check) {
    return Response.json({ error: "projects still exists after delete" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
