import { NextResponse } from "next/server";
import {
  DeletePresetBodySchema,
  ThumbnailPresetSchema,
  UpsertPresetBodySchema,
  rowToThumbnailPreset,
} from "@/lib/thumbnail/schema";
import { supabaseServer } from "@/lib/supabase/server";
import type { ThumbnailSettings } from "@/lib/thumbnail/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { data, error } = await supabaseServer
    .from("thumbnail_presets")
    .select("*")
    .order("slot_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const presets = ThumbnailPresetSchema.array().parse((data ?? []).map(rowToThumbnailPreset));
  return NextResponse.json(presets);
}

function missingNewPresetColumn(message: string): boolean {
  return message.includes("letter_spacing_px") || message.includes("text_case_id");
}

function presetPayload(
  slotIndex: number,
  name: string,
  settings: ThumbnailSettings
) {
  return {
    slot_index: slotIndex,
    name,
    font_id: settings.fontId,
    overlay_id: settings.overlayId,
    position_id: settings.positionId,
    color_id: settings.colorId,
    text: settings.text,
    text_case_id: settings.textCaseId,
    text_size_px: settings.textSizePx,
    letter_spacing_px: settings.letterSpacingPx,
  };
}

function legacyPresetPayload(
  slotIndex: number,
  name: string,
  settings: ThumbnailSettings
) {
  return {
    slot_index: slotIndex,
    name,
    font_id: settings.fontId,
    overlay_id: settings.overlayId,
    position_id: settings.positionId,
    color_id: settings.colorId,
    text: settings.text,
    text_size_px: settings.textSizePx,
  };
}

export async function POST(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  const parsed = UpsertPresetBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { slotIndex, name, settings } = parsed.data;
  let result = await supabaseServer
    .from("thumbnail_presets")
    .upsert(presetPayload(slotIndex, name, settings), { onConflict: "slot_index" })
    .select()
    .single();

  if (result.error && missingNewPresetColumn(result.error.message)) {
    result = await supabaseServer
      .from("thumbnail_presets")
      .upsert(legacyPresetPayload(slotIndex, name, settings), { onConflict: "slot_index" })
      .select()
      .single();
  }

  const { data, error } = result;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(rowToThumbnailPreset(data));
}

export async function DELETE(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  const parsed = DeletePresetBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("thumbnail_presets")
    .delete()
    .eq("slot_index", parsed.data.slotIndex);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
