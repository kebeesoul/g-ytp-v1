import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSnapshot } from "@/lib/schema";
import { prepareRenderVideoAssets, renderVideo } from "./renderVideo";
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
});
