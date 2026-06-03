import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectSnapshot } from "@/lib/schema";
import { prepareRenderVideoAssets, renderVideo, repeatRenderedVideo } from "./renderVideo";
import type { PngCardSpec } from "./overlayPngRenderer";
import { runFfmpeg } from "./runFfmpeg";

vi.mock("./runFfmpeg", () => ({
  runFfmpeg: vi.fn(() => Promise.resolve()),
}));

const baseSnapshot: ProjectSnapshot = {
  title: "Test",
  tracks: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      filename: "a.m4a",
      storagePath: "import/session/a.m4a",
      artist: "Artist",
      title: "Title",
      durationSec: 180,
      order: 0,
    },
  ],
  background: {
    kind: "image",
    storagePath: "import/session/bg.jpg",
    processedStoragePath: "import/session/bg_processed.jpg",
    fit: "cover",
    dim: 0,
    blur: 0,
    cropX: 0.5,
    cropY: 0.5,
    cropW: 1,
  },
  renderConfig: {
    transition: { type: "silence", crossfadeSec: 2 },
    overlay: { displayMode: "0", presetId: "default", presetVersion: 1 },
    audio: { normalize: "ebu_r128_fast", targetLufs: -9, truePeakDb: -0.1 },
    thumbnail: { mode: "extract", presetId: "default", presetVersion: 1 },
    waveform: { style: "off" },
    playlistRepeatCount: 1,
    mastering: false,
    audioBitrateKbps: 192,
    resolution: [1920, 1080],
    hwaccel: "videotoolbox",
  },
  hashtags: [],
};

describe("renderVideo", () => {
  beforeEach(() => {
    vi.mocked(runFfmpeg).mockClear();
  });

  it("uses stream copy path for static image background without overlay", async () => {
    await renderVideo({
      jobId: "job",
      bgLocalPath: "/tmp/bg_processed.jpg",
      bgKind: "image",
      bgPreprocessed: true,
      audioLocalPath: "/tmp/concat.m4a",
      outputPath: "/tmp/final.mp4",
      snapshot: baseSnapshot,
      workDir: "/tmp/work",
      startTimeMs: Date.now(),
    });

    expect(runFfmpeg).toHaveBeenCalledTimes(2);
    const finalArgs = vi.mocked(runFfmpeg).mock.calls[1]?.[0].args;
    expect(finalArgs).toContain("-stream_loop");
    expect(finalArgs).toContain("-c:v");
    expect(finalArgs).toContain("copy");
    expect(finalArgs).toContain("-c:a");
  });

  it("prepares static image loop clip before audio-dependent render work", async () => {
    const assets = await prepareRenderVideoAssets({
      jobId: "job",
      bgLocalPath: "/tmp/bg_processed.jpg",
      bgKind: "image",
      bgPreprocessed: true,
      snapshot: baseSnapshot,
      workDir: "/tmp/work",
    });

    expect(assets.bgLoopClipPath).toBe("/tmp/work/bg_loop_1s.mp4");
    expect(assets.filterPlan).toBeUndefined();
    expect(runFfmpeg).toHaveBeenCalledTimes(1);
  });

  it("bakes waveform into the static loop and keeps the final stream-copy path", async () => {
    const snapshot: ProjectSnapshot = {
      ...baseSnapshot,
      renderConfig: {
        ...baseSnapshot.renderConfig,
        waveform: { style: "wave1" },
      },
    };

    await renderVideo({
      jobId: "job",
      bgLocalPath: "/tmp/bg_processed.jpg",
      bgKind: "image",
      bgPreprocessed: true,
      audioLocalPath: "/tmp/concat.m4a",
      outputPath: "/tmp/final.mp4",
      snapshot,
      workDir: "/tmp/work",
      startTimeMs: Date.now(),
    });

    expect(runFfmpeg).toHaveBeenCalledTimes(2);
    const loopArgs = vi.mocked(runFfmpeg).mock.calls[0]?.[0].args;
    const finalArgs = vi.mocked(runFfmpeg).mock.calls[1]?.[0].args;
    expect(loopArgs?.join(" ")).toContain("public/waveforms/wave1.mov");
    expect(finalArgs).toContain("-c:v");
    expect(finalArgs).toContain("copy");
  });

  it("uses segment concat path for short png-card overlay windows", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "gytp-render-test-"));
    const snapshot: ProjectSnapshot = {
      ...baseSnapshot,
      renderConfig: {
        ...baseSnapshot.renderConfig,
        overlay: { displayMode: "5", presetId: "default", presetVersion: 1 },
      },
    };
    const card: PngCardSpec = {
      localPath: join(workDir, "card_0_0.png"),
      track: snapshot.tracks[0],
      tStart: 0,
      tEnd: 5,
      fadeOut: true,
    };

    await renderVideo({
      jobId: "job",
      bgLocalPath: "/tmp/bg_processed.jpg",
      bgKind: "image",
      bgPreprocessed: true,
      audioLocalPath: "/tmp/concat.m4a",
      outputPath: join(workDir, "final.mp4"),
      snapshot,
      workDir,
      startTimeMs: Date.now(),
      pngCardSpecs: [card],
    });

    const calls = vi.mocked(runFfmpeg).mock.calls.map((call) => call[0].args.join(" "));
    expect(calls.some((args) => args.includes("-filter_complex_script"))).toBe(true);
    expect(calls.at(-1)).toContain("-f concat");
    expect(calls.at(-1)).toContain("segments.txt");
  });

  it("expands overlay segments to the keyframe grid while preserving exact overlay timing", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "gytp-render-test-"));
    const snapshot: ProjectSnapshot = {
      ...baseSnapshot,
      renderConfig: {
        ...baseSnapshot.renderConfig,
        overlay: { displayMode: "5", presetId: "default", presetVersion: 1 },
      },
    };
    const card: PngCardSpec = {
      localPath: join(workDir, "card_0_0.png"),
      track: snapshot.tracks[0],
      tStart: 1.2,
      tEnd: 6.3,
      fadeOut: true,
    };

    await renderVideo({
      jobId: "job",
      bgLocalPath: "/tmp/bg_processed.jpg",
      bgKind: "image",
      bgPreprocessed: true,
      audioLocalPath: "/tmp/concat.m4a",
      outputPath: join(workDir, "final.mp4"),
      snapshot,
      workDir,
      startTimeMs: Date.now(),
      pngCardSpecs: [card],
    });

    const calls = vi.mocked(runFfmpeg).mock.calls.map((call) => call[0].args);
    const overlayArgs = calls.find((args) => args.includes("-filter_complex_script"));
    expect(overlayArgs).toContain("1.000");
    expect(overlayArgs).toContain("5.500");

    const filterScript = await readFile(join(workDir, "segment_0001.txt"), "utf8");
    expect(filterScript).toContain("st=0.200");
    expect(filterScript).toContain("lt(t\\,5.300)");
  });

  it("repeats a completed render with stream-copy concat", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "gytp-repeat-test-"));

    await repeatRenderedVideo({
      jobId: "job",
      inputPath: join(workDir, "final_once.mp4"),
      outputPath: join(workDir, "final.mp4"),
      workDir,
      repeatCount: 5,
    });

    expect(runFfmpeg).toHaveBeenCalledTimes(1);
    const args = vi.mocked(runFfmpeg).mock.calls[0]?.[0].args;
    expect(args).toContain("-f");
    expect(args).toContain("concat");
    expect(args).toContain("-c");
    expect(args).toContain("copy");
    expect(args?.join(" ")).toContain("repeat_list.txt");
  });
});
