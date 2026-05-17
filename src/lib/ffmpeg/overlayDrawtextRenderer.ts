import type { Track, OverlayPreset } from "@/lib/schema";
import type { OverlayTiming } from "./overlayCompiler";

const FONT_PATH = process.env.FONT_PATH_KR ?? "/System/Library/Fonts/AppleSDGothicNeo.ttc";

// FFmpeg drawtext 필터용 텍스트 이스케이프 (filter_complex_script 파일 기준)
// 단일 따옴표로 감싸인 값 안에서: \, ', :, % 이스케이프
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

// fade-in / fade-out alpha 표현식 생성
function buildAlphaExpr(
  tStart: number,
  tEnd: number,
  fadeIn: number,
  fadeOut: number,
  hasFadeOut: boolean
): string {
  const tStartS = tStart.toFixed(3);
  const tEndS = tEnd.toFixed(3);
  const fadeInS = fadeIn.toFixed(3);
  const fadeOutS = fadeOut.toFixed(3);
  const tFadeOutStart = (tEnd - fadeOut).toFixed(3);

  if (hasFadeOut) {
    // fade-in + hold + fade-out
    return (
      `if(lt(t,${tStartS}),0,` +
      `if(lt(t,${tStartS}+${fadeInS}),(t-${tStartS})/${fadeInS},` +
      `if(lt(t,${tFadeOutStart}),1,` +
      `if(lt(t,${tEndS}),(${tEndS}-t)/${fadeOutS},0))))`
    );
  }
  // fade-in only
  return (
    `if(lt(t,${tStartS}),0,` +
    `if(lt(t,${tStartS}+${fadeInS}),(t-${tStartS})/${fadeInS},1))`
  );
}

// 트랙 1개에 대한 drawtext 필터 2개(artist + title) 반환
export function compileDrawtextFilters(
  track: Track,
  timing: Extract<OverlayTiming, { skip: false }>,
  preset: OverlayPreset
): string[] {
  const { tStart, tEnd, fadeOut } = timing;
  const { layout, typography, color, animation } = preset;

  const alpha = buildAlphaExpr(
    tStart,
    tEnd,
    animation.fadeInSec,
    animation.fadeOutSec,
    fadeOut
  );

  // Use comparison operators instead of between(t,X,Y) — commas inside between()
  // are misread as filter separators by the filter_complex_script parser.
  const enable = `(t>=${tStart.toFixed(3)})*(t<=${tEnd.toFixed(3)})`;

  // y 계산: layout.y < 0 → 하단 기준 (h + layout.y)
  const yBase = layout.y < 0 ? `h${layout.y}` : `${layout.y}`;
  const titleY = yBase;
  const titleLineH = Math.ceil(typography.titleFontSize * typography.lineHeight);
  const artistY = layout.y < 0
    ? `h${layout.y - titleLineH}`
    : `${layout.y - titleLineH}`;

  const fontfile = escapeDrawtext(FONT_PATH);
  const artistText = escapeDrawtext(track.artist);
  const titleText = escapeDrawtext(track.title);

  const artistFilter =
    `drawtext=fontfile='${fontfile}'` +
    `:text='${artistText}'` +
    `:x=${layout.x}` +
    `:y=${artistY}` +
    `:fontsize=${typography.artistFontSize}` +
    `:fontcolor=${color.artist}` +
    `:alpha='${alpha}'` +
    `:enable='${enable}'`;

  const titleFilter =
    `drawtext=fontfile='${fontfile}'` +
    `:text='${titleText}'` +
    `:x=${layout.x}` +
    `:y=${titleY}` +
    `:fontsize=${typography.titleFontSize}` +
    `:fontcolor=${color.title}` +
    `:alpha='${alpha}'` +
    `:enable='${enable}'`;

  return [artistFilter, titleFilter];
}
