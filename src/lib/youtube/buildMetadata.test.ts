import { describe, expect, it } from "vitest";
import type { ProjectSnapshot } from "@/lib/schema";
import { buildYouTubeMetadata } from "./buildMetadata";

const snapshot: ProjectSnapshot = {
  title: "Night Drive",
  tracks: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      filename: "a.mp3",
      storagePath: "import/x/a.mp3",
      artist: "Artist",
      title: "Track",
      durationSec: 60,
      order: 0,
    },
  ],
  background: null,
  renderConfig: {
    transition: { type: "silence", crossfadeSec: 2 },
    overlay: { displayMode: "0", presetId: "default", presetVersion: 1 },
    audio: { normalize: "ebu_r128_fast", targetLufs: -9, truePeakDb: -0.1 },
    thumbnail: { mode: "extract", presetId: "default", presetVersion: 1 },
    waveform: { style: "off" },
    playlistRepeatCount: 1,
    mastering: false,
    outputFormat: "mp4",
    audioBitrateKbps: 192,
    resolution: [1920, 1080],
    hwaccel: "videotoolbox",
  },
  hashtags: ["lofi", "#night"],
};

describe("buildYouTubeMetadata", () => {
  it("builds private-upload metadata fields from snapshot", () => {
    const metadata = buildYouTubeMetadata(snapshot);
    expect(metadata.title).toBe("Night Drive");
    expect(metadata.description).toContain("00:00 Artist - Track");
    expect(metadata.description).toContain("#lofi #night");
    expect(metadata.tags).toEqual(["lofi", "night"]);
  });
});
