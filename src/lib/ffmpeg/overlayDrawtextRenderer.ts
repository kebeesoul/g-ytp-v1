import type { Track, OverlayPreset } from "@/lib/schema";
import type { OverlayTiming } from "./overlayCompiler";
import { getDrawtextPosition } from "@/lib/overlayPosition";

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
// filter_complex_script 파서는 single-quote 안 쉼표도 필터 구분자로 오인한다.
// 해결책: gt(t\,X)/lt(t\,X) 함수 호출 + \, 이스케이프(필터 그래프 레벨).
// 파서가 \,를 리터럴 쉼표로 변환 → eval이 gt(t,X)를 올바르게 해석.
// > / < 연산자는 이 버전의 FFmpeg eval에서 파싱 오류를 일으킨다.
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
    // fade-in + hold + fade-out: gt/lt with \, escape — no raw > < operators
    return (
      `gt(t\\,${s})*lt(t\\,${fiEnd})*(t-${s})/${fi}` +
      `+gt(t\\,${fiEnd})*lt(t\\,${foStart})` +
      `+gt(t\\,${foStart})*lt(t\\,${e})*(${e}-t)/${fo}`
    );
  }
  // fade-in then hold at 1
  return (
    `gt(t\\,${s})*lt(t\\,${fiEnd})*(t-${s})/${fi}` +
    `+gt(t\\,${fiEnd})`
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

  const artistPosition = getDrawtextPosition(layout, typography, "artist");
  const titlePosition = getDrawtextPosition(layout, typography, "title");

  const fontfile = escapeDrawtext(FONT_PATH);
  const artistText = escapeDrawtext(track.artist);
  const titleText = escapeDrawtext(track.title);

  // alpha= is unquoted so \, in the expression is parsed by the filter graph layer
  // (converted to literal comma before passing to the expression evaluator).
  // enable= is omitted — alpha=0 already makes text invisible outside the window.
  const artistFilter =
    `drawtext=fontfile='${fontfile}'` +
    `:text='${artistText}'` +
    `:x=${artistPosition.x}` +
    `:y=${artistPosition.y}` +
    `:fontsize=${typography.artistFontSize}` +
    `:fontcolor=${color.artist}` +
    `:alpha=${alpha}`;

  const titleFilter =
    `drawtext=fontfile='${fontfile}'` +
    `:text='${titleText}'` +
    `:x=${titlePosition.x}` +
    `:y=${titlePosition.y}` +
    `:fontsize=${typography.titleFontSize}` +
    `:fontcolor=${color.title}` +
    `:alpha=${alpha}`;

  return [artistFilter, titleFilter];
}
