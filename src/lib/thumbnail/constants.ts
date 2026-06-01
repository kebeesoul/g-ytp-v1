export const FONTS = [
  {
    id: "playfairdisplay",
    name: "Playfair Display",
    label: "PLAYFAIR DISPLAY",
    family: "'Playfair Display', serif",
    googleKey: "Playfair+Display:wght@700",
    weight: "700",
    spacing: "0.04em",
    italic: false,
    tag: "세리프 / 빈티지",
    canvasSizePx: 148,
  },
  {
    id: "ebgaramond",
    name: "EB Garamond",
    label: "EB GARAMOND",
    family: "'EB Garamond', serif",
    googleKey: "EB+Garamond:wght@700",
    weight: "700",
    spacing: "0.08em",
    italic: false,
    tag: "클래식 / 에디토리얼",
    canvasSizePx: 148,
  },
  {
    id: "inter",
    name: "Inter",
    label: "INTER",
    family: "'Inter', sans-serif",
    googleKey: "Inter:wght@800",
    weight: "800",
    spacing: "0.04em",
    italic: false,
    tag: "모던 / 클린",
    canvasSizePx: 148,
  },
  {
    id: "leaguegothic",
    name: "League Gothic",
    label: "LEAGUE GOTHIC",
    family: "'League Gothic', sans-serif",
    googleKey: "League+Gothic",
    weight: "400",
    spacing: "0.10em",
    italic: false,
    tag: "컨덴스드 / 포스터",
    canvasSizePx: 148,
  },
  {
    id: "librebaskerville",
    name: "Libre Baskerville",
    label: "LIBRE BASKERVILLE",
    family: "'Libre Baskerville', serif",
    googleKey: "Libre+Baskerville:wght@700",
    weight: "700",
    spacing: "0.08em",
    italic: false,
    tag: "북디자인 / 클래식",
    canvasSizePx: 148,
  },
  {
    id: "spacemono",
    name: "Space Mono",
    label: "SPACE MONO",
    family: "'Space Mono', monospace",
    googleKey: "Space+Mono:wght@700",
    weight: "700",
    spacing: "0.04em",
    italic: false,
    tag: "모노 / 테크",
    canvasSizePx: 148,
  },
  {
    id: "youngserif",
    name: "Young Serif",
    label: "YOUNG SERIF",
    family: "'Young Serif', serif",
    googleKey: "Young+Serif",
    weight: "400",
    spacing: "0.06em",
    italic: false,
    tag: "레트로 / 감성",
    canvasSizePx: 148,
  },
  {
    id: "raleway",
    name: "Raleway",
    label: "RALEWAY",
    family: "'Raleway', sans-serif",
    googleKey: "Raleway:wght@300",
    weight: "300",
    spacing: "0.12em",
    italic: false,
    tag: "얇은 산스 / 무드",
    canvasSizePx: 148,
  },
  {
    id: "oswald",
    name: "Oswald",
    label: "OSWALD",
    family: "'Oswald', sans-serif",
    googleKey: "Oswald:wght@700",
    weight: "700",
    spacing: "0.08em",
    italic: false,
    tag: "볼드 / 유튜브",
    canvasSizePx: 148,
  },
  {
    id: "archivoblack",
    name: "Archivo Black",
    label: "ARCHIVO BLACK",
    family: "'Archivo Black', sans-serif",
    googleKey: "Archivo+Black",
    weight: "900",
    spacing: "0.04em",
    italic: false,
    tag: "디스플레이 / 아트",
    canvasSizePx: 148,
  },
  {
    id: "roboto",
    name: "Roboto",
    label: "ROBOTO",
    family: "'Roboto', sans-serif",
    googleKey: "Roboto:wght@900",
    weight: "900",
    spacing: "0.04em",
    italic: false,
    tag: "스탠다드 / 글로벌",
    canvasSizePx: 148,
  },
  {
    id: "spacegrotesk",
    name: "Space Grotesk",
    label: "SPACE GROTESK",
    family: "'Space Grotesk', sans-serif",
    googleKey: "Space+Grotesk:wght@700",
    weight: "700",
    spacing: "0.04em",
    italic: false,
    tag: "로우파이 / 실험적",
    canvasSizePx: 148,
  },
  {
    id: "bodonimoda",
    name: "Bodoni Moda",
    label: "BODONI MODA",
    family: "'Bodoni Moda', serif",
    googleKey: "Bodoni+Moda:opsz,wght@72,700",
    weight: "700",
    spacing: "0.04em",
    italic: false,
    tag: "세리프 / 강한 무드",
    canvasSizePx: 148,
  },
  {
    id: "geometricclean",
    name: "GEOMETRIC CLEAN",
    label: "GEOMETRIC CLEAN",
    family: "'Josefin Sans', sans-serif",
    googleKey: "Josefin+Sans:wght@700",
    weight: "700",
    spacing: "0.30em",
    italic: false,
    tag: "클린 / 스칸디",
    canvasSizePx: 148,
  },
  {
    id: "thinelegant",
    name: "Thin Elegant",
    label: "THIN ELEGANT",
    family: "'Cormorant Garamond', serif",
    googleKey: "Cormorant+Garamond:wght@600",
    weight: "600",
    spacing: "0.38em",
    italic: false,
    tag: "미니멀 / 발라드",
    canvasSizePx: 148,
  },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

export const OVERLAYS = [
  { id: "none", label: "없음" },
  { id: "vignette", label: "비네트" },
  { id: "dim", label: "전체 어둡게" },
  { id: "grayscale", label: "흑백" },
] as const;

export type OverlayId = (typeof OVERLAYS)[number]["id"];

export const POSITIONS = [
  { id: "top", label: "상단", pct: 18 },
  { id: "center", label: "중앙", pct: 50 },
  { id: "bottom", label: "하단", pct: 80 },
] as const;

export type PositionId = (typeof POSITIONS)[number]["id"];

export const TEXT_COLORS = [
  { id: "white", label: "화이트", hex: "#FFFFFF" },
  { id: "cream", label: "크림", hex: "#F5EDD8" },
  { id: "black", label: "블랙", hex: "#0A0A0A" },
  { id: "gold", label: "골드", hex: "#C8A74B" },
  { id: "rose", label: "로즈", hex: "#E8A0A8" },
] as const;

export type ColorId = (typeof TEXT_COLORS)[number]["id"];

export const TEXT_CASES = [
  { id: "upper", label: "PLAYLIST" },
  { id: "title", label: "Playlist" },
  { id: "lower", label: "playlist" },
] as const;

export type TextCaseId = (typeof TEXT_CASES)[number]["id"];

export function applyTextCase(text: string, textCaseId: TextCaseId): string {
  if (textCaseId === "lower") return text.toLowerCase();
  if (textCaseId === "title") {
    const lower = text.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return text.toUpperCase();
}

export function applyOverlay(
  ctx: CanvasRenderingContext2D,
  overlayId: OverlayId,
  W: number,
  H: number
): void {
  if (overlayId === "none") return;

  let fillStyle: CanvasGradient | string;

  switch (overlayId) {
    case "vignette": {
      const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.18, W / 2, H / 2, W * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.75)");
      fillStyle = g;
      break;
    }
    case "dim":
      fillStyle = "rgba(0,0,0,0.42)";
      break;
    case "grayscale": {
      const imageData = ctx.getImageData(0, 0, W, H);
      const { data } = imageData;
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
      return;
    }
    default:
      return;
  }

  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, W, H);
}

export const DEFAULT_THUMBNAIL_SETTINGS = {
  fontId: "playfairdisplay",
  overlayId: "none",
  positionId: "bottom",
  colorId: "white",
  text: "PLAYLIST",
  textCaseId: "upper",
  textSizePx: 148,
  letterSpacingPx: 0,
} as const;
