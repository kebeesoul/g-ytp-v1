"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";
import { PresetSidebar } from "@/components/settings/PresetSidebar";
import { PresetEditor } from "@/components/settings/PresetEditor";

async function fetchPresets(): Promise<(OverlayPreset | null)[]> {
  const res = await fetch("/api/overlay-presets");
  if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
  const data: unknown = await res.json();
  const result = z.array(OverlayPresetSchema).safeParse(data);
  if (!result.success) throw new Error("프리셋 데이터 형식 오류");
  const slots: (OverlayPreset | null)[] = Array(6).fill(null);
  for (const preset of result.data) {
    const match = /^slot-(\d)$/.exec(preset.id);
    if (match) slots[parseInt(match[1], 10) - 1] = preset;
  }
  return slots;
}

export default function SettingsPage() {
  const [presets, setPresets] = useState<(OverlayPreset | null)[]>(Array(6).fill(null));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  function loadPresets() {
    setLoading(true);
    setFetchError(null);
    fetchPresets()
      .then(setPresets)
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : "프리셋 로드 실패");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    fetchPresets()
      .then((slots) => {
        if (!cancelled) setPresets(slots);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : "프리셋 로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSaved(preset: OverlayPreset) {
    setPresets((prev) => {
      const next = [...prev];
      next[selectedIndex] = preset;
      return next;
    });
  }

  const slotId = `slot-${selectedIndex + 1}`;

  return (
    <div className="min-h-full bg-gray-950 px-6 py-8">
      <div className="mx-auto max-w-4xl">
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
          <div className="grid grid-cols-[180px_1fr] gap-6">
            {/* Sidebar */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">슬롯</span>
              <PresetSidebar
                presets={presets}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
              />
            </div>

            {/* Editor */}
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
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
