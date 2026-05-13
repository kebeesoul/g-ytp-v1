import type { Track, TransitionConfig } from "./schema";

export interface TrackTiming {
  trackId: string;
  startSec: number;
  endSec: number;
}

export function computeTrackTimings(
  tracks: Track[],
  transition: TransitionConfig
): TrackTiming[] {
  const result: TrackTiming[] = [];
  let cursor = 0;

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const startSec = cursor;
    const endSec = cursor + t.durationSec;
    result.push({ trackId: t.id, startSec, endSec });

    if (transition.type === "crossfade" && i < tracks.length - 1) {
      cursor += t.durationSec - transition.crossfadeSec;
    } else {
      cursor += t.durationSec;
    }
  }

  return result;
}

export function secondsToTimecode(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
