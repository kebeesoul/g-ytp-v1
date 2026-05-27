import { z } from "zod";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";
import { jobQueue } from "@/lib/render/jobQueue";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  await ensureBootCleanup();

  const { jobId } = await params;
  const parsed = z.string().uuid().safeParse(jobId);
  if (!parsed.success) {
    return Response.json({ error: "invalid jobId" }, { status: 400 });
  }

  // 출력 파일 경로 확인 — in-memory 우선, DB fallback
  let outputPath: string | null = null;
  let projectId: string | null = null;
  const memJob = jobQueue.get(parsed.data);
  if (memJob?.output_path) {
    outputPath = memJob.output_path;
    projectId = memJob.project_id;
  } else {
    const { data } = await supabaseServer
      .from("render_jobs")
      .select("output_path, status, project_id")
      .eq("id", parsed.data)
      .single();
    if (!data) {
      return Response.json({ error: "job not found" }, { status: 404 });
    }
    if (data.status !== "done") {
      return Response.json({ error: "render not complete" }, { status: 409 });
    }
    outputPath = data.output_path as string | null;
    projectId = data.project_id as string | null;
  }

  if (!outputPath) {
    return Response.json({ error: "output path not available" }, { status: 404 });
  }

  // 파일 존재 확인
  let fileSize: number;
  try {
    const info = await stat(outputPath);
    fileSize = info.size;
  } catch {
    return Response.json(
      { error: "output file not found (may have been cleaned up — re-export needed)" },
      { status: 404 }
    );
  }

  const ext = outputPath.endsWith(".mov") ? "mov" : "mp4";
  const contentType = ext === "mov" ? "video/quicktime" : "video/mp4";

  // 파일명: projects 테이블에서 title 조회 (project_id는 위 쿼리에서 이미 획득)
  let filename = `output.${ext}`;
  if (projectId) {
    const { data: project } = await supabaseServer
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .single();
    if (project?.title) {
      filename = `${(project.title as string).replace(/[/\\?%*:|"<>]/g, "_")}.${ext}`;
    }
  }

  const fileStream = createReadStream(outputPath);
  const readable = new ReadableStream({
    start(controller) {
      fileStream.on("data", (chunk) =>
        controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
      );
      fileStream.on("end", () => controller.close());
      fileStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      fileStream.destroy();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": fileSize.toString(),
      "Cache-Control": "no-store",
    },
  });
}
