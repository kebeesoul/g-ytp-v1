"use client";

import { FONTS, type FontId } from "@/lib/thumbnail/constants";

interface FontGridProps {
  value: FontId;
  onChange: (value: FontId) => void;
}

export function FontGrid({ value, onChange }: FontGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {FONTS.map((font) => (
        <button
          key={font.id}
          type="button"
          onClick={() => onChange(font.id)}
          className={`border px-3 py-3 text-left transition-colors ${
            value === font.id
              ? "border-[var(--vm-cyan)] bg-[rgba(0,214,200,0.08)] text-white"
              : "border-[var(--vm-border)] bg-[#0b0b0b] text-[var(--vm-text)] hover:border-[var(--vm-border-strong)]"
          }`}
        >
          <span className="block text-[11px] uppercase tracking-[0.14em]">{font.label}</span>
          <span className="mt-1 block text-[10px] text-[var(--vm-muted)]">{font.tag}</span>
        </button>
      ))}
    </div>
  );
}
