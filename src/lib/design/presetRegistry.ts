import type { OverlayPreset } from "@/lib/schema";

const DEFAULT_V1: OverlayPreset = {
  id: "default",
  version: 1,
  renderer: "png_card",
  layout: {
    anchor: "bottom-left",
    x: 80,
    y: 160,
    safeMarginX: 96,
    safeMarginY: 72,
  },
  typography: {
    artistFontFamily: "AppleSDGothicNeo",
    titleFontFamily: "AppleSDGothicNeo",
    artistFontSize: 32,
    titleFontSize: 42,
    artistWeight: 500,
    titleWeight: 700,
    artistItalic: false,
    titleItalic: false,
    artistUnderline: false,
    titleUnderline: false,
    letterSpacing: 0,
    lineHeight: 1.15,
    maxLinesTitle: 2,
    textAlign: "left",
  },
  color: {
    artist: "#FFFFFF",
    title: "#FFFFFF",
  },
  card: {
    enabled: false,
    paddingX: 32,
    paddingY: 24,
    radius: 24,
    blur: 0,
    opacity: 1,
  },
  animation: {
    fadeInSec: 0.3,
    fadeOutSec: 0.5,
  },
};

const REGISTRY: Record<string, Record<number, OverlayPreset>> = {
  default: { 1: DEFAULT_V1 },
};

export function resolveOverlayPreset(id: string, version: number): OverlayPreset {
  const preset = REGISTRY[id]?.[version];
  if (!preset) {
    throw new Error(`Overlay preset not found: ${id} v${version}`);
  }
  return preset;
}

export function registerPreset(preset: OverlayPreset): void {
  if (!REGISTRY[preset.id]) {
    REGISTRY[preset.id] = {};
  }
  REGISTRY[preset.id][preset.version] = preset;
}
