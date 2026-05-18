import { writeFile } from "node:fs/promises";
import type { Track, OverlayPreset } from "@/lib/schema";
import { runFfmpeg } from "./runFfmpeg";

const FONT_PATH = process.env.FONT_PATH_KR ?? "/System/Library/Fonts/AppleSDGothicNeo.ttc";
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
  const titleLineH = Math.ceil(typography.titleFontSize * typography.lineHeight);

  // y < 0 → bottom-relative (e.g. "h-160"), matching overlayDrawtextRenderer logic
  const yTitle = layout.y < 0 ? `h${layout.y}` : `${layout.y}`;
  const yArtist = layout.y < 0
    ? `h${layout.y - titleLineH}`
    : `${layout.y - titleLineH}`;

  const fontfile = escapeDrawtext(FONT_PATH);

  const artistFilter =
    `drawtext=fontfile='${fontfile}'` +
    `:text='${escapeDrawtext(track.artist)}'` +
    `:x=${layout.x}:y=${yArtist}` +
    `:fontsize=${typography.artistFontSize}` +
    `:fontcolor=${color.artist}@1.0` +
    `:fix_bounds=1`;

  const titleFilter =
    `drawtext=fontfile='${fontfile}'` +
    `:text='${escapeDrawtext(track.title)}'` +
    `:x=${layout.x}:y=${yTitle}` +
    `:fontsize=${typography.titleFontSize}` +
    `:fontcolor=${color.title}@1.0` +
    `:fix_bounds=1`;

  await runFfmpeg({
    args: [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=black@0.0:s=1920x1080",
      "-vframes", "1",
      // format=rgba before drawtext prevents yuv420p conversion that strips alpha.
      // -pix_fmt rgba ensures the PNG is saved as RGBA (transparent background).
      "-vf", `format=rgba,${artistFilter},${titleFilter}`,
      "-pix_fmt", "rgba",
      outputPath,
    ],
  });
}

// Pre-render all card overlays onto a transparent RGBA base, producing a single
// overlay video. The caller then composites this once onto the background instead
// of running N sequential overlay ops per frame in the main render.
// Input 0 = lavfi transparent base; inputs 1..N = PNG cards (loop 1).
export async function prerenderOverlayTrack(
  specs: PngCardSpec[],
  preset: OverlayPreset,
  totalDurationSec: number,
  outputPath: string,
  scriptPath: string
): Promise<void> {
  if (specs.length === 0) return;

  // Cards start at input index 1 (lavfi transparent base is input 0).
  const overlayLines = buildPngCardOverlayLines(specs, 1, preset);
  const filterScript = "[0:v]format=rgba[_bgproc];\n" + overlayLines.join(";\n");
  await writeFile(scriptPath, filterScript, "utf8");

  const cardInputs = specs.flatMap((s) => ["-loop", "1", "-i", s.localPath]);

  await runFfmpeg({
    args: [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=black@0.0:s=1920x1080:r=30:d=${totalDurationSec.toFixed(3)}`,
      ...cardInputs,
      "-filter_complex_script", scriptPath,
      "-map", "[vout]",
      "-c:v", "qtrle",     // lossless RLE — efficient for mostly-transparent video
      "-pix_fmt", "argb",  // 32-bit RGBA preserves transparency
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
  preset: OverlayPreset
): string[] {
  const lines: string[] = [];
  let prevLabel = "_bgproc";

  for (let i = 0; i < specs.length; i++) {
    const { tStart, tEnd, fadeOut: hasFadeOut } = specs[i];
    const inputIdx = startInputIndex + i;
    const cardLabel = `_card${i}`;
    const nextLabel = i === specs.length - 1 ? "vout" : `_v${i}`;
    const tFadeOutStart = tEnd - preset.animation.fadeOutSec;

    const fadeInFilter =
      `fade=t=in:st=${tStart.toFixed(3)}:d=${preset.animation.fadeInSec.toFixed(3)}:alpha=1`;
    const fadeOutFilter = hasFadeOut
      ? `,fade=t=out:st=${tFadeOutStart.toFixed(3)}:d=${preset.animation.fadeOutSec.toFixed(3)}:alpha=1`
      : "";

    lines.push(`[${inputIdx}:v]${fadeInFilter}${fadeOutFilter}[${cardLabel}]`);
    // Use gt/lt with \, escape — > and < operators fail in this FFmpeg eval version.
    // \, is converted to a literal comma by the filter graph parser before the expression evaluator sees it.
    lines.push(
      `[${prevLabel}][${cardLabel}]overlay=enable=gt(t\\,${tStart.toFixed(3)})*lt(t\\,${tEnd.toFixed(3)})[${nextLabel}]`
    );
    prevLabel = nextLabel;
  }

  return lines;
}

