import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { runPythonJsonLines } from "@/lib/youtube/python";
import { youtubeAuthDir, youtubeWorkerPath } from "@/lib/youtube/paths";

const ChannelIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const AuthResultSchema = z.object({
  tokenPath: z.string(),
});

type RouteParams = {
  params: Promise<{ channelId: string }>;
};

export async function POST(_req: Request, { params }: RouteParams): Promise<Response> {
  const { channelId } = await params;
  const parsedChannelId = ChannelIdSchema.safeParse(channelId);
  if (!parsedChannelId.success) {
    return Response.json({ error: "invalid channelId" }, { status: 400 });
  }

  const { data: channel, error } = await supabaseServer
    .from("youtube_channels")
    .select("id")
    .eq("id", parsedChannelId.data)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!channel) return Response.json({ error: "channel not found" }, { status: 404 });

  const authDir = youtubeAuthDir();
  await mkdir(authDir, { recursive: true });

  try {
    const result = await runPythonJsonLines({
      scriptPath: youtubeWorkerPath("youtube_auth.py"),
      args: ["--channel-id", parsedChannelId.data, "--auth-dir", authDir],
      resultSchema: AuthResultSchema,
    });

    const { error: updateError } = await supabaseServer
      .from("youtube_channels")
      .update({ authorized: true, token_path: result.tokenPath })
      .eq("id", parsedChannelId.data);
    if (updateError) throw new Error(updateError.message);

    return Response.json({ ok: true, tokenPath: result.tokenPath });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "youtube auth failed" },
      { status: 500 }
    );
  }
}
