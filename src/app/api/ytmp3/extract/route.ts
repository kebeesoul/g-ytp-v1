import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { YtmpExtractRequestSchema, detectYtmpUrlType } from "@/lib/ytmp3/schema";
import { waitUntilRenderIdle } from "@/lib/ytmp3/extractGate";
import { extractYtmp3Entries, listYtmp3SourceEntries } from "@/lib/ytmp3/ytdlp";

export const runtime = "nodejs";

const InsertedJobSchema = z.object({
  id: z.string().uuid(),
});

async function updateJobError(jobId: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : "ytmp3 extraction failed";
  await supabaseServer
    .from("ytmp3_jobs")
    .update({ status: "error", error_msg: msg, completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function runYtmp3Job(jobId: string, url: string): Promise<void> {
  try {
    await waitUntilRenderIdle();
    await supabaseServer
      .from("ytmp3_jobs")
      .update({ status: "extracting" })
      .eq("id", jobId);

    const listed = await listYtmp3SourceEntries(url);
    await supabaseServer
      .from("ytmp3_jobs")
      .update({ total_count: listed.entries.length })
      .eq("id", jobId);

    const tracks = await extractYtmp3Entries(listed.entries);
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const { error: insertError } = await supabaseServer
        .from("ytmp3_tracks")
        .insert({
          id: track.id,
          job_id: jobId,
          youtube_id: track.youtubeId,
          artist: track.artist,
          title: track.title,
          duration_sec: track.durationSec ?? null,
          local_path: track.localPath,
        });
      if (insertError) throw new Error(insertError.message);

      await supabaseServer
        .from("ytmp3_jobs")
        .update({ done_count: i + 1 })
        .eq("id", jobId);
    }

    await supabaseServer
      .from("ytmp3_jobs")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch (err) {
    await updateJobError(jobId, err);
  }
}

export async function POST(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  const parsed = YtmpExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const urlType = detectYtmpUrlType(parsed.data.url);
  const { data, error } = await supabaseServer
    .from("ytmp3_jobs")
    .insert({
      source_url: parsed.data.url,
      url_type: urlType,
      status: "waiting",
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const job = InsertedJobSchema.safeParse(data);
  if (!job.success) {
    return Response.json({ error: "schema validation failed" }, { status: 500 });
  }

  // Extract only audio that the operator has rights to use.
  void runYtmp3Job(job.data.id, parsed.data.url);
  return Response.json({ jobId: job.data.id });
}
