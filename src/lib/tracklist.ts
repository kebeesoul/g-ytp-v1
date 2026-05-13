import type { ProjectSnapshot } from "@/lib/schema";
import { computeTrackTimings, secondsToTimecode } from "@/lib/timecode";

export function generateTracklistText(snapshot: ProjectSnapshot): string {
  const timings = computeTrackTimings(
    snapshot.tracks,
    snapshot.renderConfig.transition
  );

  const lines = snapshot.tracks.map((track, i) => {
    const timecode = secondsToTimecode(timings[i].startSec);
    return `${timecode} ${track.artist} - ${track.title}`;
  });

  const hashtagLine =
    snapshot.hashtags.length > 0
      ? "\n" +
        snapshot.hashtags
          .map((h) => (h.startsWith("#") ? h : `#${h}`))
          .join(" ")
      : "";

  return lines.join("\n") + hashtagLine;
}
