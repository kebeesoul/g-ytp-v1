"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadCanvas } from "@/lib/thumbnail/canvas";
import { DEFAULT_THUMBNAIL_SETTINGS } from "@/lib/thumbnail/constants";
import { BackgroundSchema } from "@/lib/schema";
import { ThumbnailPresetSchema, ThumbnailSettingsSchema } from "@/lib/thumbnail/schema";
import type { ColorId, FontId, OverlayId, PositionId, TextCaseId } from "@/lib/thumbnail/constants";
import type { ThumbnailPreset, ThumbnailSettings } from "@/lib/thumbnail/schema";
import { ColorPicker } from "./ColorPicker";
import { ExportButton } from "./ExportButton";
import { FontGrid } from "./FontGrid";
import { LetterSpacingSlider } from "./LetterSpacingSlider";
import { OverlaySelector } from "./OverlaySelector";
import { PhotoUploader } from "./PhotoUploader";
import { PositionSelector } from "./PositionSelector";
import { PresetSlots } from "./PresetSlots";
import { PreviewCanvas } from "./PreviewCanvas";
import { SelectImageButton } from "./SelectImageButton";
import { TextCaseSelector } from "./TextCaseSelector";
import { TextInput } from "./TextInput";
import { TextSizeSlider } from "./TextSizeSlider";

interface ThumbnailMakerProps {
  initialPresets: ThumbnailPreset[];
}

const SELECTED_THUMBNAIL_KEY = "gytp:selected-thumbnail-background";

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed"));
    }, "image/png");
  });
}

export function ThumbnailMaker({ initialPresets }: ThumbnailMakerProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [settings, setSettings] = useState<ThumbnailSettings>(
    ThumbnailSettingsSchema.parse(DEFAULT_THUMBNAIL_SETTINGS)
  );
  const [presets, setPresets] = useState<ThumbnailPreset[]>(initialPresets);
  const [status, setStatus] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const setPatch = useCallback((patch: Partial<ThumbnailSettings>) => {
    setSettings((prev) => ThumbnailSettingsSchema.parse({ ...prev, ...patch }));
  }, []);

  const refreshPresets = useCallback(async () => {
    const res = await fetch("/api/thumbnail/presets", { cache: "no-store" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? `preset load failed: ${res.status}`);
    }
    const data: unknown = await res.json();
    setPresets(ThumbnailPresetSchema.array().parse(data));
  }, []);

  useEffect(() => {
    return () => {
      if (photoSrc?.startsWith("blob:")) URL.revokeObjectURL(photoSrc);
    };
  }, [photoSrc]);

  async function handlePhoto(file: File) {
    const objectUrl = URL.createObjectURL(file);
    setPhotoSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return objectUrl;
    });

    const photoId = crypto.randomUUID();
    const formData = new FormData();
    formData.append("photoId", photoId);
    formData.append("file", file);

    const res = await fetch("/api/thumbnail/upload-photo", {
      method: "POST",
      body: formData,
    });
    const data = (await res.json().catch(() => null)) as { localPath?: string; error?: string } | null;
    if (!res.ok || !data?.localPath) {
      setStatus(data?.error ?? `Upload failed: ${res.status}`);
      return;
    }
    setLocalPath(data.localPath);
    setStatus("Photo imported");
  }

  async function handleSelectImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setStatus("Selecting image...");
    try {
      const blob = await canvasToPngBlob(canvas);
      const formData = new FormData();
      formData.append("file", new File([blob], "thumbnail.png", { type: "image/png" }));

      const res = await fetch("/api/thumbnail/select-image", {
        method: "POST",
        body: formData,
      });
      const raw: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const body = raw as { error?: string } | null;
        throw new Error(body?.error ?? `select failed: ${res.status}`);
      }

      const parsed = BackgroundSchema.safeParse(raw);
      if (!parsed.success) throw new Error("서버 응답 형식 오류");

      window.localStorage.setItem(SELECTED_THUMBNAIL_KEY, JSON.stringify(parsed.data));
      router.push("/editor?selectedThumbnail=1");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Select failed");
    }
  }

  const canExport = useMemo(() => !!photoSrc && !previewError, [photoSrc, previewError]);

  return (
    <div className="grid h-[calc(100vh-58px)] grid-cols-1 gap-5 overflow-y-auto p-5 xl:grid-cols-[minmax(360px,560px)_minmax(0,1fr)]">
      <section className="flex flex-col gap-5">
        <div className="vm-panel vm-panel-pad flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="vm-label">Thumbnail Maker</span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--vm-cyan)]">1280x720</span>
          </div>

          <PhotoUploader
            localPath={localPath}
            onFile={(file) => {
              void handlePhoto(file);
            }}
          />

          <TextInput value={settings.text} onChange={(text) => setPatch({ text })} />

          <TextCaseSelector
            value={settings.textCaseId}
            onChange={(textCaseId: TextCaseId) => setPatch({ textCaseId })}
          />

          <div className="flex flex-col gap-2">
            <span className="vm-label">Font</span>
            <FontGrid value={settings.fontId} onChange={(fontId: FontId) => setPatch({ fontId })} />
          </div>

          <TextSizeSlider value={settings.textSizePx} onChange={(textSizePx) => setPatch({ textSizePx })} />

          <LetterSpacingSlider
            value={settings.letterSpacingPx}
            onChange={(letterSpacingPx) => setPatch({ letterSpacingPx })}
          />

          <div className="flex flex-col gap-2">
            <span className="vm-label">Position</span>
            <PositionSelector value={settings.positionId} onChange={(positionId: PositionId) => setPatch({ positionId })} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="vm-label">Text Color</span>
            <ColorPicker value={settings.colorId} onChange={(colorId: ColorId) => setPatch({ colorId })} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="vm-label">Overlay</span>
            <OverlaySelector value={settings.overlayId} onChange={(overlayId: OverlayId) => setPatch({ overlayId })} />
          </div>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-5">
        <PreviewCanvas
          canvasRef={canvasRef}
          photoSrc={photoSrc}
          settings={settings}
          onError={setPreviewError}
        />

        {(status || previewError) && (
          <div className="vm-panel px-4 py-3 text-[11px] text-[var(--vm-subtle)]">
            {previewError ?? status}
          </div>
        )}

        <SelectImageButton
          disabled={!canExport}
          onClick={() => {
            void handleSelectImage();
          }}
        />

        <ExportButton
          disabled={!canExport}
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) downloadCanvas(canvas, `youtube-thumbnail-${Date.now()}.png`);
          }}
        />

        <div className="vm-panel vm-panel-pad flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="vm-label">Preset Slots</span>
            <span className="text-[10px] text-[var(--vm-muted)]">6 global slots</span>
          </div>
          <PresetSlots
            presets={presets}
            settings={settings}
            onLoad={(nextSettings) => {
              setSettings(nextSettings);
              setStatus("Preset loaded");
            }}
            onRefresh={refreshPresets}
            onStatus={setStatus}
          />
        </div>
      </section>
    </div>
  );
}
