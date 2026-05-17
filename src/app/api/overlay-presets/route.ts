import { supabaseServer } from "@/lib/supabase/server";
import { rowToPreset, type PresetRow } from "@/lib/presets";

export async function GET(): Promise<Response> {
  const { data, error } = await supabaseServer
    .from("overlay_presets")
    .select("*")
    .order("slot_index");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const presets = (data as PresetRow[]).map(rowToPreset);
  return Response.json(presets);
}
