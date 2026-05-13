// render-status API가 DB 없이 빠르게 응답하기 위한 보조 캐시
// DB의 render_jobs가 상태의 원천 (§11.1)
export interface InMemoryJob {
  id: string;
  project_id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  eta_sec: number | null;
  error_msg: string | null;
  output_path: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export const jobQueue = new Map<string, InMemoryJob>();
