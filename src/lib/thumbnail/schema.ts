import { z } from "zod";

export const ThumbnailSettingsSchema = z.object({
  fontId: z.enum([
    "playfairdisplay",
    "ebgaramond",
    "inter",
    "leaguegothic",
    "librebaskerville",
    "spacemono",
    "youngserif",
    "raleway",
    "oswald",
    "archivoblack",
    "roboto",
    "spacegrotesk",
    "bodonimoda",
    "geometricclean",
    "thinelegant",
  ]),
  overlayId: z.enum(["none", "vignette", "dim", "grayscale"]),
  positionId: z.enum(["top", "center", "bottom"]),
  colorId: z.enum(["white", "cream", "black", "gold", "rose"]),
  text: z.string().min(1).max(20),
  textCaseId: z.enum(["upper", "title", "lower"]),
  textSizePx: z.number().int().min(50).max(280),
  letterSpacingPx: z.number().int().min(-20).max(80),
});
export type ThumbnailSettings = z.infer<typeof ThumbnailSettingsSchema>;

export const ThumbnailPresetSchema = z.object({
  id: z.string().uuid(),
  slotIndex: z.number().int().min(0).max(5),
  name: z.string().min(1).max(30),
  settings: ThumbnailSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ThumbnailPreset = z.infer<typeof ThumbnailPresetSchema>;

export const UpsertPresetBodySchema = z.object({
  slotIndex: z.number().int().min(0).max(5),
  name: z.string().min(1).max(30),
  settings: ThumbnailSettingsSchema,
});

export const DeletePresetBodySchema = z.object({
  slotIndex: z.number().int().min(0).max(5),
});

export const RenamePresetBodySchema = z.object({
  slotIndex: z.number().int().min(0).max(5),
  name: z.string().min(1).max(30),
});

export const ThumbnailPresetRowSchema = z.object({
  id: z.string().uuid(),
  slot_index: z.number().int().min(0).max(5),
  name: z.string().min(1).max(30),
  font_id: z.string(),
  overlay_id: z.string(),
  position_id: ThumbnailSettingsSchema.shape.positionId,
  color_id: z.string(),
  text: ThumbnailSettingsSchema.shape.text,
  text_case_id: ThumbnailSettingsSchema.shape.textCaseId.optional().default("upper"),
  text_size_px: ThumbnailSettingsSchema.shape.textSizePx,
  letter_spacing_px: ThumbnailSettingsSchema.shape.letterSpacingPx.optional().default(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ThumbnailPresetRow = z.infer<typeof ThumbnailPresetRowSchema>;

function normalizeFontId(fontId: string): ThumbnailSettings["fontId"] {
  if (fontId === "josefin") return "geometricclean";
  if (fontId === "cormorant") return "thinelegant";
  const parsed = ThumbnailSettingsSchema.shape.fontId.safeParse(fontId);
  return parsed.success ? parsed.data : "playfairdisplay";
}

function normalizeOverlayId(overlayId: string): ThumbnailSettings["overlayId"] {
  if (overlayId === "bottom" || overlayId === "top") return "none";
  const parsed = ThumbnailSettingsSchema.shape.overlayId.safeParse(overlayId);
  return parsed.success ? parsed.data : "none";
}

function normalizeColorId(colorId: string): ThumbnailSettings["colorId"] {
  const parsed = ThumbnailSettingsSchema.shape.colorId.safeParse(colorId);
  return parsed.success ? parsed.data : "white";
}

export function rowToThumbnailPreset(row: unknown): ThumbnailPreset {
  const parsed = ThumbnailPresetRowSchema.parse(row);
  return ThumbnailPresetSchema.parse({
    id: parsed.id,
    slotIndex: parsed.slot_index,
    name: parsed.name,
    settings: {
      fontId: normalizeFontId(parsed.font_id),
      overlayId: normalizeOverlayId(parsed.overlay_id),
      positionId: parsed.position_id,
      colorId: normalizeColorId(parsed.color_id),
      text: parsed.text,
      textCaseId: parsed.text_case_id,
      textSizePx: parsed.text_size_px,
      letterSpacingPx: parsed.letter_spacing_px,
    },
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  });
}
