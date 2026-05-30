"use client";

import { useEffect, type RefObject } from "react";
import { drawThumbnail } from "@/lib/thumbnail/canvas";
import type { ThumbnailSettings } from "@/lib/thumbnail/schema";

interface PreviewCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  photoSrc: string | null;
  settings: ThumbnailSettings;
  onError: (message: string | null) => void;
}

export function PreviewCanvas({ canvasRef, photoSrc, settings, onError }: PreviewCanvasProps) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photoSrc) return;

    let cancelled = false;
    drawThumbnail(canvas, photoSrc, settings)
      .then(() => {
        if (!cancelled) onError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(err instanceof Error ? err.message : "Preview render failed");
      });

    return () => {
      cancelled = true;
    };
  }, [canvasRef, photoSrc, settings, onError]);

  return (
    <div className="vm-panel bg-black p-3">
      <div className="aspect-video w-full overflow-hidden bg-[#050505]">
        {photoSrc ? (
          <canvas ref={canvasRef} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-[var(--vm-muted)]">
            No Photo
          </div>
        )}
      </div>
    </div>
  );
}
