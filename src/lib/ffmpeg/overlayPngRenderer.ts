import type { Track, OverlayPreset } from "@/lib/schema";
import { runFfmpeg } from "./runFfmpeg";
import { resolveOverlayFontPath } from "./overlayFontResolver";

const CARD_GEN_CONCURRENCY = 4;

// Timing + path for one pre-rendered PNG card.
// Caller computes tStart/tEnd/fadeOut from resolveOverlayTimings.
export interface PngCardSpec {
  localPath: string;
  track: Track;
  tStart: number;
  tEnd: number;
  fadeOut: boolean;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,");  // filter_complex_script ignores single-quote protection for commas
}

// Generate a transparent 1920×1080 PNG for each spec using FFmpeg (up to CARD_GEN_CONCURRENCY at once).
// Each PNG has solid-alpha text — fade-in/fade-out is applied in the main render via the fade filter.
export async function generatePngCards(
  specs: PngCardSpec[],
  preset: OverlayPreset
): Promise<void> {
  if (specs.length === 0) return;

  let nextIdx = 0;
  async function worker(): Promise<void> {
    while (nextIdx < specs.length) {
      const spec = specs[nextIdx++];
      await generateSinglePng(spec.track, preset, spec.localPath);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CARD_GEN_CONCURRENCY, specs.length) }, worker)
  );
}

// Renders artist + title onto a transparent 1920×1080 frame and saves as PNG.
// Uses the same font, position, and size as the drawtext renderer so visuals are identical.
async function generateSinglePng(
  track: Track,
  preset: OverlayPreset,
  outputPath: string
): Promise<void> {
  const { layout, typography, color } = preset;
  // lineHeight is now a pixel gap between artist and title rows (not a multiplier).
  const rowGap = typography.lineHeight;
  const artistOffset = typography.artistFontSize + rowGap;

  // y is the title's top position. Artist sits above it by artistFontSize + gap.
  const yTitle = layout.y < 0 ? `h${layout.y}` : `${layout.y}`;
  const yArtist = layout.y < 0
    ? `h${layout.y - artistOffset}`
    : `${layout.y - artistOffset}`;

  const artistFontfile = escapeDrawtext(resolveOverlayFontPath(typography.artistFontFamily));
  const titleFontfile = escapeDrawtext(resolveOverlayFontPath(typography.titleFontFamily));

  const artistFilter =
    `drawtext=fontfile='${artistFontfile}'` +
    `:text='${escapeDrawtext(track.artist)}'` +
    `:x=${layout.x}:y=${yArtist}` +
    `:fontsize=${typography.artistFontSize}` +
    `:fontcolor=${color.artist}@1.0` +
    `:fix_bounds=1`;

  const titleFilter =
    `drawtext=fontfile='${titleFontfile}'` +
    `:text='${escapeDrawtext(track.title)}'` +
    `:x=${layout.x}:y=${yTitle}` +
    `:fontsize=${typography.titleFontSize}` +
    `:fontcolor=${color.title}@1.0` +
    `:fix_bounds=1`;

  await runFfmpeg({
    args: [
      "-y",
      "-f", "lavfi",
      "-i", "nullsrc=s=1920x1080,format=rgba,colorchannelmixer=aa=0",
      "-vframes", "1",
      // nullsrc plus aa=0 avoids color's opaque-black default alpha in PNG output.
      // -pix_fmt rgba ensures the PNG is saved as RGBA (transparent background).
      "-vf", `${artistFilter},${titleFilter}`,
      "-pix_fmt", "rgba",
      outputPath,
    ],
  });
}

// Build filter_complex lines for compositing pre-rendered PNG cards onto the video.
// startInputIndex: FFmpeg input index of the first card (0=bg, 1=audio → cards start at 2).
// Returns lines to join with ";\n" after the bg filter line.
export function buildPngCardOverlayLines(
  specs: PngCardSpec[],
  startInputIndex: number,
  preset: OverlayPreset,
  finalLabel = "vout"
): string[] {
  const lines: string[] = [];
  let prevLabel = "_bgproc";

  for (let i = 0; i < specs.length; i++) {
    const { tStart, tEnd, fadeOut: hasFadeOut } = specs[i];
    const inputIdx = startInputIndex + i;
    const cardLabel = `_card${i}`;
    const nextLabel = i === specs.length - 1 ? finalLabel : `_v${i}`;
    const tFadeOutStart = tEnd - preset.animation.fadeOutSec;

    const fadeInFilter =
      `fade=t=in:st=${tStart.toFixed(3)}:d=${preset.animation.fadeInSec.toFixed(3)}:alpha=1`;
    const fadeOutFilter = hasFadeOut
      ? `,fade=t=out:st=${tFadeOutStart.toFixed(3)}:d=${preset.animation.fadeOutSec.toFixed(3)}:alpha=1`
      : "";

    // format=rgba before fade preserves the PNG card's alpha channel; without it
    // FFmpeg converts to yuv420p and the transparent background becomes opaque black.
    lines.push(`[${inputIdx}:v]format=rgba,${fadeInFilter}${fadeOutFilter}[${cardLabel}]`);
    // Use gt/lt with \, escape — > and < operators fail in this FFmpeg eval version.
    // \, is converted to a literal comma by the filter graph parser before the expression evaluator sees it.
    lines.push(
      `[${prevLabel}][${cardLabel}]overlay=format=auto:enable=gt(t\\,${tStart.toFixed(3)})*lt(t\\,${tEnd.toFixed(3)})[${nextLabel}]`
    );
    prevLabel = nextLabel;
  }

  return lines;
}
