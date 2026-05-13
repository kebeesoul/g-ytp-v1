import type { Background } from "@/lib/schema";

// v1 기본값 (§4 스키마 슬롯 확보, UI 미노출)
// v1.5+에서 UI 옵션 추가 시 이 값들을 변경
export const BG_DEFAULTS = {
  fit: "cover" as const,
  dim: 0.25,
  blur: 0,
  cropPosition: "center" as const,
};

export function applyBgDefaults(
  partial: Pick<Background, "kind" | "storagePath"> & { durationSec?: number }
): Background {
  return {
    ...BG_DEFAULTS,
    ...partial,
  };
}
