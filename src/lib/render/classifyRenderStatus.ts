// §9.1 페이지 이탈/복귀 상태 분류 — 순수 함수로 추출하여 테스트 가능
export type RenderStatusClass =
  | "no_ls"        // localStorage 없음 → 새 작업
  | "running"      // status='running' 또는 'queued' → 폴링 재개
  | "done"         // status='done' → 다운로드, LS 정리
  | "error"        // status='error' → 에러 표시, LS 정리
  | "not_found"    // DB 404 → LS 정리
  | "zombie";      // DB='running' + in-memory 없음 → 재시작 감지

export interface RenderStatusResponse {
  status: "queued" | "running" | "done" | "error";
  id: string;
  progress: number;
  eta_sec: number | null;
  error_msg: string | null;
  output_path: string | null;
}

export function classifyRenderStatus(
  hasLocalStorage: boolean,
  httpStatus: number | null,
  body: RenderStatusResponse | null,
  isInMemory: boolean
): RenderStatusClass {
  if (!hasLocalStorage) return "no_ls";
  if (httpStatus === 404) return "not_found";
  if (!body) return "error";

  if ((body.status === "running" || body.status === "queued") && !isInMemory) {
    return "zombie";
  }

  if (body.status === "running" || body.status === "queued") return "running";
  if (body.status === "done") return "done";
  return "error";
}
