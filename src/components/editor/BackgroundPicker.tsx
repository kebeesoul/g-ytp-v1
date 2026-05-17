"use client";

import { useEffect, useRef, useState } from "react";
import { BackgroundSchema } from "@/lib/schema";
import type { Background } from "@/lib/schema";
import { getPublicUrl } from "@/lib/supabase/publicUrl";

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

  // Portrait when the image is taller than 16:9 ratio
  const isPortrait =
    imgNaturalSize !== null && imgNaturalSize.h / imgNaturalSize.w > 9 / 16;

  // 미리보기 Canvas 렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) {
      setImgNaturalSize(null);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const publicUrl = getPublicUrl(value.storagePath);
    const cropY = value.cropY ?? 0.5;

    if (value.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        drawCoverImage(ctx, img, canvas.width, canvas.height, DIM_DEFAULT, cropY);
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

      {/* Canvas 미리보기 */}
      <div className="relative overflow-hidden rounded-md border border-gray-700 bg-gray-900">
        <canvas
          ref={canvasRef}
          width={320}
          height={180}
          className="w-full"
        />
        {!value && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            미리보기 없음
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
            {isPortrait && value.kind === "image" && (
              <button
                onClick={() => setShowCropEditor(true)}
                className="text-blue-400 hover:text-blue-300"
              >
                ✂ 크롭 위치
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
          imageUrl={getPublicUrl(value.storagePath)}
          naturalSize={imgNaturalSize}
          initialCropY={value.cropY ?? 0.5}
          onConfirm={(cropY) => {
            onChange({ ...value, cropY });
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
  cropY: number = 0.5
) {
  const scale = Math.max(cw / source.naturalWidth, ch / source.naturalHeight);
  const sw = source.naturalWidth * scale;
  const sh = source.naturalHeight * scale;
  const sx = (cw - sw) / 2;
  // cropY: 0=top, 0.5=center, 1=bottom
  const sy = -(sh - ch) * cropY;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(source, sx, sy, sw, sh);

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
  initialCropY: number;
  onConfirm: (cropY: number) => void;
  onClose: () => void;
}

function CropEditor({
  imageUrl,
  naturalSize,
  initialCropY,
  onConfirm,
  onClose,
}: CropEditorProps) {
  const [cropY, setCropY] = useState(initialCropY);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Scale image to fit in a 320×420 bounding box while preserving aspect ratio
  const MAX_H = 420;
  const FULL_W = 320;
  const rawH = FULL_W * (naturalSize.h / naturalSize.w);
  const displayH = Math.min(MAX_H, rawH);
  const displayW = rawH > MAX_H ? Math.round(MAX_H * (naturalSize.w / naturalSize.h)) : FULL_W;
  const cropH = Math.round(displayW * (9 / 16));
  const maxTop = Math.max(0, displayH - cropH);
  const cropWindowTop = Math.round(maxTop * cropY);

  function updateCropY(clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relY = clientY - rect.top - cropH / 2;
    const clamped = Math.max(0, Math.min(maxTop, relY));
    setCropY(maxTop > 0 ? clamped / maxTop : 0.5);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-3 rounded-lg bg-gray-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium text-gray-200">크롭 위치 조정</span>
        <p className="text-xs text-gray-400">
          클릭 또는 드래그로 16:9 크롭 영역을 설정하세요.
        </p>

        {/* Image with crop overlay */}
        <div
          ref={containerRef}
          className="relative cursor-ns-resize select-none overflow-hidden rounded"
          style={{ width: displayW, height: displayH }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateCropY(e.clientY);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            updateCropY(e.clientY);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="배경"
            draggable={false}
            style={{ width: displayW, height: displayH, display: "block" }}
          />
          {/* Top dim */}
          {cropWindowTop > 0 && (
            <div
              className="pointer-events-none absolute left-0 top-0 w-full bg-black/60"
              style={{ height: cropWindowTop }}
            />
          )}
          {/* Bottom dim */}
          {cropWindowTop + cropH < displayH && (
            <div
              className="pointer-events-none absolute left-0 w-full bg-black/60"
              style={{ top: cropWindowTop + cropH, height: displayH - cropWindowTop - cropH }}
            />
          )}
          {/* 16:9 crop frame */}
          <div
            className="pointer-events-none absolute left-0 right-0 box-border border-2 border-yellow-400"
            style={{ top: cropWindowTop, height: cropH }}
          />
        </div>

        {/* Fine-tune slider */}
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-gray-400">
            위치 {Math.round(cropY * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(cropY * 100)}
            onChange={(e) => setCropY(Number(e.target.value) / 100)}
            className="flex-1"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(cropY)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
