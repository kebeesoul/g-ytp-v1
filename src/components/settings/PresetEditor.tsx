"use client";

import { useState, useEffect, useRef } from "react";
import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";
import { FONTS } from "@/lib/thumbnail/constants";

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

  // Sync draft/name when slot changes or preset is updated from outside (e.g. after save)
  useEffect(() => {
    setDraft(preset ?? defaultDraft(slotId));
    setName(preset?.animation.animMemo ?? "");
    setError(null);
  }, [slotId, preset]);

  // Reset saved indicator only when navigating to a different slot
  useEffect(() => {
    setSaved(false);
  }, [slotId]);

  // Load Google Fonts for the preview
  useEffect(() => {
    const googleKeys = FONTS.filter((f) => f.googleKey).map((f) => f.googleKey!);
    const url = `https://fonts.googleapis.com/css2?${googleKeys.map((k) => `family=${k}`).join("&")}&display=swap`;
    if (!document.querySelector("link[data-gf-overlay]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.dataset.gfOverlay = "1";
      document.head.appendChild(link);
    }
  }, []);

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
    if (saving) return;
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
    <div className="flex flex-col gap-5">
      <PresetPreview draft={draft} />
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
          <FontSelect
            value={draft.typography.artistFontFamily}
            onChange={(v) => set("typography", "artistFontFamily", v)}
          />
        </Field>
        <Field label="제목 폰트">
          <FontSelect
            value={draft.typography.titleFontFamily}
            onChange={(v) => set("typography", "titleFontFamily", v)}
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
    </div>
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
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      className={inputCls}
    />
  );
}

// ─── PresetPreview ────────────────────────────────────────────────────────────

const PREVIEW_SCALE = 480 / 1920; // 1/4 of full 1920×1080

function PresetPreview({ draft }: { draft: OverlayPreset }) {
  const titleLineH = Math.ceil(
    draft.typography.titleFontSize * draft.typography.lineHeight
  );
  // FFmpeg: y<0 means bottom-relative (h+y), so title top y in 1080p frame
  const yAbsolute = draft.layout.y < 0 ? 1080 + draft.layout.y : draft.layout.y;
  const yArtistAbsolute = yAbsolute - titleLineH;

  const xPx = Math.max(0, draft.layout.x * PREVIEW_SCALE);
  const yArtistPx = yArtistAbsolute * PREVIEW_SCALE;

  const artistFont = FONTS.find((f) => f.name === draft.typography.artistFontFamily);
  const titleFont = FONTS.find((f) => f.name === draft.typography.titleFontFamily);
  const artistCss = artistFont?.family ?? draft.typography.artistFontFamily;
  const titleCss = titleFont?.family ?? draft.typography.titleFontFamily;

  const cardStyle: React.CSSProperties = draft.card.enabled
    ? {
        background: draft.color.background ?? "rgba(0,0,0,0.55)",
        borderRadius: draft.card.radius * PREVIEW_SCALE,
        padding: `${draft.card.paddingY * PREVIEW_SCALE}px ${draft.card.paddingX * PREVIEW_SCALE}px`,
        opacity: draft.card.opacity,
      }
    : {};

  return (
    <div
      className="relative overflow-hidden rounded-md"
      style={{
        width: 480,
        height: 270,
        background: "linear-gradient(135deg,#1a1a2e 0%,#0f3460 55%,#16213e 100%)",
        flexShrink: 0,
      }}
    >
      {/* Scale label */}
      <span className="absolute top-1.5 right-2 text-[9px] text-white/30 select-none">
        미리보기 (1/4)
      </span>
      {/* Text block */}
      <div
        style={{
          position: "absolute",
          left: xPx,
          top: Math.max(0, yArtistPx),
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontFamily: artistCss,
              fontSize: draft.typography.artistFontSize * PREVIEW_SCALE,
              fontWeight: draft.typography.artistWeight,
              color: draft.color.artist,
              whiteSpace: "nowrap",
              textAlign: draft.typography.textAlign,
            }}
          >
            Artist Name
          </div>
          <div
            style={{
              fontFamily: titleCss,
              fontSize: draft.typography.titleFontSize * PREVIEW_SCALE,
              fontWeight: draft.typography.titleWeight,
              color: draft.color.title,
              whiteSpace: "nowrap",
              textAlign: draft.typography.textAlign,
              marginTop: 2,
            }}
          >
            Track Title
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FontSelect ───────────────────────────────────────────────────────────────

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = FONTS.find((f) => f.name === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between gap-2`}
      >
        <span style={{ fontFamily: selected?.family ?? undefined }}>
          {selected?.label ?? value}
        </span>
        {selected && (
          <span className="shrink-0 text-[10px] text-gray-500">{selected.tag}</span>
        )}
        <span className="shrink-0 text-gray-500">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-600 bg-gray-800 shadow-xl">
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { onChange(f.name); setOpen(false); }}
              className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 hover:bg-gray-700 transition-colors ${
                value === f.name ? "bg-blue-500/20 text-blue-300" : "text-white"
              }`}
            >
              <span style={{ fontFamily: f.family }} className="text-sm">
                {f.label}
              </span>
              <span className="shrink-0 text-[10px] text-gray-500">{f.tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Derive a hex value the color picker can display — strip alpha from rgba if needed.
  const pickerValue = (() => {
    const rgba = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgba) {
      return `#${[rgba[1], rgba[2], rgba[3]].map((n) => parseInt(n).toString(16).padStart(2, "0")).join("")}`;
    }
    return value.startsWith("#") ? value : "#000000";
  })();

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={pickerValue}
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
