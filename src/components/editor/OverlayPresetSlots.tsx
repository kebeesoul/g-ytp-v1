"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { OverlayPreset } from "@/lib/schema";

interface OverlayPresetSlotsProps {
  presets: (OverlayPreset | null)[];   // length 6, null = empty slot
  selectedId: string;
  onChange: (presetId: string) => void;
}

export function OverlayPresetSlots({ presets, selectedId, onChange }: OverlayPresetSlotsProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-700 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">오버레이 디자인</span>
        <Link href="/settings" className="text-xs text-green-400 hover:text-green-300">
          ⚙ 편집
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset, i) => {
          const slotId = `slot-${i + 1}`;
          const isEmpty = preset === null;

          if (isEmpty) {
            return (
              <Link
                key={slotId}
                href="/settings"
                className="flex flex-col items-center gap-1 rounded-md border border-dashed border-gray-700 p-2 text-center hover:border-gray-500"
              >
                <div className="flex h-9 w-full items-center justify-center rounded bg-gray-800 text-lg text-gray-700">
                  +
                </div>
                <span className="text-[10px] text-gray-700">슬롯 {i + 1}</span>
              </Link>
            );
          }

          const isSelected = selectedId === preset.id;

          return (
            <button
              key={slotId}
              onClick={() => onChange(preset.id)}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors ${
                isSelected
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-700 hover:border-gray-500"
              }`}
            >
              <SlotThumb preset={preset} />
              <span className={`text-[10px] ${isSelected ? "text-blue-400" : "text-gray-500"}`}>
                {preset.animation.animMemo
                  ? preset.animation.animMemo.slice(0, 8) + (preset.animation.animMemo.length > 8 ? "…" : "")
                  : `슬롯 ${i + 1}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotThumb({ preset }: { preset: OverlayPreset }) {
  const cardStyle: CSSProperties = preset.card.enabled
    ? {
        background: preset.color.background ?? "rgba(0,0,0,0.55)",
        borderRadius: Math.round(preset.card.radius / 4),
        padding: "2px 4px",
      }
    : {};

  return (
    <div
      className="relative flex h-9 w-full flex-col justify-end overflow-hidden rounded p-1"
      style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)" }}
    >
      <div style={cardStyle}>
        <div
          className="truncate text-left leading-tight"
          style={{
            fontSize: Math.round(preset.typography.artistFontSize / 5),
            color: preset.color.artist,
            fontWeight: preset.typography.artistWeight,
          }}
        >
          Artist
        </div>
        <div
          className="truncate text-left leading-tight"
          style={{
            fontSize: Math.round(preset.typography.titleFontSize / 5),
            color: preset.color.title,
            fontWeight: preset.typography.titleWeight,
          }}
        >
          Title
        </div>
      </div>
    </div>
  );
}
