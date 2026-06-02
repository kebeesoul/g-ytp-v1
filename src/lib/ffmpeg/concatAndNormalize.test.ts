import { beforeEach, describe, expect, it, vi } from "vitest";
import { concatAndNormalize } from "./concatAndNormalize";
import { runFfmpeg } from "./runFfmpeg";

vi.mock("./runFfmpeg", () => ({
  runFfmpeg: vi.fn(() => Promise.resolve()),
}));

describe("concatAndNormalize", () => {
  beforeEach(() => {
    vi.mocked(runFfmpeg).mockClear();
  });

  it("uses single-pass loudnorm for ebu_r128", async () => {
    await concatAndNormalize({
      jobId: "job",
      audioPaths: ["/tmp/a.m4a"],
      transition: { type: "silence", crossfadeSec: 2 },
      workDir: "/tmp/work",
      audioConfig: { normalize: "ebu_r128", targetLufs: -14, truePeakDb: -1 },
    });

    expect(runFfmpeg).toHaveBeenCalledTimes(1);
    const args = vi.mocked(runFfmpeg).mock.calls[0]?.[0].args;
    expect(args).toContain("-filter_complex");
    expect(args?.join(" ")).toContain("loudnorm=I=-14:TP=-1:LRA=11:linear=true");
    expect(args).toContain("192k");
  });
});
