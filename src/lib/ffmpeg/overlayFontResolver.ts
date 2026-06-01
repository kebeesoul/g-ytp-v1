import fs from "node:fs";
import path from "node:path";
import { OVERLAY_FONT_OPTIONS } from "@/lib/overlayFontOptions";
import { FONTS } from "@/lib/thumbnail/constants";

const FALLBACK_FONT_PATH =
  process.env.FONT_PATH_KR ?? "/System/Library/Fonts/AppleSDGothicNeo.ttc";

export function resolveOverlayFontPath(fontFamily: string): string {
  // System / custom font options
  const option = OVERLAY_FONT_OPTIONS.find((font) => font.family === fontFamily);
  if (option && fs.existsSync(option.path)) return option.path;

  // Thumbnail-list fonts: look for files in public/fonts/{id}.{ext}
  const thumbnailFont = FONTS.find((f) => f.name === fontFamily);
  if (thumbnailFont) {
    for (const ext of ["ttf", "otf", "woff2", "woff"]) {
      const p = path.join(process.cwd(), "public", "fonts", `${thumbnailFont.id}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }

  // Font file not found — falling back to system default
  console.warn(`[overlayFontResolver] font not found for "${fontFamily}", falling back to ${FALLBACK_FONT_PATH}`);
  return FALLBACK_FONT_PATH;
}
