import type { ProjectSnapshot } from "@/lib/schema";

// Returns null if snapshot is renderable, or an error string describing why not.
export function validateRenderableSnapshot(snapshot: ProjectSnapshot): string | null {
  if (snapshot.tracks.length === 0) return "at least one track is required";
  if (!snapshot.background) return "background is required";
  return null;
}
