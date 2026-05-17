"use client";

import type { CSSProperties } from "react";
import type { OverlayPreset } from "@/lib/schema";

interface PresetSidebarProps {
  presets: (OverlayPreset | null)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function PresetSidebar({ presets, selectedIndex, onSelect }: PresetSidebarProps) {
  return (
    <div className="flex flex-col gap-1">
      {presets.map((preset, i) => {
        const isSelected = selectedIndex === i;
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
              isSelected
                ? "border-blue-500 bg-blue-500/10"
                : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50"
            }`}
          >
            <MiniThumb preset={preset} />
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-medium truncate ${isSelected ? "text-blue-300" : "text-gray-300"}`}>
                {preset?.animation.animMemo ?? `슬롯 ${i + 1}`}
              </span>
              <span className="text-[10px] text-gray-600">
                {preset ? `slot-${i + 1}` : "비어있음"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MiniThumb({ preset }: { preset: OverlayPreset | null }) {
  if (!preset) {
    return (
      <div className="h-8 w-12 flex-shrink-0 rounded bg-gray-800 flex items-center justify-center text-gray-700 text-sm">
        +
      </div>
    );
  }

  const cardStyle: CSSProperties = preset.card.enabled
    ? {
        background: preset.color.background ?? "rgba(0,0,0,0.55)",
        borderRadius: Math.round(preset.card.radius / 6),
        padding: "1px 3px",
      }
    : {};

  return (
    <div
      className="h-8 w-12 flex-shrink-0 rounded flex flex-col justify-end overflow-hidden p-0.5"
      style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)" }}
    >
      <div style={cardStyle}>
        <div
          className="truncate leading-tight"
          style={{ fontSize: 5, color: preset.color.artist, fontWeight: preset.typography.artistWeight }}
        >
          Artist
        </div>
        <div
          className="truncate leading-tight"
          style={{ fontSize: 6, color: preset.color.title, fontWeight: preset.typography.titleWeight }}
        >
          Title
        </div>
      </div>
    </div>
  );
}
