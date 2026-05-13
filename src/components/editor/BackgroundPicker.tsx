"use client";

import { useEffect, useRef, useState } from "react";
import { BackgroundSchema } from "@/lib/schema";
import type { Background } from "@/lib/schema";
import { getPublicUrl } from "@/lib/supabase/storage";

interface BackgroundPickerProps {
  editorSessionId: string;
  value: Background | null;
  onChange: (bg: Background | null) => void;
}

// v1 기본값 (§4 스키마 슬롯 확보, UI 노출 안 함)
const BG_DEFAULTS = {
  fit: "cover" as const,
  dim: 0.25,
  blur: 0,
  cropPosition: "center" as const,
};

export function BackgroundPicker({
  editorSessionId,
  value,
  onChange,
}: BackgroundPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 미리보기 Canvas 렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const publicUrl = getPublicUrl(value.storagePath);

    if (value.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        drawCoverImage(ctx, img, canvas.width, canvas.height, BG_DEFAULTS.dim);
      };
      img.src = publicUrl;
    } else {
      // 비디오 — 첫 프레임 캡처
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.src = publicUrl;
      video.currentTime = 0;
      video.addEventListener(
        "seeked",
        () => {
          drawCoverVideo(ctx, video, canvas.width, canvas.height, BG_DEFAULTS.dim);
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
          <button
            onClick={() => onChange(null)}
            className="text-red-400 hover:text-red-300"
          >
            제거
          </button>
        </div>
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
  dim: number
) {
  const scale = Math.max(cw / source.naturalWidth, ch / source.naturalHeight);
  const sw = source.naturalWidth * scale;
  const sh = source.naturalHeight * scale;
  const sx = (cw - sw) / 2;
  const sy = (ch - sh) / 2;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(source, sx, sy, sw, sh);

  // dim 오버레이 (§12.2 dim=0.25)
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
