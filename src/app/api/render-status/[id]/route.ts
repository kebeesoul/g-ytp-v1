import { z } from "zod";
import { RenderJobRecordSchema, type RenderJobRecord } from "@/lib/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";
import { jobQueue } from "@/lib/render/jobQueue";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  await ensureBootCleanup();

  const { id } = await params;
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const jobId = parsed.data;

  // 1순위: in-memory (§11.1)
  const memJob = jobQueue.get(jobId);
  if (memJob) return Response.json(memJob);

  // 2순위: DB
  const { data } = await supabaseServer
    .from("render_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!data) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const verified = RenderJobRecordSchema.safeParse(data);
  if (!verified.success) {
    return Response.json({ error: "invalid record" }, { status: 500 });
  }

  // Layer 2 좀비 감지: DB='running'이지만 in-memory 없음 = 서버 재시작 (§9.2)
  if (verified.data.status === "running") {
    const now = new Date().toISOString();
    await supabaseServer
      .from("render_jobs")
      .update({
        status: "error",
        error_msg: "server restarted during render",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", jobId);

    return Response.json({
      ...verified.data,
      status: "error",
      error_msg: "server restarted during render",
    } satisfies RenderJobRecord);
  }

  return Response.json(verified.data);
}
