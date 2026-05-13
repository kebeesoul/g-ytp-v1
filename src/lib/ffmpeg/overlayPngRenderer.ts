import type { Track, OverlayPreset } from "@/lib/schema";
import type { OverlayTiming } from "./overlayCompiler";

// v1.5에서 구현 예정 — v1은 drawtext renderer만 사용
export function compilePngCardFilters(
  _track: Track,
  _timing: Extract<OverlayTiming, { skip: false }>,
  _preset: OverlayPreset
): string[] {
  throw new Error("png_card renderer not implemented in v1");
}
