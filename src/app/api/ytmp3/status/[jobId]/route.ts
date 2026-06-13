import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { isRenderActive } from "@/lib/ytmp3/extractGate";
import { YtmpJobSchema, YtmpTrackSchema } from "@/lib/ytmp3/schema";

export const runtime = "nodejs";

const ParamsSchema = z.object({
  jobId: z.string().uuid(),
});

type RouteParams = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const parsedParams = ParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return Response.json({ error: "invalid jobId" }, { status: 400 });
  }

  const { data: jobData, error: jobError } = await supabaseServer
    .from("ytmp3_jobs")
    .select("*")
    .eq("id", parsedParams.data.jobId)
    .single();
  if (jobError) return Response.json({ error: jobError.message }, { status: 404 });

  const job = YtmpJobSchema.safeParse(jobData);
  if (!job.success) {
    return Response.json({ error: "job schema validation failed" }, { status: 500 });
  }

  const { data: trackData, error: trackError } = await supabaseServer
    .from("ytmp3_tracks")
    .select("*")
    .eq("job_id", parsedParams.data.jobId)
    .order("created_at", { ascending: true });
  if (trackError) return Response.json({ error: trackError.message }, { status: 500 });

  const tracks = z.array(YtmpTrackSchema).safeParse(trackData ?? []);
  if (!tracks.success) {
    return Response.json({ error: "track schema validation failed" }, { status: 500 });
  }

  const waitingForRender = job.data.status === "waiting" && (await isRenderActive());
  return Response.json({ job: job.data, tracks: tracks.data, waitingForRender });
}
