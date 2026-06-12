import type { ProjectSnapshot } from "@/lib/schema";
import { computeTracklist } from "@/lib/tracklist";

const MAX_TAGS_CHARS = 500;

export type YouTubeMetadata = {
  title: string;
  description: string;
  tags: string[];
};

export function buildYouTubeMetadata(snapshot: ProjectSnapshot): YouTubeMetadata {
  const tracklist = computeTracklist(snapshot);
  const tracklistText = tracklist.lines
    .map((line) => `${line.timecode} ${line.artist} - ${line.title}`)
    .join("\n");
  const hashtags = tracklist.hashtags.join(" ");
  const tags: string[] = [];
  let total = 0;

  for (const rawTag of snapshot.hashtags) {
    const tag = rawTag.replace(/^#/, "").trim();
    if (!tag) continue;
    const nextTotal = total + tag.length;
    if (nextTotal > MAX_TAGS_CHARS) break;
    tags.push(tag);
    total = nextTotal;
  }

  return {
    title: snapshot.title,
    description: hashtags ? `${tracklistText}\n\n${hashtags}` : tracklistText,
    tags,
  };
}
