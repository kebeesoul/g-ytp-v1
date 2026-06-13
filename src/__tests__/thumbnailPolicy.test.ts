import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { DEFAULT_THUMBNAIL_SETTINGS, FONTS, OVERLAYS, POSITIONS, TEXT_CASES, TEXT_COLORS } from "@/lib/thumbnail/constants";
import { ThumbnailSettingsSchema } from "@/lib/thumbnail/schema";

describe("Thumbnail Phase 1 integration", () => {
  it("defines the fixed design option sets from the spec", () => {
    expect(FONTS.map((f) => f.id)).toEqual([
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
    ]);
    expect(OVERLAYS.map((o) => o.id)).toEqual(["none", "vignette", "dim", "grayscale"]);
    expect(POSITIONS.map((p) => p.id)).toEqual(["top", "center", "bottom"]);
    expect(TEXT_CASES.map((c) => c.id)).toEqual(["upper", "title", "lower"]);
    expect(TEXT_COLORS.map((c) => c.id)).toEqual(["white", "cream", "black", "gold", "rose"]);
  });

  it("validates default thumbnail settings with zod", () => {
    expect(ThumbnailSettingsSchema.parse(DEFAULT_THUMBNAIL_SETTINGS)).toEqual({
      fontId: "playfairdisplay",
      overlayId: "none",
      positionId: "bottom",
      colorId: "white",
      text: "PLAYLIST",
      textCaseId: "upper",
      textSizePx: 148,
      letterSpacingPx: 0,
    });
  });

  it("keeps uploaded photos under workspace paths", async () => {
    const routeCode = await readFile(
      new URL("../app/api/thumbnail/upload-photo/route.ts", import.meta.url),
      "utf8"
    );
    expect(routeCode).toContain("workspacePaths.thumbnailPhotoDir()");
    expect(routeCode).toContain("workspacePaths.thumbnailPhoto(filename)");
    expect(routeCode).toContain("assertInsideWorkspace(dest)");
  });

  it("allows selected thumbnail images to be served as workspace files", async () => {
    const routeCode = await readFile(
      new URL("../app/api/workspace-file/[...path]/route.ts", import.meta.url),
      "utf8"
    );
    expect(routeCode).toContain('relativePath.startsWith("thumbnail/selected/")');
  });

  it("adds Thumbnail to the global navigation", async () => {
    const navCode = await readFile(
      new URL("../components/layout/TopNav.tsx", import.meta.url),
      "utf8"
    );
    expect(navCode).toContain('href: "/thumbnail"');
    expect(navCode).toContain("Thumbnail");
  });
});
