"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { z } from "zod";
import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";
import { PresetEditor, PresetPreview } from "@/components/settings/PresetEditor";

export default function SettingsPage() {
  const [presets, setPresets] = useState<(OverlayPreset | null)[]>(Array(6).fill(null));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveDraft, setLiveDraft] = useState<OverlayPreset | null>(null);
  const positionSyncRef = useRef<((x: number, y: number) => void) | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  function loadPresets() {
    setLoading(true);
    setFetchError(null);
    fetch("/api/overlay-presets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`서버 오류 (${r.status})`))))
      .then((data: unknown) => {
        const result = z.array(OverlayPresetSchema).safeParse(data);
        if (!result.success) {
          setFetchError("프리셋 데이터 형식 오류");
          return;
        }
        const slots: (OverlayPreset | null)[] = Array(6).fill(null);
        for (const preset of result.data) {
          const match = /^slot-(\d)$/.exec(preset.id);
          if (match) slots[parseInt(match[1], 10) - 1] = preset;
        }
        setPresets(slots);
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : "프리셋 로드 실패");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPresets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-select slot from URL param (?slot=N)
  useEffect(() => {
    const slot = new URLSearchParams(window.location.search).get("slot");
    if (slot) {
      const n = parseInt(slot, 10) - 1;
      if (n >= 0 && n < 6) setSelectedIndex(n);
    }
  }, []);

  function handleSaved(preset: OverlayPreset) {
    setPresets((prev) => {
      const next = [...prev];
      next[selectedIndex] = preset;
      return next;
    });
  }

  function handleSelectSlot(index: number) {
    setSelectedIndex(index);
    setLiveDraft(null);
    positionSyncRef.current = null;
  }

  function handlePositionChange(x: number, y: number) {
    setLiveDraft((prev) => prev ? { ...prev, layout: { ...prev.layout, x, y } } : prev);
    positionSyncRef.current?.(x, y);
  }

  const slotId = `slot-${selectedIndex + 1}`;
  const previewDraft = liveDraft ?? presets[selectedIndex];

  return (
    <div className="h-[calc(100vh-58px)] overflow-y-auto bg-gray-950 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-base font-semibold text-white">오버레이 프리셋 설정</h1>

        {loading ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : fetchError ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-400">오류: {fetchError}</p>
            <button
              onClick={loadPresets}
              className="text-xs text-gray-400 underline hover:text-white"
            >
              재시도
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[500px_1fr] gap-6 items-start">
            {/* Left Rail: Preview + Slot Grid */}
            <div className="flex flex-col gap-4">
              {/* Preview */}
              <div className="overflow-hidden rounded-md border border-gray-700">
                {previewDraft
                  ? <PresetPreview draft={previewDraft} onPositionChange={handlePositionChange} />
                  : <div className="flex items-center justify-center bg-gray-900" style={{ width: 480, height: 270 }}>
                      <span className="text-xs text-gray-600">슬롯을 선택하세요</span>
                    </div>
                }
              </div>

              {/* Slot Grid 2×3 */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">슬롯</span>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((preset, i) => {
                    const isSelected = selectedIndex === i;
                    const cardStyle: CSSProperties = preset?.card.enabled
                      ? { background: preset.color.background ?? "rgba(0,0,0,0.55)", borderRadius: Math.round((preset.card.radius ?? 0) / 4), padding: "2px 4px" }
                      : {};
                    return (
                      <button
                        key={i}
                        onClick={() => handleSelectSlot(i)}
                        className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                          isSelected
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50"
                        }`}
                      >
                        {/* Mini thumb */}
                        <div
                          className="h-8 w-12 flex-shrink-0 rounded flex flex-col justify-end overflow-hidden p-0.5"
                          style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)" }}
                        >
                          {preset ? (
                            <div style={cardStyle}>
                              <div className="truncate leading-tight" style={{ fontSize: 5, color: preset.color.artist, fontWeight: preset.typography.artistWeight }}>Artist</div>
                              <div className="truncate leading-tight" style={{ fontSize: 6, color: preset.color.title, fontWeight: preset.typography.titleWeight }}>Title</div>
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-700 text-sm">+</div>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className={`text-xs font-medium truncate ${isSelected ? "text-blue-300" : "text-gray-300"}`}>
                            {preset?.animation.animMemo ?? `슬롯 ${i + 1}`}
                          </span>
                          <span className="text-[10px] text-gray-600">{preset ? `slot-${i + 1}` : "비어있음"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Editor */}
            <div className="rounded-md border border-gray-700 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-300">
                  {presets[selectedIndex]?.animation.animMemo ?? `슬롯 ${selectedIndex + 1}`}
                </span>
                <span className="text-xs text-gray-600">{slotId}</span>
              </div>
              <PresetEditor
                key={slotId}
                slotId={slotId}
                preset={presets[selectedIndex]}
                onSaved={handleSaved}
                onDraftChange={setLiveDraft}
                onRegisterPositionSync={(fn) => {
                  positionSyncRef.current = fn;
                  return () => { positionSyncRef.current = null; };
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
