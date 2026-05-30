"use client";

import { TEXT_COLORS, type ColorId } from "@/lib/thumbnail/constants";

interface ColorPickerProps {
  value: ColorId;
  onChange: (value: ColorId) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TEXT_COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          onClick={() => onChange(color.id)}
          className={`flex items-center gap-2 border px-3 py-2 text-[11px] ${
            value === color.id ? "border-[var(--vm-cyan)]" : "border-[var(--vm-border)]"
          }`}
        >
          <span
            className="h-4 w-4 rounded-full border border-white/20"
            style={{ backgroundColor: color.hex }}
          />
          {color.label}
        </button>
      ))}
    </div>
  );
}
