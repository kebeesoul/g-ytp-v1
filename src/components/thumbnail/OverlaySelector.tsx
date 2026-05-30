"use client";

import { OVERLAYS, type OverlayId } from "@/lib/thumbnail/constants";

interface OverlaySelectorProps {
  value: OverlayId;
  onChange: (value: OverlayId) => void;
}

export function OverlaySelector({ value, onChange }: OverlaySelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {OVERLAYS.map((overlay) => (
        <button
          key={overlay.id}
          type="button"
          onClick={() => onChange(overlay.id)}
          className={`border px-3 py-2 text-[11px] ${
            value === overlay.id
              ? "border-[var(--vm-cyan)] text-[var(--vm-cyan)]"
              : "border-[var(--vm-border)] text-[var(--vm-text)]"
          }`}
        >
          {overlay.label}
        </button>
      ))}
    </div>
  );
}
