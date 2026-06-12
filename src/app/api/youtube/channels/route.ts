import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const ChannelIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const ChannelRowSchema = z.object({
  id: ChannelIdSchema,
  display_name: z.string(),
  token_path: z.string(),
  authorized: z.boolean(),
  created_at: z.string().optional(),
});
const ChannelCreateSchema = z.object({
  id: ChannelIdSchema,
  display_name: z.string().min(1),
});

export async function GET(): Promise<Response> {
  const { data, error } = await supabaseServer
    .from("youtube_channels")
    .select("id, display_name, token_path, authorized, created_at")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const parsed = z.array(ChannelRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    return Response.json({ error: "schema validation failed" }, { status: 500 });
  }
  return Response.json(parsed.data);
}

export async function POST(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  const parsed = ChannelCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const tokenPath = `token_${parsed.data.id}.json`;
  const { data, error } = await supabaseServer
    .from("youtube_channels")
    .upsert({
      id: parsed.data.id,
      display_name: parsed.data.display_name,
      token_path: tokenPath,
    }, { onConflict: "id" })
    .select("id, display_name, token_path, authorized, created_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const channel = ChannelRowSchema.safeParse(data);
  if (!channel.success) {
    return Response.json({ error: "schema validation failed" }, { status: 500 });
  }
  return Response.json(channel.data);
}
