"use client";

import { useState, useEffect } from "react";
import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";

interface PresetEditorProps {
  slotId: string; // "slot-1" ~ "slot-6"
  preset: OverlayPreset | null;
  onSaved: (preset: OverlayPreset) => void;
}

const ANCHOR_OPTIONS = [
  "top-left", "top-center", "top-right",
  "center",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

function defaultDraft(slotId: string): OverlayPreset {
  return OverlayPresetSchema.parse({ id: slotId, version: 1 });
}

export function PresetEditor({ slotId, preset, onSaved }: PresetEditorProps) {
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<OverlayPreset>(() => preset ?? defaultDraft(slotId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Reset form when slot changes
  useEffect(() => {
    setDraft(preset ?? defaultDraft(slotId));
    setName(preset?.animation.animMemo ?? "");
    setError(null);
    setSaved(false);
  }, [slotId, preset]);

  function set<K extends keyof OverlayPreset>(
    section: K,
    key: keyof OverlayPreset[K],
    value: unknown
  ) {
    setDraft((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as object), [key]: value },
    }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/overlay-presets/${slotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: { ...draft, id: slotId }, name: name || `슬롯 ${slotId.split("-")[1]}` }),
      });

      const body: unknown = await res.json();
      if (!res.ok) {
        const err = body as { error?: string };
        throw new Error(err.error ?? `저장 실패 (${res.status})`);
      }

      const updated = OverlayPresetSchema.parse(body);
      setDraft(updated);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Memo / Name */}
      <Section title="기본">
        <Field label="메모 (슬롯 이름)">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              set("animation", "animMemo", e.target.value);
              setSaved(false);
            }}
            placeholder="ex) 로파이 화이트"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Layout */}
      <Section title="레이아웃">
        <Field label="기준점">
          <select
            value={draft.layout.anchor}
            onChange={(e) => set("layout", "anchor", e.target.value)}
            className={inputCls}
          >
            {ANCHOR_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="X 오프셋">
            <NumInput value={draft.layout.x} onChange={(v) => set("layout", "x", v)} />
          </Field>
          <Field label="Y 오프셋">
            <NumInput value={draft.layout.y} onChange={(v) => set("layout", "y", v)} />
          </Field>
          <Field label="Safe Margin X">
            <NumInput value={draft.layout.safeMarginX} onChange={(v) => set("layout", "safeMarginX", v)} min={0} />
          </Field>
          <Field label="Safe Margin Y">
            <NumInput value={draft.layout.safeMarginY} onChange={(v) => set("layout", "safeMarginY", v)} min={0} />
          </Field>
        </div>
      </Section>

      {/* Typography */}
      <Section title="타이포그래피">
        <div className="grid grid-cols-2 gap-3">
          <Field label="아티스트 폰트 크기">
            <NumInput value={draft.typography.artistFontSize} onChange={(v) => set("typography", "artistFontSize", v)} min={8} />
          </Field>
          <Field label="제목 폰트 크기">
            <NumInput value={draft.typography.titleFontSize} onChange={(v) => set("typography", "titleFontSize", v)} min={8} />
          </Field>
          <Field label="아티스트 굵기">
            <NumInput value={draft.typography.artistWeight} onChange={(v) => set("typography", "artistWeight", v)} min={100} max={900} step={100} />
          </Field>
          <Field label="제목 굵기">
            <NumInput value={draft.typography.titleWeight} onChange={(v) => set("typography", "titleWeight", v)} min={100} max={900} step={100} />
          </Field>
          <Field label="줄 높이">
            <NumInput value={draft.typography.lineHeight} onChange={(v) => set("typography", "lineHeight", v)} min={0.5} max={3} step={0.05} />
          </Field>
          <Field label="자간">
            <NumInput value={draft.typography.letterSpacing} onChange={(v) => set("typography", "letterSpacing", v)} step={0.1} />
          </Field>
          <Field label="최대 줄 수 (제목)">
            <NumInput value={draft.typography.maxLinesTitle} onChange={(v) => set("typography", "maxLinesTitle", v)} min={1} max={10} />
          </Field>
          <Field label="정렬">
            <select
              value={draft.typography.textAlign}
              onChange={(e) => set("typography", "textAlign", e.target.value)}
              className={inputCls}
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
          </Field>
        </div>
        <Field label="아티스트 폰트">
          <input
            type="text"
            value={draft.typography.artistFontFamily}
            onChange={(e) => set("typography", "artistFontFamily", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="제목 폰트">
          <input
            type="text"
            value={draft.typography.titleFontFamily}
            onChange={(e) => set("typography", "titleFontFamily", e.target.value)}
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Colors */}
      <Section title="색상">
        <div className="grid grid-cols-2 gap-3">
          <Field label="아티스트 색상">
            <ColorInput value={draft.color.artist} onChange={(v) => set("color", "artist", v)} />
          </Field>
          <Field label="제목 색상">
            <ColorInput value={draft.color.title} onChange={(v) => set("color", "title", v)} />
          </Field>
          <Field label="배경 색상">
            <ColorInput value={draft.color.background ?? "#000000"} onChange={(v) => set("color", "background", v)} />
          </Field>
          <Field label="그림자 색상">
            <ColorInput value={draft.color.shadow ?? "#000000"} onChange={(v) => set("color", "shadow", v)} />
          </Field>
        </div>
      </Section>

      {/* Card */}
      <Section title="카드 배경">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.card.enabled}
            onChange={(e) => set("card", "enabled", e.target.checked)}
            className="rounded"
          />
          카드 배경 사용
        </label>
        {draft.card.enabled && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Padding X">
              <NumInput value={draft.card.paddingX} onChange={(v) => set("card", "paddingX", v)} min={0} />
            </Field>
            <Field label="Padding Y">
              <NumInput value={draft.card.paddingY} onChange={(v) => set("card", "paddingY", v)} min={0} />
            </Field>
            <Field label="Radius">
              <NumInput value={draft.card.radius} onChange={(v) => set("card", "radius", v)} min={0} />
            </Field>
            <Field label="Blur">
              <NumInput value={draft.card.blur} onChange={(v) => set("card", "blur", v)} min={0} />
            </Field>
            <Field label="Opacity">
              <NumInput value={draft.card.opacity} onChange={(v) => set("card", "opacity", v)} min={0} max={1} step={0.05} />
            </Field>
          </div>
        )}
      </Section>

      {/* Animation */}
      <Section title="애니메이션">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fade In (초)">
            <NumInput value={draft.animation.fadeInSec} onChange={(v) => set("animation", "fadeInSec", v)} min={0} step={0.1} />
          </Field>
          <Field label="Fade Out (초)">
            <NumInput value={draft.animation.fadeOutSec} onChange={(v) => set("animation", "fadeOutSec", v)} min={0} step={0.1} />
          </Field>
        </div>
      </Section>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {saving ? "저장 중..." : saved ? "저장됨 ✓" : "저장"}
      </button>
    </form>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</span>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={inputCls}
    />
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value.startsWith("rgba") ? "#000000" : value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-gray-600 bg-transparent p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} flex-1`}
        placeholder="#FFFFFF"
      />
    </div>
  );
}
