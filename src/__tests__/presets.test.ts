import { describe, it, expect } from "vitest";
import { rowToPreset, presetToRow } from "@/lib/presets";

const SAMPLE_ROW = {
  id: "slot-1",
  slot_index: 1,
  name: "박스형",
  version: 1,
  renderer: "drawtext",
  anchor: "bottom-left",
  offset_x: 80,
  offset_y: -160,
  safe_margin_x: 96,
  safe_margin_y: 72,
  artist_font_family: "AppleSDGothicNeo",
  artist_font_size: 32,
  artist_weight: 500,
  title_font_family: "AppleSDGothicNeo",
  title_font_size: 42,
  title_weight: 700,
  text_align: "left",
  line_height: 1.15,
  letter_spacing: 0,
  max_lines_title: 2,
  color_artist: "#FFFFFF",
  color_title: "#FFFFFF",
  color_bg: null,
  color_shadow: null,
  card_enabled: false,
  card_padding_x: 32,
  card_padding_y: 24,
  card_radius: 24,
  card_blur: 0,
  card_opacity: 1.0,
  fade_in_sec: 0.3,
  fade_out_sec: 0.5,
  anim_memo: "페이드인 0.3초",
  updated_at: "2026-05-17T00:00:00Z",
};

describe("rowToPreset", () => {
  it("maps all fields correctly", () => {
    const preset = rowToPreset(SAMPLE_ROW);
    expect(preset).not.toBeNull();
    if (!preset) return;
    expect(preset.id).toBe("slot-1");
    expect(preset.layout.anchor).toBe("bottom-left");
    expect(preset.layout.x).toBe(80);
    expect(preset.layout.y).toBe(160);
    expect(preset.typography.artistFontSize).toBe(32);
    expect(preset.typography.titleFontSize).toBe(42);
    expect(preset.card.enabled).toBe(false);
    expect(preset.animation.fadeInSec).toBe(0.3);
    expect(preset.animation.animMemo).toBe("페이드인 0.3초");
  });

  it("handles null optional fields", () => {
    const preset = rowToPreset({ ...SAMPLE_ROW, color_bg: null, color_shadow: null, anim_memo: null });
    expect(preset).not.toBeNull();
    if (!preset) return;
    expect(preset.color.background).toBeUndefined();
    expect(preset.color.shadow).toBeUndefined();
    expect(preset.animation.animMemo).toBeUndefined();
  });

  it("returns null for invalid renderer", () => {
    const preset = rowToPreset({ ...SAMPLE_ROW, renderer: "invalid" });
    expect(preset).toBeNull();
  });
});

describe("presetToRow", () => {
  it("round-trips through rowToPreset → presetToRow", () => {
    const preset = rowToPreset(SAMPLE_ROW);
    expect(preset).not.toBeNull();
    const row = presetToRow(preset!, 1, "박스형");
    expect(row.id).toBe("slot-1");
    expect(row.offset_x).toBe(80);
    expect(row.title_font_size).toBe(42);
    expect(row.card_enabled).toBe(false);
    expect(row.anim_memo).toBe("페이드인 0.3초");
  });
});
