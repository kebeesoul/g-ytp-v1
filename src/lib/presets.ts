import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";

export type PresetRow = {
  id: string;
  slot_index: number;
  name: string;
  version: number;
  renderer: string;
  anchor: string;
  offset_x: number;
  offset_y: number;
  safe_margin_x: number;
  safe_margin_y: number;
  artist_font_family: string;
  artist_font_size: number;
  artist_weight: number;
  title_font_family: string;
  title_font_size: number;
  title_weight: number;
  text_align: string;
  line_height: number;
  letter_spacing: number;
  max_lines_title: number;
  color_artist: string;
  color_title: string;
  color_bg: string | null;
  color_shadow: string | null;
  card_enabled: boolean;
  card_padding_x: number;
  card_padding_y: number;
  card_radius: number;
  card_blur: number;
  card_opacity: number;
  fade_in_sec: number;
  fade_out_sec: number;
  anim_memo: string | null;
  updated_at: string;
};

export function rowToPreset(row: PresetRow): OverlayPreset {
  return OverlayPresetSchema.parse({
    id: row.id,
    version: row.version,
    renderer: row.renderer,
    layout: {
      anchor: row.anchor,
      x: row.offset_x,
      y: row.offset_y,
      safeMarginX: row.safe_margin_x,
      safeMarginY: row.safe_margin_y,
    },
    typography: {
      artistFontFamily: row.artist_font_family,
      titleFontFamily: row.title_font_family,
      artistFontSize: row.artist_font_size,
      titleFontSize: row.title_font_size,
      artistWeight: row.artist_weight,
      titleWeight: row.title_weight,
      letterSpacing: row.letter_spacing,
      lineHeight: row.line_height,
      maxLinesTitle: row.max_lines_title,
      textAlign: row.text_align,
    },
    color: {
      artist: row.color_artist,
      title: row.color_title,
      background: row.color_bg ?? undefined,
      shadow: row.color_shadow ?? undefined,
    },
    card: {
      enabled: row.card_enabled,
      paddingX: row.card_padding_x,
      paddingY: row.card_padding_y,
      radius: row.card_radius,
      blur: row.card_blur,
      opacity: row.card_opacity,
    },
    animation: {
      fadeInSec: row.fade_in_sec,
      fadeOutSec: row.fade_out_sec,
      animMemo: row.anim_memo ?? undefined,
    },
  });
}

export function presetToRow(
  preset: OverlayPreset,
  slotIndex: number,
  name: string
): Omit<PresetRow, "updated_at"> {
  return {
    id: preset.id,
    slot_index: slotIndex,
    name,
    version: preset.version + 1,
    renderer: preset.renderer,
    anchor: preset.layout.anchor,
    offset_x: preset.layout.x,
    offset_y: preset.layout.y,
    safe_margin_x: preset.layout.safeMarginX,
    safe_margin_y: preset.layout.safeMarginY,
    artist_font_family: preset.typography.artistFontFamily,
    artist_font_size: preset.typography.artistFontSize,
    artist_weight: preset.typography.artistWeight,
    title_font_family: preset.typography.titleFontFamily,
    title_font_size: preset.typography.titleFontSize,
    title_weight: preset.typography.titleWeight,
    text_align: preset.typography.textAlign,
    line_height: preset.typography.lineHeight,
    letter_spacing: preset.typography.letterSpacing,
    max_lines_title: preset.typography.maxLinesTitle,
    color_artist: preset.color.artist,
    color_title: preset.color.title,
    color_bg: preset.color.background ?? null,
    color_shadow: preset.color.shadow ?? null,
    card_enabled: preset.card.enabled,
    card_padding_x: preset.card.paddingX,
    card_padding_y: preset.card.paddingY,
    card_radius: preset.card.radius,
    card_blur: preset.card.blur,
    card_opacity: preset.card.opacity,
    fade_in_sec: preset.animation.fadeInSec,
    fade_out_sec: preset.animation.fadeOutSec,
    anim_memo: preset.animation.animMemo ?? null,
  };
}
