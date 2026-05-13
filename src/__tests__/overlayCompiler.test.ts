import { describe, it, expect } from "vitest";
import { resolveOverlayTimings } from "@/lib/ffmpeg/overlayCompiler";

describe("resolveOverlayTimings", () => {
  // mode "0"
  it('mode "0": skip', () => {
    const r = resolveOverlayTimings(0, 180, "0");
    expect(r.skip).toBe(true);
  });

  // mode "2"
  it('mode "2": tStart = trackStart + 1, tEnd = tStart + 2', () => {
    const r = resolveOverlayTimings(60, 180, "2");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      expect(r.tStart).toBe(61);
      expect(r.tEnd).toBe(63);
    }
  });

  it('mode "2" at track start 0', () => {
    const r = resolveOverlayTimings(0, 120, "2");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      expect(r.tStart).toBe(1);
      expect(r.tEnd).toBe(3);
    }
  });

  // mode "5"
  it('mode "5": tStart = trackStart + 1, tEnd = tStart + 5', () => {
    const r = resolveOverlayTimings(100, 200, "5");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      expect(r.tStart).toBe(101);
      expect(r.tEnd).toBe(106);
    }
  });

  // mode "full"
  it('mode "full": tStart = start+1, tEnd = start+duration-5', () => {
    const r = resolveOverlayTimings(0, 180, "full");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      expect(r.tStart).toBe(1);
      expect(r.tEnd).toBe(175);  // 0 + 180 - 5
    }
  });

  it('mode "full" with offset track', () => {
    const r = resolveOverlayTimings(50, 120, "full");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      expect(r.tStart).toBe(51);
      expect(r.tEnd).toBe(165);  // 50 + 120 - 5
    }
  });

  // fallback: 트랙 7초 미만 → 5초 모드
  it('mode "full" short track (<7s): fallback to 5s', () => {
    const r = resolveOverlayTimings(0, 5, "full");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      // tEnd(=0+5-5=0) <= tStart(=1)+1 → fallback
      expect(r.tStart).toBe(1);
      expect(r.tEnd).toBe(6);  // tStart + 5
    }
  });

  it('mode "full" exactly 7s track: fallback to 5s', () => {
    const r = resolveOverlayTimings(0, 7, "full");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      // tEnd = 0 + 7 - 5 = 2, tStart = 1, tEnd(2) <= tStart(1)+1(2) → fallback
      expect(r.tEnd).toBe(6);  // tStart + 5
    }
  });

  it('mode "full" 8s track: no fallback', () => {
    const r = resolveOverlayTimings(0, 8, "full");
    expect(r.skip).toBe(false);
    if (!r.skip) {
      // tEnd = 8 - 5 = 3, tStart = 1, 3 > 1+1=2 → no fallback
      expect(r.tStart).toBe(1);
      expect(r.tEnd).toBe(3);
    }
  });

  // fadeOut
  it("all non-zero modes have fadeOut=true", () => {
    for (const mode of ["2", "5", "full"] as const) {
      const r = resolveOverlayTimings(0, 180, mode);
      expect(r.skip).toBe(false);
      if (!r.skip) expect(r.fadeOut).toBe(true);
    }
  });
});
