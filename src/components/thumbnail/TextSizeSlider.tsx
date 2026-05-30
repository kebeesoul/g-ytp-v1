"use client";

interface TextSizeSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function TextSizeSlider({ value, onChange }: TextSizeSliderProps) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="vm-label">Text Size</span>
        <span className="text-[11px] text-[var(--vm-subtle)]">{value}px</span>
      </div>
      <input
        type="range"
        min={50}
        max={280}
        step={2}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-[var(--vm-cyan)]"
      />
    </label>
  );
}
