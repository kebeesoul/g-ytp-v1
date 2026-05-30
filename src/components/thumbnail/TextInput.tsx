"use client";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TextInput({ value, onChange }: TextInputProps) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="vm-label">Text</span>
        <span className="text-[10px] text-[var(--vm-muted)]">{value.length}/20</span>
      </div>
      <input
        className="vm-input"
        value={value}
        maxLength={20}
        onChange={(event) => onChange(event.target.value)}
        placeholder="PLAYLIST"
      />
    </label>
  );
}
