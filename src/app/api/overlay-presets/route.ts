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

  const result = z.array(PresetRowSchema).safeParse(data);
  if (!result.success) {
    return Response.json({ error: "preset schema mismatch" }, { status: 500 });
  }
  const presets = result.data.map(rowToPreset);
  return Response.json(presets);
}
