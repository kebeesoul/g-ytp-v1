import { jobQueue } from "./jobQueue";
import { runRenderPipeline } from "./runRenderPipeline";

const activeJobIds = new Set<string>();

// 중복 실행 방지 + runRenderPipeline 호출
// API Route에서 void startRenderJob(jobId).catch(...) 형태로 호출
export async function startRenderJob(jobId: string): Promise<void> {
  if (activeJobIds.has(jobId)) {
    console.warn(`[render] startRenderJob: ${jobId} already active, skipping`);
    return;
  }

  activeJobIds.add(jobId);
  jobQueue.set(jobId, {
    id: jobId,
    project_id: "",
    status: "queued",
    progress: 0,
    eta_sec: null,
    error_msg: null,
    output_path: null,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  });

  try {
    await runRenderPipeline(jobId);
  } finally {
    activeJobIds.delete(jobId);
  }
}
