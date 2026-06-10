import type { CSSProperties } from "react";
import type { OverlayPreset } from "@/lib/schema";

export const OVERLAY_POSITION_PRESETS = [
  { anchor: "top-center" as const, label: "Top Center", x: 0, y: 100 },
  { anchor: "bottom-center" as const, label: "Bot Center", x: 0, y: 205 },
  { anchor: "bottom-left" as const, label: "Bot Left", x: 96, y: 120 },
  { anchor: "bottom-right" as const, label: "Bot Right", x: -96, y: 120 },
] as const;

type Layout = OverlayPreset["layout"];
type Typography = OverlayPreset["typography"];

export function normalizeOverlayLayout(layout: Layout): Layout {
  return layout.anchor.startsWith("bottom-") && layout.y < 0
    ? { ...layout, y: Math.abs(layout.y) }
    : layout;
}

export function getOverlayCssPosition(
  layout: Layout,
  scale: number
): CSSProperties {
  const normalized = normalizeOverlayLayout(layout);
  const x = normalized.x * scale;
  const y = normalized.y * scale;

  switch (normalized.anchor) {
    case "top-left":
      return { left: x, top: y };
    case "top-center":
      return {
        left: `calc(50% + ${x}px)`,
        top: y,
        transform: "translateX(-50%)",
      };
    case "top-right":
      return { right: -x, top: y };
    case "bottom-left":
      return { left: x, bottom: y };
    case "bottom-center":
      return {
        left: `calc(50% + ${x}px)`,
        bottom: y,
        transform: "translateX(-50%)",
      };
    case "bottom-right":
      return { right: -x, bottom: y };
    case "center":
      return {
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transform: "translate(-50%, -50%)",
      };
  }
}

export function getOverlayDragPosition(
  layout: Layout,
  dx: number,
  dy: number
): Pick<Layout, "x" | "y"> {
  const normalized = normalizeOverlayLayout(layout);
  const x = normalized.anchor.endsWith("-right")
    ? normalized.x - dx
    : normalized.x + dx;
  const y = normalized.anchor.startsWith("bottom-")
    ? normalized.y - dy
    : normalized.y + dy;
  return { x, y };
}

export function getDrawtextPosition(
  layout: Layout,
  typography: Typography,
  row: "artist" | "title"
): { x: string; y: string } {
  const normalized = normalizeOverlayLayout(layout);
  const gap = typography.lineHeight;
  const artistHeight = typography.artistFontSize;
  const titleHeight = typography.titleFontSize;
  const blockHeight = artistHeight + gap + titleHeight;

  let x: string;
  if (normalized.anchor.endsWith("-left")) {
    x = `${normalized.x}`;
  } else if (
    normalized.anchor.endsWith("-center") ||
    normalized.anchor === "center"
  ) {
    x = `(w-text_w)/2${signed(normalized.x)}`;
  } else {
    x = `w-text_w${signed(normalized.x)}`;
  }

  if (normalized.anchor.startsWith("bottom-")) {
    return {
      x,
      y:
        row === "artist"
          ? `h-${normalized.y}-${titleHeight}-${gap}-text_h`
          : `h-${normalized.y}-text_h`,
    };
  }

  const blockTop = normalized.anchor.startsWith("top-")
    ? `${normalized.y}`
    : `(h-${blockHeight})/2${signed(normalized.y)}`;

  return {
    x,
    y:
      row === "artist"
        ? blockTop
        : `${blockTop}+${artistHeight + gap}`,
  };
}

function signed(value: number): string {
  if (value === 0) return "";
  return value > 0 ? `+${value}` : `${value}`;
}
