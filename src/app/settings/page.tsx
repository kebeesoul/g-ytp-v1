"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";
import { PresetSidebar } from "@/components/settings/PresetSidebar";
import { PresetEditor } from "@/components/settings/PresetEditor";

export default function SettingsPage() {
  const [presets, setPresets] = useState<(OverlayPreset | null)[]>(Array(6).fill(null));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/overlay-presets")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: unknown) => {
        const result = z.array(OverlayPresetSchema).safeParse(data);
        if (!result.success) return;
        const slots: (OverlayPreset | null)[] = Array(6).fill(null);
        for (const preset of result.data) {
          const match = /^slot-(\d)$/.exec(preset.id);
          if (match) slots[parseInt(match[1], 10) - 1] = preset;
        }
        setPresets(slots);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
