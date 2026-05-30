"use client";

interface LetterSpacingSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function LetterSpacingSlider({ value, onChange }: LetterSpacingSliderProps) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="vm-label">Letter Spacing</span>
        <span className="text-[11px] text-[var(--vm-subtle)]">{value}px</span>
      </div>
      <input
        type="range"
        min={-20}
        max={80}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-[var(--vm-cyan)]"
      />
    </label>
  );
}
