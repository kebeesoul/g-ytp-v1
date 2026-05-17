import type { Track, OverlayPreset } from "@/lib/schema";
import { compileDrawtextFilters } from "./overlayDrawtextRenderer";

export type OverlayTiming =
  | { skip: true }
  | { skip: false; tStart: number; tEnd: number; fadeOut: boolean };

// §12.4 — 4가지 표시 모드별 타이밍 계산
export function resolveOverlayTimings(
  trackStartSec: number,
  trackDurationSec: number,
  mode: "0" | "2" | "5" | "full"
): OverlayTiming {
  if (mode === "0") return { skip: true };

  if (mode === "full") {
    const tStart = trackStartSec + 1;
    const tEnd = trackStartSec + trackDurationSec - 5;
    // 트랙 7초 미만 → 5초 모드 fallback (§15)
    if (tEnd <= tStart + 1) {
      return { skip: false, tStart, tEnd: tStart + 5, fadeOut: true };
    }
    return { skip: false, tStart, tEnd, fadeOut: true };
  }

  // mode "2" | "5"
  const tStart = trackStartSec + 1;
  const tEnd = tStart + Number(mode);
  return { skip: false, tStart, tEnd, fadeOut: true };
}

export interface OverlayFilterEntry {
  trackIndex: number;
  filters: string[];  // 이 트랙에 대한 drawtext 필터 목록
}

// tracks + timings + preset → drawtext/png_card 필터 배열
export function compileOverlayFilters(
  tracks: Track[],
  trackStartSecs: number[],  // computeTrackTimings 결과에서 추출
  mode: "0" | "2" | "5" | "full",
  preset: OverlayPreset
): string[] {
  const allFilters: string[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const startSec = trackStartSecs[i];
    const timing = resolveOverlayTimings(startSec, track.durationSec, mode);

    if (timing.skip) continue;

    if (preset.renderer === "drawtext") {
      const filters = compileDrawtextFilters(track, timing, preset);
      allFilters.push(...filters);
    } else if (preset.renderer === "png_card") {
      // png_card overlays must go through generatePngCards path in renderVideo —
      // compileOverlayFilters should never be reached for this renderer + non-0 mode.
      throw new Error("compileOverlayFilters: png_card renderer is not supported here");
    } else {
      throw new Error(`unknown renderer: ${(preset as { renderer: string }).renderer}`);
    }
  }

  return allFilters;
}
