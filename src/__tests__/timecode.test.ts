import { describe, it, expect } from "vitest";
import { computeTrackTimings, secondsToTimecode } from "@/lib/timecode";
import type { Track, TransitionConfig } from "@/lib/schema";

function makeTrack(id: string, durationSec: number, order: number): Track {
  return {
    id,
    filename: `${id}.mp3`,
    storagePath: `import/test/${id}.mp3`,
    artist: "Artist",
    title: "Title",
    durationSec,
    order,
  };
}

const T3 = [
  makeTrack("a", 180, 0),
  makeTrack("b", 240, 1),
  makeTrack("c", 200, 2),
];

const T10 = Array.from({ length: 10 }, (_, i) =>
  makeTrack(`t${i}`, 180 + i * 10, i)
);

const T30 = Array.from({ length: 30 }, (_, i) =>
  makeTrack(`t${i}`, 180 + i * 5, i)
);

// ─── silence ─────────────────────────────────────────────────────────────────

describe("silence transition", () => {
  it("3 tracks: cursors are additive", () => {
    const tr: TransitionConfig = { type: "silence", crossfadeSec: 2 };
    const timings = computeTrackTimings(T3, tr);
    expect(timings[0]).toEqual({ trackId: "a", startSec: 0, endSec: 180 });
    expect(timings[1]).toEqual({ trackId: "b", startSec: 180, endSec: 420 });
    expect(timings[2]).toEqual({ trackId: "c", startSec: 420, endSec: 620 });
  });

  it("10 tracks: first and last correct", () => {
    const tr: TransitionConfig = { type: "silence", crossfadeSec: 2 };
    const timings = computeTrackTimings(T10, tr);
    expect(timings[0].startSec).toBe(0);
    const totalDuration = T10.reduce((s, t) => s + t.durationSec, 0);
    expect(timings[9].endSec).toBe(totalDuration);
  });

  it("30 tracks: total equals sum of durations", () => {
    const tr: TransitionConfig = { type: "silence", crossfadeSec: 2 };
    const timings = computeTrackTimings(T30, tr);
    const totalDuration = T30.reduce((s, t) => s + t.durationSec, 0);
    expect(timings[29].endSec).toBe(totalDuration);
  });
});

// ─── crossfade ───────────────────────────────────────────────────────────────

describe("crossfade transition", () => {
  it.each([1, 2, 4])("3 tracks / crossfade %ds: cursors overlap correctly", (sec) => {
    const tr: TransitionConfig = { type: "crossfade", crossfadeSec: sec };
    const timings = computeTrackTimings(T3, tr);
    expect(timings[0].startSec).toBe(0);
    expect(timings[1].startSec).toBe(T3[0].durationSec - sec);
    expect(timings[2].startSec).toBe(
      T3[0].durationSec - sec + T3[1].durationSec - sec
    );
  });

  it.each([1, 2, 4])("10 tracks / crossfade %ds: each startSec = prev.startSec + duration - crossfadeSec", (sec) => {
    const tr: TransitionConfig = { type: "crossfade", crossfadeSec: sec };
    const timings = computeTrackTimings(T10, tr);
    for (let i = 1; i < timings.length; i++) {
      const expected = timings[i - 1].startSec + T10[i - 1].durationSec - sec;
      expect(timings[i].startSec).toBeCloseTo(expected, 6);
    }
  });

  it.each([1, 2, 4])("30 tracks / crossfade %ds: returns 30 entries", (sec) => {
    const tr: TransitionConfig = { type: "crossfade", crossfadeSec: sec };
    const timings = computeTrackTimings(T30, tr);
    expect(timings).toHaveLength(30);
  });

  it("last track endSec is not trimmed by crossfade", () => {
    const tr: TransitionConfig = { type: "crossfade", crossfadeSec: 2 };
    const timings = computeTrackTimings(T3, tr);
    const last = timings[timings.length - 1];
    const lastTrack = T3[T3.length - 1];
    expect(last.endSec - last.startSec).toBe(lastTrack.durationSec);
  });
});

// ─── secondsToTimecode ───────────────────────────────────────────────────────

describe("secondsToTimecode", () => {
  it("zero seconds", () => expect(secondsToTimecode(0)).toBe("00:00"));
  it("59 seconds", () => expect(secondsToTimecode(59)).toBe("00:59"));
  it("1 minute", () => expect(secondsToTimecode(60)).toBe("01:00"));
  it("1 hour", () => expect(secondsToTimecode(3600)).toBe("1:00:00"));
  it("1h 23m 45s", () => expect(secondsToTimecode(5025)).toBe("1:23:45"));
});
