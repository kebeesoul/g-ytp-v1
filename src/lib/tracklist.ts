import type { ProjectSnapshot, Tracklist } from "@/lib/schema";
import { computeTrackTimings, secondsToTimecode } from "@/lib/timecode";

export function computeTracklist(snapshot: ProjectSnapshot): Tracklist {
  const timings = computeTrackTimings(
    snapshot.tracks,
    snapshot.renderConfig.transition
  );

  const lines = snapshot.tracks.map((track, i) => ({
    timecode: secondsToTimecode(timings[i].startSec),
    artist: track.artist,
    title: track.title,
  }));

  const hashtags = snapshot.hashtags.map((h) =>
    h.startsWith("#") ? h : `#${h}`
  );

  return { lines, hashtags };
}

export function formatTracklistText(tracklist: Tracklist): string {
  const body = tracklist.lines
    .map((l) => `${l.timecode} ${l.artist} - ${l.title}`)
    .join("\n");
  const hashtagLine =
    tracklist.hashtags.length > 0 ? "\n\n" + tracklist.hashtags.join(" ") : "";
  return body + hashtagLine;
}

export function generateTracklistText(snapshot: ProjectSnapshot): string {
  return formatTracklistText(computeTracklist(snapshot));
}
