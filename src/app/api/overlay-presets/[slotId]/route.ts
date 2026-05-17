import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { OverlayPresetSchema } from "@/lib/schema";
import { presetToRow, rowToPreset, PresetRowSchema } from "@/lib/presets";

const VALID_SLOT_IDS = new Set(["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"]);

interface RouteParams {
  params: Promise<{ slotId: string }>;
}

const PatchBodySchema = z.object({
  preset: OverlayPresetSchema,
  name: z.string().min(1).max(50),
});

export async function PATCH(req: Request, { params }: RouteParams): Promise<Response> {
  const { slotId } = await params;

  if (!VALID_SLOT_IDS.has(slotId)) {
    return Response.json({ error: "invalid slotId" }, { status: 400 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }

  const { preset, name } = parsed.data;

  const slotIndex = parseInt(slotId.split("-")[1], 10);
  const row = presetToRow({ ...preset, id: slotId }, slotIndex, name);

  const { data, error } = await supabaseServer
    .from("overlay_presets")
    .upsert({ ...row, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rowResult = PresetRowSchema.safeParse(data);
  if (!rowResult.success) {
    return Response.json({ error: "preset schema mismatch after upsert" }, { status: 500 });
  }
  const saved = rowToPreset(rowResult.data);
  if (!saved) {
    return Response.json({ error: "preset mapping failed after upsert" }, { status: 500 });
  }
  return Response.json(saved);
}
