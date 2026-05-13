import { z } from "zod";
import { ProjectSnapshotSchema, TracklistSchema } from "@/lib/schema";
import { computeTracklist } from "@/lib/tracklist";

export async function POST(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  const parsed = z.object({ snapshot: ProjectSnapshotSchema }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const tracklist = computeTracklist(parsed.data.snapshot);
  return Response.json(TracklistSchema.parse(tracklist));
}
