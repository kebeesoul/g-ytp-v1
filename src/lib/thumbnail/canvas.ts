import { FONTS, POSITIONS, TEXT_COLORS, applyOverlay, applyTextCase } from "./constants";
import type { ThumbnailSettings } from "./schema";

type LetterSpacingCanvasContext = CanvasRenderingContext2D & {
  letterSpacing?: string;
};

function fontCss(font: (typeof FONTS)[number], sizePx: number): string {
  return `${font.italic ? "italic " : ""}${font.weight} ${sizePx}px ${font.family}`;
}

export async function drawThumbnail(
  canvas: HTMLCanvasElement,
  photoSrc: string,
  settings: ThumbnailSettings
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  const W = 1280;
  const H = 720;
  canvas.width = W;
  canvas.height = H;

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = photoSrc;
  });

  const imageRatio = img.width / img.height;
  const canvasRatio = W / H;
  let dw: number;
  let dh: number;
  let dx: number;
  let dy: number;
  if (imageRatio > canvasRatio) {
    dh = H;
    dw = img.width * (H / img.height);
    dx = (W - dw) / 2;
    dy = 0;
  } else {
    dw = W;
    dh = img.height * (W / img.width);
    dx = 0;
    dy = (H - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);

  applyOverlay(ctx, settings.overlayId, W, H);

  await document.fonts.ready;

  const font = FONTS.find((f) => f.id === settings.fontId) ?? FONTS[0];
  const colorHex = TEXT_COLORS.find((c) => c.id === settings.colorId)?.hex ?? "#FFFFFF";
  const positionPct = POSITIONS.find((p) => p.id === settings.positionId)?.pct ?? 80;
  const spacingCtx: LetterSpacingCanvasContext = ctx;
  if ("letterSpacing" in spacingCtx) {
    spacingCtx.letterSpacing = `${settings.letterSpacingPx}px`;
  }

  const displayText = applyTextCase(settings.text, settings.textCaseId);
  let finalSize = settings.textSizePx;
  ctx.font = fontCss(font, finalSize);
  while (ctx.measureText(displayText).width > W * 0.9 && finalSize > 50) {
    finalSize -= 2;
    ctx.font = fontCss(font, finalSize);
  }

  ctx.fillStyle = colorHex;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  ctx.fillText(displayText, W / 2, H * (positionPct / 100));
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename?: string): void {
  const a = document.createElement("a");
  a.download = filename ?? `thumbnail-${Date.now()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
