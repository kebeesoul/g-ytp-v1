import { describe, it, expect } from "vitest";
import {
  parseFFmpegProgress,
  computeGlobalProgress,
  computeEtaSec,
  PHASE_WEIGHT,
} from "@/lib/ffmpeg/parseProgress";

describe("parseFFmpegProgress", () => {
  it("returns null for empty chunk", () => {
    expect(parseFFmpegProgress("", 100)).toBeNull();
  });

  it("parses out_time_ms as microseconds", () => {
    // 4,000,000 μs = 4.0 s, totalDuration=100s → progress=0.04
    const chunk = "out_time_ms=4000000\nframe=120\n";
    const r = parseFFmpegProgress(chunk, 100);
    expect(r).not.toBeNull();
    expect(r!.progress).toBeCloseTo(0.04, 5);
  });

  it("caps progress at 1.0", () => {
    const chunk = "out_time_ms=200000000\n";  // 200s for 100s total
    const r = parseFFmpegProgress(chunk, 100);
    expect(r!.progress).toBe(1);
  });

  it("returns null for zero out_time_ms", () => {
    const chunk = "out_time_ms=0\n";
    expect(parseFFmpegProgress(chunk, 100)).toBeNull();
  });

  it("uses out_time_us if out_time_ms absent", () => {
    const chunk = "out_time_us=2000000\n";
    const r = parseFFmpegProgress(chunk, 100);
    expect(r!.progress).toBeCloseTo(0.02, 5);
  });

  it("mid-progress", () => {
    const chunk = "out_time_ms=50000000\n";  // 50s / 100s = 0.5
    const r = parseFFmpegProgress(chunk, 100);
    expect(r!.progress).toBeCloseTo(0.5, 5);
  });
});

describe("computeGlobalProgress", () => {
  it("concatAndNormalize phase maps 0→0, 1→0.15", () => {
    expect(computeGlobalProgress("concatAndNormalize", 0)).toBeCloseTo(0, 5);
    expect(computeGlobalProgress("concatAndNormalize", 1)).toBeCloseTo(0.15, 5);
    expect(computeGlobalProgress("concatAndNormalize", 0.5)).toBeCloseTo(0.075, 5);
  });

  it("renderVideo phase maps 0→0.15, 1→1.0", () => {
    expect(computeGlobalProgress("renderVideo", 0)).toBeCloseTo(0.15, 5);
    expect(computeGlobalProgress("renderVideo", 1)).toBeCloseTo(1.0, 5);
    expect(computeGlobalProgress("renderVideo", 0.5)).toBeCloseTo(0.575, 5);
  });

  it("phase boundaries are contiguous", () => {
    expect(PHASE_WEIGHT.concatAndNormalize.end).toBe(PHASE_WEIGHT.renderVideo.start);
  });
});

describe("computeEtaSec", () => {
  it("returns null if elapsed < 10s", () => {
    const start = Date.now() - 5000;
    expect(computeEtaSec(0.5, start)).toBeNull();
  });

  it("returns null if progress < 0.05", () => {
    const start = Date.now() - 15000;
    expect(computeEtaSec(0.04, start)).toBeNull();
  });

  it("returns positive number when conditions met", () => {
    const start = Date.now() - 15000;  // 15s elapsed
    const eta = computeEtaSec(0.3, start);  // 30% done → ~35s remaining
    expect(eta).not.toBeNull();
    expect(eta!).toBeGreaterThan(0);
  });
});
