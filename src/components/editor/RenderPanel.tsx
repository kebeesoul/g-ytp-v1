"use client";

import { useRenderJob } from "@/lib/useRenderJob";
import type { ProjectSnapshot } from "@/lib/schema";
import { FIXED_MASTERING_SETTINGS } from "@/lib/mastering/constants";

interface RenderPanelProps {
  exportId: string;  // = editorSessionId at click time
  buildSnapshot: () => ProjectSnapshot | { error: string };
  mastering: boolean;
  onMasteringChange: (v: boolean) => void;
  playlistRepeatCount: number;
  onPlaylistRepeatCountChange: (v: number) => void;
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
  mastering,
  onMasteringChange,
  playlistRepeatCount,
  onPlaylistRepeatCountChange,
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
    <div className="flex min-h-[320px] flex-1 flex-col gap-3">
      {/* Mastering 옵션 */}
      <label className="vm-panel vm-panel-pad flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={mastering}
          onChange={(e) => onMasteringChange(e.target.checked)}
          disabled={isRunning}
          className="mt-0.5 h-4 w-4 rounded border-[var(--vm-border)] bg-[#080808] accent-[var(--vm-cyan)]"
        />
        <div className="flex flex-col gap-0.5">
          <span className="vm-label">Target Loudness</span>
          <span className="text-xl font-semibold tracking-[0.08em] text-[var(--vm-amber)]">
            {FIXED_MASTERING_SETTINGS.TARGET_LOUDNESS.toFixed(0)} LUFS
          </span>
          <span className="text-[11px] leading-5 text-[var(--vm-muted)]">
            Ceiling {FIXED_MASTERING_SETTINGS.OUTPUT_CEILING.toFixed(1)} dBTP · Width{" "}
            {FIXED_MASTERING_SETTINGS.STEREO_WIDTH.toFixed(2)}x
          </span>
        </div>
      </label>

      <div className="vm-panel vm-panel-pad flex flex-col gap-2">
        <span className="vm-label">Playlist Repeat</span>
        <select
          value={playlistRepeatCount}
          onChange={(e) => onPlaylistRepeatCountChange(Number(e.target.value))}
          disabled={isRunning}
          className="vm-input"
        >
          {[1, 2, 3, 4, 5].map((count) => (
            <option key={count} value={count}>
              {count}회 반복
            </option>
          ))}
        </select>
        <span className="text-[11px] leading-5 text-[var(--vm-muted)]">
          전체 플레이리스트 길이를 선택한 횟수만큼 반복합니다.
        </span>
      </div>

      {/* Export / 중지 버튼 */}
      <div className="flex flex-col gap-2">
        <button
          onClick={handleExport}
          disabled={submitting || isRunning || cancelling}
          className="vm-button-primary w-full disabled:opacity-40"
        >
          RENDERING
        </button>

        {isRunning && (
          <button
            onClick={() => void cancelRender()}
            disabled={cancelling}
            className="vm-button-secondary vm-button-danger disabled:opacity-40"
          >
            {cancelling ? "Cancelling" : "Stop"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-[var(--vm-error)]">{error}</p>}

      {/* 진행률 */}
      {isRunning && status && (
        <div className="flex flex-col gap-1">
          <div className="h-1 w-full overflow-hidden bg-[#202020]">
            <div
              className="h-full bg-[var(--vm-cyan)] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-[var(--vm-subtle)]">
            <span>{progressPct}%</span>
            <span>{formatEta(status.eta_sec)}</span>
          </div>
        </div>
      )}

      {/* 다운로드 (현재 세션 한정) */}
      {isDone && jobId && (
        <a
          href={`/api/download/${jobId}`}
          className="vm-button-secondary inline-flex items-center justify-center text-[var(--vm-cyan)]"
        >
          Download
        </a>
      )}

      {isDone && (
        <div className="vm-panel mt-auto border-[var(--vm-cyan)] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--vm-cyan)]">
          Export complete
        </div>
      )}

      {/* 에러 */}
      {isError && status?.error_msg && (
        <div className="border border-[#5a2a2a] bg-[#120707] px-3 py-2 text-xs text-[var(--vm-error)]">
          렌더 실패: {status.error_msg}
        </div>
      )}
    </div>
  );
}
