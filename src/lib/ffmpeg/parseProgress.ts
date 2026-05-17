// §12.5 — FFmpeg -progress pipe:1 출력 파싱
// out_time_ms 필드는 실제로 마이크로초(μs). 이름이 오해를 유발하는 FFmpeg 버그성 명칭.

export interface ProgressResult {
  progress: number;     // 0~1 (해당 phase 내 비율)
  etaSec: number | null;
}

// FFmpeg -progress 출력 한 블록(key=value 여러 줄) 파싱
export function parseFFmpegProgress(
  chunk: string,
  totalDurationSec: number
): ProgressResult | null {
  const kv: Record<string, string> = {};
  for (const line of chunk.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const k = line.slice(0, eqIdx).trim();
    const v = line.slice(eqIdx + 1).trim();
    if (k) kv[k] = v;
  }

  // out_time_ms는 실제 μs (마이크로초)
  const rawUs = kv["out_time_ms"] ?? kv["out_time_us"];
  if (!rawUs) return null;

  const us = Number(rawUs);
  if (!Number.isFinite(us) || us <= 0) return null;

  const processedSec = us / 1_000_000;
  const progress = Math.min(processedSec / totalDurationSec, 1);
  return { progress, etaSec: null };
}

// phase별 가중치 (§12.5 진행률 범위 기준)
// concatAndNormalize: 0.00 ~ 0.15  (concat+loudnorm 통합 단계)
// video:              0.15 ~ 1.00
export const PHASE_WEIGHT = {
  concatAndNormalize: { start: 0, end: 0.15 },
  renderVideo: { start: 0.15, end: 1.0 },
} as const;

export type Phase = keyof typeof PHASE_WEIGHT;

export function computeGlobalProgress(phase: Phase, phaseProgress: number): number {
  const { start, end } = PHASE_WEIGHT[phase];
  return start + phaseProgress * (end - start);
}

// wall-clock 기반 ETA 계산 (§12.5)
// 렌더 시작 후 10초 이상 경과 + globalProgress > 0.05일 때만 표시
export function computeEtaSec(
  globalProgress: number,
  startTimeMs: number
): number | null {
  const elapsedSec = (Date.now() - startTimeMs) / 1000;
  if (elapsedSec < 10 || globalProgress < 0.05) return null;
  return Math.round(elapsedSec / globalProgress - elapsedSec);
}
