import { NextResponse } from "next/server";
import { RenamePresetBodySchema } from "@/lib/thumbnail/schema";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  const parsed = RenamePresetBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("thumbnail_presets")
    .update({ name: parsed.data.name })
    .eq("slot_index", parsed.data.slotIndex);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
