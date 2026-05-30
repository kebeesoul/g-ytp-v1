"use client";

import { TEXT_CASES } from "@/lib/thumbnail/constants";
import type { TextCaseId } from "@/lib/thumbnail/constants";

interface TextCaseSelectorProps {
  value: TextCaseId;
  onChange: (value: TextCaseId) => void;
}

export function TextCaseSelector({ value, onChange }: TextCaseSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="vm-label">Text Case</span>
      <div className="flex flex-wrap gap-2">
        {TEXT_CASES.map((textCase) => (
          <button
            key={textCase.id}
            type="button"
            onClick={() => onChange(textCase.id)}
            className={`border px-3 py-2 text-[11px] transition-colors ${
              value === textCase.id
                ? "border-[var(--vm-cyan)] text-[var(--vm-cyan)]"
                : "border-[var(--vm-border)] text-[var(--vm-text)]"
            }`}
          >
            {textCase.label}
          </button>
        ))}
      </div>
    </div>
  );
}
