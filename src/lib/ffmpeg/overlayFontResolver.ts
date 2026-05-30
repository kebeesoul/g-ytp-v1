import fs from "node:fs";
import { OVERLAY_FONT_OPTIONS } from "@/lib/overlayFontOptions";

const FALLBACK_FONT_PATH =
  process.env.FONT_PATH_KR ?? "/System/Library/Fonts/AppleSDGothicNeo.ttc";

export function resolveOverlayFontPath(fontFamily: string): string {
  const option = OVERLAY_FONT_OPTIONS.find((font) => font.family === fontFamily);
  if (option && fs.existsSync(option.path)) return option.path;
  return FALLBACK_FONT_PATH;
}
