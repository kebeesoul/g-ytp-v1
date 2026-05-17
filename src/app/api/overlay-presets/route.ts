import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { rowToPreset, PresetRowSchema } from "@/lib/presets";

export async function GET(): Promise<Response> {
  const { data, error } = await supabaseServer
    .from("overlay_presets")
    .select("*")
    .order("slot_index");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = z.array(PresetRowSchema).parse(data);
  const presets = rows.map(rowToPreset);
  return Response.json(presets);
}
