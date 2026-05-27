"use client";

import { useRenderJob } from "@/lib/useRenderJob";
import type { ProjectSnapshot } from "@/lib/schema";

interface RenderPanelProps {
  exportId: string;  // = editorSessionId at click time
  buildSnapshot: () => ProjectSnapshot | { error: string };
  outputFormat: "mp4" | "mov";
  onOutputFormatChange: (fmt: "mp4" | "mov") => void;
}

function formatEta(sec: number | null): string {
  if (sec === null || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `ETA ${m}:${String(s).padStart(2, "0")}`;
}

export function RenderPanel({
  exportId,
  buildSnapshot,
  outputFormat,
  onOutputFormatChange,
}: RenderPanelProps) {
  const { jobId, status, submitting, cancelling, error, startRender, cancelRender } = useRenderJob();

  const isRunning =
    status?.status === "queued" || status?.status === "running";
  const isDone = status?.status === "done";
  const isError = status?.status === "error";

  async function handleExport(): Promise<void> {
    const built = buildSnapshot();
    if ("error" in built) return; // 부모가 에러 처리 — RenderPanel은 사후 검증만
    await startRender(built, exportId);
  }

  const progressPct = Math.round((status?.progress ?? 0) * 100);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-700 bg-gray-900 p-4">
      {/* 출력 포맷 라디오 (§4 RenderConfig outputFormat: mp4 기본) */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-300">출력 포맷</span>
        <div className="flex gap-4">
          {(["mp4", "mov"] as const).map((fmt) => (
            <label key={fmt} className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="radio"
                name="outputFormat"
                value={fmt}
                checked={outputFormat === fmt}
                onChange={() => onOutputFormatChange(fmt)}
                disabled={isRunning}
              />
              {fmt.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      {/* Export / 중지 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={submitting || isRunning || cancelling}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {submitting ? "요청 중..." : isRunning ? "렌더 중..." : "▶ Export"}
        </button>

        {isRunning && (
          <button
            onClick={() => void cancelRender()}
            disabled={cancelling}
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40"
          >
            {cancelling ? "취소 중..." : "■ 중지"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* 진행률 */}
      {isRunning && status && (
        <div className="flex flex-col gap-1">
          <div className="h-2 w-full overflow-hidden rounded bg-gray-800">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{progressPct}%</span>
            <span>{formatEta(status.eta_sec)}</span>
          </div>
        </div>
      )}

      {/* 완료 메시지 + 다운로드 (현재 세션 한정) */}
      {isDone && jobId && (
        <div className="mt-auto flex flex-col gap-2">
          <p className="text-sm font-medium text-green-400">Export complete</p>
          <a
            href={`/api/download/${jobId}`}
            className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
          >
            ⬇ 다운로드
          </a>
        </div>
      )}

      {/* 에러 */}
      {isError && status?.error_msg && (
        <div className="rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          렌더 실패: {status.error_msg}
        </div>
      )}
    </div>
  );
}
