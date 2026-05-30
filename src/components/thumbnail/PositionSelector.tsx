"use client";

import { POSITIONS, type PositionId } from "@/lib/thumbnail/constants";

interface PositionSelectorProps {
  value: PositionId;
  onChange: (value: PositionId) => void;
}

export function PositionSelector({ value, onChange }: PositionSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {POSITIONS.map((position) => (
        <button
          key={position.id}
          type="button"
          onClick={() => onChange(position.id)}
          className={`border px-4 py-2 text-[11px] ${
            value === position.id
              ? "border-[var(--vm-cyan)] text-[var(--vm-cyan)]"
              : "border-[var(--vm-border)] text-[var(--vm-text)]"
          }`}
        >
          {position.label}
        </button>
      ))}
    </div>
  );
}
