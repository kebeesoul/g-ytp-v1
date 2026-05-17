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
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,");  // filter_complex_script ignores single-quote protection for commas
}

// fade-in / fade-out alpha 표현식 생성
// filter_complex_script 파서가 single-quote 안 쉼표도 필터 구분자로 오인하므로
// if(lt(t,X),Y,Z) 대신 조건 곱셈((t>=X)*(t<Y)*value)으로 쉼표를 완전히 제거한다.
function buildAlphaExpr(
  tStart: number,
  tEnd: number,
  fadeIn: number,
  fadeOut: number,
  hasFadeOut: boolean
): string {
  const s = tStart.toFixed(3);
  const e = tEnd.toFixed(3);
  const fi = fadeIn.toFixed(3);
  const fo = fadeOut.toFixed(3);
  const fiEnd = (tStart + fadeIn).toFixed(3);
  const foStart = (tEnd - fadeOut).toFixed(3);

  if (hasFadeOut) {
    // fade-in segment + hold segment + fade-out segment — no commas, no >= (unsupported in eval)
    return (
      `(t>${s})*(t<${fiEnd})*(t-${s})/${fi}` +
      `+(t>${fiEnd})*(t<${foStart})` +
      `+(t>${foStart})*(t<${e})*(${e}-t)/${fo}`
    );
  }
  // fade-in then hold at 1 — no commas, no >=
  return (
    `(t>${s})*(t<${fiEnd})*(t-${s})/${fi}` +
    `+(t>${fiEnd})`
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

  // Use > and < (not >= / <=) — this FFmpeg eval does not parse >= as a single operator.
  const enable = `(t>${tStart.toFixed(3)})*(t<${tEnd.toFixed(3)})`;

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
