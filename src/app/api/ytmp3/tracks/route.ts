import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { YtmpTrackSchema } from "@/lib/ytmp3/schema";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const { data, error } = await supabaseServer
    .from("ytmp3_tracks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const tracks = z.array(YtmpTrackSchema).safeParse(data ?? []);
  if (!tracks.success) {
    return Response.json({ error: "schema validation failed" }, { status: 500 });
  }

  return Response.json(tracks.data);
}
