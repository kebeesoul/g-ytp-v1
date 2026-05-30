"use client";

import { useEffect, useRef, useState } from "react";
import { BackgroundSchema } from "@/lib/schema";
import type { Background } from "@/lib/schema";

interface BackgroundPickerProps {
  editorSessionId: string;
  value: Background | null;
  onChange: (bg: Background | null) => void;
}

const DIM_DEFAULT = 0.25;

export function BackgroundPicker({
  editorSessionId,
  value,
  onChange,
}: BackgroundPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [showCropEditor, setShowCropEditor] = useState(false);

  const hasImage = value?.kind === "image" && imgNaturalSize !== null;

  // 미리보기 Canvas 렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) {
      setImgNaturalSize(null);
      // Clear canvas when image is removed
      const ctx = canvas?.getContext("2d");
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const publicUrl = `/api/workspace-file/${value.storagePath}`;
    const cropX = value.cropX ?? 0.5;
    const cropY = value.cropY ?? 0.5;
    const cropW = value.cropW ?? 1.0;

    if (value.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        drawCoverImage(ctx, img, canvas.width, canvas.height, DIM_DEFAULT, cropX, cropY, cropW);
      };
      img.src = publicUrl;
    } else {
      setImgNaturalSize(null);
      // 비디오 — 첫 프레임 캡처 (crop position not applied to video preview)
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.src = publicUrl;
      video.currentTime = 0;
      video.addEventListener(
        "seeked",
        () => {
          drawCoverVideo(ctx, video, canvas.width, canvas.height, DIM_DEFAULT);
        },
        { once: true }
      );
      video.load();
    }
  }, [value]);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("editorSessionId", editorSessionId);
      form.append("file", file);

      const res = await fetch("/api/upload-bg", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `upload failed: ${res.status}`);
      }

      const raw: unknown = await res.json();
      const parsed = BackgroundSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("서버 응답 형식 오류");
      }
      onChange(parsed.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-300">배경</span>

      {/* Canvas 미리보기 — 클릭/드래그로 업로드 가능 */}
      <div
        className="relative overflow-hidden rounded-md border border-gray-700 bg-gray-900 cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full"
        />
        {!value && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-gray-500">
            <span>미리보기 없음</span>
            <span className="text-gray-600">{uploading ? "업로드 중..." : "클릭 또는 드래그"}</span>
          </div>
        )}
      </div>

      {/* 업로드 Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-gray-600 py-4 text-sm text-gray-500 transition hover:border-gray-400 hover:text-gray-300"
      >
        {uploading ? "업로드 중..." : "이미지 / 영상 (클릭 또는 드래그)"}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      {value && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{value.kind === "image" ? "이미지" : "영상"}</span>
          <div className="flex items-center gap-3">
            {hasImage && (
              <button
                onClick={() => setShowCropEditor(true)}
                className="text-blue-400 hover:text-blue-300"
              >
                ✂ 크롭
              </button>
            )}
            <button
              onClick={() => onChange(null)}
              className="text-red-400 hover:text-red-300"
            >
              제거
            </button>
          </div>
        </div>
      )}

      {showCropEditor && value?.kind === "image" && imgNaturalSize && (
        <CropEditor
          imageUrl={`/api/workspace-file/${value.storagePath}`}
          naturalSize={imgNaturalSize}
          initialCropX={value.cropX ?? 0.5}
          initialCropY={value.cropY ?? 0.5}
          initialCropW={value.cropW ?? 1.0}
          onConfirm={(cropX, cropY, cropW) => {
            onChange({ ...value, cropX, cropY, cropW });
            setShowCropEditor(false);
          }}
          onClose={() => setShowCropEditor(false)}
        />
      )}
    </div>
  );
}

// ─── Canvas 헬퍼 ──────────────────────────────────────────────────────────────

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement,
  cw: number,
  ch: number,
  dim: number,
  cropX: number = 0.5,
  cropY: number = 0.5,
  cropW: number = 1.0
) {
  const iw = source.naturalWidth;
  const ih = source.naturalHeight;

  // Crop box in source pixels (center-anchored, 16:9)
  const boxW = iw * cropW;
  const boxH = boxW * (9 / 16);
  const sx = Math.max(0, Math.min(iw * cropX - boxW / 2, iw - boxW));
  const sy = Math.max(0, Math.min(ih * cropY - boxH / 2, ih - boxH));

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(source, sx, sy, boxW, boxH, 0, 0, cw, ch);
  ctx.fillStyle = `rgba(0,0,0,${dim})`;
  ctx.fillRect(0, 0, cw, ch);
}

function drawCoverVideo(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement,
  cw: number,
  ch: number,
  dim: number
) {
  const scale = Math.max(cw / source.videoWidth, ch / source.videoHeight);
  const sw = source.videoWidth * scale;
  const sh = source.videoHeight * scale;
  const sx = (cw - sw) / 2;
  const sy = (ch - sh) / 2;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(source, sx, sy, sw, sh);

  ctx.fillStyle = `rgba(0,0,0,${dim})`;
  ctx.fillRect(0, 0, cw, ch);
}

// ─── CropEditor Modal ─────────────────────────────────────────────────────────

interface CropEditorProps {
  imageUrl: string;
  naturalSize: { w: number; h: number };
  initialCropX: number;
  initialCropY: number;
  initialCropW: number;
  onConfirm: (cropX: number, cropY: number, cropW: number) => void;
  onClose: () => void;
}

// Drag mode: "move" = pan, "resize-left/right/top/bottom/tl/tr/bl/br" = edge/corner resize
type DragMode =
  | "move"
  | "resize-l" | "resize-r"
  | "resize-t" | "resize-b"
  | "resize-tl" | "resize-tr" | "resize-bl" | "resize-br";

function CropEditor({
  imageUrl,
  naturalSize,
  initialCropX,
  initialCropY,
  initialCropW,
  onConfirm,
  onClose,
}: CropEditorProps) {
  // cropX/Y are CENTER fractions (0–1), cropW is width fraction (0–1)
  const [cropX, setCropX] = useState(initialCropX);
  const [cropY, setCropY] = useState(initialCropY);
  const [cropW, setCropW] = useState(initialCropW);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragMode = useRef<DragMode | null>(null);
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0 });

  // Display size: fit natural image in 480×480 bounding box
  const MAX = 480;
  const scaleToFit = Math.min(MAX / naturalSize.w, MAX / naturalSize.h);
  const displayW = Math.round(naturalSize.w * scaleToFit);
  const displayH = Math.round(naturalSize.h * scaleToFit);

  // Minimum cropW: crop box height can't exceed image height (16:9 ratio)
  // boxH = cropW * naturalSize.w * 9/16 ≤ naturalSize.h  →  cropW ≤ 16*h/(9*w)
  const minCropW = 0.05;
  const maxCropW = Math.min(1.0, (naturalSize.h * 16) / (naturalSize.w * 9));

  // Crop box in display pixels
  const boxW = cropW * displayW;
  const boxH = boxW * (9 / 16);
  const boxLeft = cropX * displayW - boxW / 2;
  const boxTop  = cropY * displayH - boxH / 2;

  // Clamp so box never leaves the image
  function clampCrop(cx: number, cy: number, cw: number) {
    const w = Math.max(minCropW, Math.min(maxCropW, cw));
    const bH = w * (naturalSize.w / naturalSize.h) * (9 / 16);
    const x = Math.max(w / 2, Math.min(1 - w / 2, cx));
    const y = Math.max(bH / 2, Math.min(1 - bH / 2, cy));
    return { x, y, w };
  }

  function onPointerDown(e: React.PointerEvent, mode: DragMode) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMode.current = mode;
    dragStart.current = { x: e.clientX, y: e.clientY, cropX, cropY, cropW };
  }

  function onPointerMove(e: React.PointerEvent) {
    const mode = dragMode.current;
    if (!mode) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const dx = (e.clientX - dragStart.current.x) / displayW; // in image fractions
    const dy = (e.clientY - dragStart.current.y) / displayH;
    const { cropX: sx, cropY: sy, cropW: sw } = dragStart.current;
    const aspect = (naturalSize.w / naturalSize.h) * (9 / 16); // boxH/boxW in image space

    let nx = sx, ny = sy, nw = sw;

    if (mode === "move") {
      nx = sx + dx;
      ny = sy + dy;
    } else {
      // For resize: adjust width and re-center accordingly
      if (mode === "resize-r" || mode === "resize-tr" || mode === "resize-br") {
        nw = sw + dx * 2; // symmetric resize from center
      }
      if (mode === "resize-l" || mode === "resize-tl" || mode === "resize-bl") {
        nw = sw - dx * 2;
      }
      if (mode === "resize-b" || mode === "resize-bl" || mode === "resize-br") {
        // vertical drag → convert to equivalent width change
        nw = sw + (dy / aspect) * 2;
      }
      if (mode === "resize-t" || mode === "resize-tl" || mode === "resize-tr") {
        nw = sw - (dy / aspect) * 2;
      }
    }

    const clamped = clampCrop(nx, ny, nw);
    setCropX(clamped.x);
    setCropY(clamped.y);
    setCropW(clamped.w);
  }

  function onPointerUp() {
    dragMode.current = null;
  }

  const HANDLE = 10; // handle size in px

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-3 rounded-lg bg-gray-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium text-gray-200">크롭 편집</span>
        <p className="text-xs text-gray-400">박스를 드래그해 위치 이동, 모서리/가장자리를 드래그해 크기 조절</p>

        {/* Image canvas */}
        <div
          ref={containerRef}
          className="relative select-none overflow-hidden rounded"
          style={{ width: displayW, height: displayH, cursor: "crosshair" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="배경"
            draggable={false}
            style={{ width: displayW, height: displayH, display: "block" }}
          />

          {/* Dimmed overlay outside crop box (4 rects) */}
          {/* Top */}
          {boxTop > 0 && (
            <div className="pointer-events-none absolute left-0 top-0 w-full bg-black/60"
              style={{ height: boxTop }} />
          )}
          {/* Bottom */}
          {boxTop + boxH < displayH && (
            <div className="pointer-events-none absolute left-0 w-full bg-black/60"
              style={{ top: boxTop + boxH, height: displayH - boxTop - boxH }} />
          )}
          {/* Left */}
          <div className="pointer-events-none absolute bg-black/60"
            style={{ top: boxTop, left: 0, width: Math.max(0, boxLeft), height: boxH }} />
          {/* Right */}
          <div className="pointer-events-none absolute bg-black/60"
            style={{ top: boxTop, left: boxLeft + boxW, right: 0, height: boxH }} />

          {/* Crop box frame + drag handle */}
          <div
            className="absolute box-border border-2 border-yellow-400 cursor-move"
            style={{ left: boxLeft, top: boxTop, width: boxW, height: boxH }}
            onPointerDown={(e) => onPointerDown(e, "move")}
          >
            {/* Edge handles */}
            {(["l","r","t","b"] as const).map((side) => {
              const style: React.CSSProperties = {
                position: "absolute",
                background: "#facc15",
                borderRadius: 2,
              };
              if (side === "l") Object.assign(style, { left: -HANDLE/2, top: "50%", transform: "translateY(-50%)", width: HANDLE, height: HANDLE*2, cursor: "ew-resize" });
              if (side === "r") Object.assign(style, { right: -HANDLE/2, top: "50%", transform: "translateY(-50%)", width: HANDLE, height: HANDLE*2, cursor: "ew-resize" });
              if (side === "t") Object.assign(style, { top: -HANDLE/2, left: "50%", transform: "translateX(-50%)", height: HANDLE, width: HANDLE*2, cursor: "ns-resize" });
              if (side === "b") Object.assign(style, { bottom: -HANDLE/2, left: "50%", transform: "translateX(-50%)", height: HANDLE, width: HANDLE*2, cursor: "ns-resize" });
              return (
                <div
                  key={side}
                  style={style}
                  onPointerDown={(e) => onPointerDown(e, `resize-${side}` as DragMode)}
                />
              );
            })}

            {/* Corner handles */}
            {(["tl","tr","bl","br"] as const).map((corner) => {
              const style: React.CSSProperties = {
                position: "absolute",
                background: "#facc15",
                width: HANDLE,
                height: HANDLE,
                borderRadius: 2,
              };
              if (corner === "tl") Object.assign(style, { top: -HANDLE/2, left: -HANDLE/2, cursor: "nwse-resize" });
              if (corner === "tr") Object.assign(style, { top: -HANDLE/2, right: -HANDLE/2, cursor: "nesw-resize" });
              if (corner === "bl") Object.assign(style, { bottom: -HANDLE/2, left: -HANDLE/2, cursor: "nesw-resize" });
              if (corner === "br") Object.assign(style, { bottom: -HANDLE/2, right: -HANDLE/2, cursor: "nwse-resize" });
              return (
                <div
                  key={corner}
                  style={style}
                  onPointerDown={(e) => onPointerDown(e, `resize-${corner}` as DragMode)}
                />
              );
            })}
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <span className="text-xs text-gray-400">가로</span>
          <input type="range" min={0} max={100} value={Math.round(cropX * 100)}
            onChange={(e) => {
              const { x, y, w } = clampCrop(Number(e.target.value) / 100, cropY, cropW);
              setCropX(x); setCropY(y); setCropW(w);
            }} className="flex-1" />
          <span className="text-xs text-gray-400">세로</span>
          <input type="range" min={0} max={100} value={Math.round(cropY * 100)}
            onChange={(e) => {
              const { x, y, w } = clampCrop(cropX, Number(e.target.value) / 100, cropW);
              setCropX(x); setCropY(y); setCropW(w);
            }} className="flex-1" />
          <span className="text-xs text-gray-400">크기</span>
          <input type="range"
            min={Math.round(minCropW * 100)}
            max={Math.round(maxCropW * 100)}
            value={Math.round(cropW * 100)}
            onChange={(e) => {
              const { x, y, w } = clampCrop(cropX, cropY, Number(e.target.value) / 100);
              setCropX(x); setCropY(y); setCropW(w);
            }} className="flex-1" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
            취소
          </button>
          <button onClick={() => onConfirm(cropX, cropY, cropW)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
