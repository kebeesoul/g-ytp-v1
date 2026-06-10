import { describe, expect, it, vi } from "vitest";
import { generatePngCards, type PngCardSpec } from "@/lib/ffmpeg/overlayPngRenderer";
import { resolveOverlayPreset } from "@/lib/design/presetRegistry";
import { runFfmpeg } from "@/lib/ffmpeg/runFfmpeg";

vi.mock("@/lib/ffmpeg/runFfmpeg", () => ({
  runFfmpeg: vi.fn().mockResolvedValue(undefined),
}));

describe("generatePngCards", () => {
  it("starts cards from a transparent RGBA source instead of opaque black", async () => {
    const spec: PngCardSpec = {
      localPath: "/tmp/card.png",
      track: {
        id: "track-1",
        filename: "track.mp3",
        storagePath: "import/test/track.mp3",
        artist: "Artist",
        title: "Title",
        durationSec: 30,
        order: 0,
      },
      tStart: 1,
      tEnd: 6,
      fadeOut: true,
    };

    await generatePngCards([spec], resolveOverlayPreset("default", 1));

    const mockedRunFfmpeg = vi.mocked(runFfmpeg);
    const args = mockedRunFfmpeg.mock.calls[0]?.[0].args ?? [];
    expect(args).toContain("nullsrc=s=1920x1080,format=rgba,colorchannelmixer=aa=0");
    expect(args).not.toContain("color=c=black@0.0:s=1920x1080");
    expect(args).toContain("rgba");
  });

  it("renders bottom-center cards from the same anchor used by previews", async () => {
    const spec: PngCardSpec = {
      localPath: "/tmp/card-center.png",
      track: {
        id: "track-2",
        filename: "track.mp3",
        storagePath: "import/test/track.mp3",
        artist: "Artist",
        title: "Title",
        durationSec: 30,
        order: 0,
      },
      tStart: 1,
      tEnd: 6,
      fadeOut: true,
    };
    const preset = {
      ...resolveOverlayPreset("default", 1),
      layout: {
        ...resolveOverlayPreset("default", 1).layout,
        anchor: "bottom-center" as const,
        x: 0,
        y: 205,
      },
    };

    await generatePngCards([spec], preset);

    const args = vi.mocked(runFfmpeg).mock.calls.at(-1)?.[0].args ?? [];
    const filter = args[args.indexOf("-vf") + 1] ?? "";
    expect(filter).toContain(":x=(w-text_w)/2:y=h-205-");
    expect(filter).not.toContain(":x=0:y=205");
  });
});
