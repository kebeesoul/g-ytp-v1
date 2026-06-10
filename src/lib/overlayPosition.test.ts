import { describe, expect, it } from "vitest";
import {
  getDrawtextPosition,
  getOverlayCssPosition,
  getOverlayDragPosition,
  normalizeOverlayLayout,
} from "./overlayPosition";
import type { OverlayPreset } from "./schema";

const typography: OverlayPreset["typography"] = {
  artistFontFamily: "Inter",
  titleFontFamily: "Inter",
  artistFontSize: 32,
  titleFontSize: 42,
  artistWeight: 500,
  titleWeight: 700,
  artistItalic: false,
  titleItalic: false,
  artistUnderline: false,
  titleUnderline: false,
  letterSpacing: 0,
  lineHeight: 12,
  maxLinesTitle: 2,
  textAlign: "left",
};

const baseLayout: OverlayPreset["layout"] = {
  anchor: "bottom-center",
  x: 0,
  y: 205,
  safeMarginX: 96,
  safeMarginY: 72,
};

describe("overlayPosition", () => {
  it("uses the same bottom-center coordinates for preview and FFmpeg", () => {
    expect(getDrawtextPosition(baseLayout, typography, "artist")).toEqual({
      x: "(w-text_w)/2",
      y: "h-205-42-12-text_h",
    });
    expect(getDrawtextPosition(baseLayout, typography, "title")).toEqual({
      x: "(w-text_w)/2",
      y: "h-205-text_h",
    });
  });

  it("positions right anchors from the right edge", () => {
    const layout = { ...baseLayout, anchor: "bottom-right" as const, x: -96 };
    expect(getDrawtextPosition(layout, typography, "title").x).toBe(
      "w-text_w-96"
    );
  });

  it("normalizes legacy negative bottom offsets", () => {
    expect(normalizeOverlayLayout({ ...baseLayout, y: -160 }).y).toBe(160);
  });

  it("maps bottom-center to the same browser preview anchor", () => {
    expect(getOverlayCssPosition(baseLayout, 0.25)).toEqual({
      bottom: 51.25,
      left: "calc(50% + 0px)",
      transform: "translateX(-50%)",
    });
  });

  it("reverses drag deltas for bottom and right edge distances", () => {
    expect(
      getOverlayDragPosition(
        { ...baseLayout, anchor: "bottom-right", x: -96, y: 120 },
        20,
        30
      )
    ).toEqual({ x: -116, y: 90 });
  });
});
