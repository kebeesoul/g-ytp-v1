"use client";

import { useEffect, useRef, useState } from "react";
import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";
import { FONTS } from "@/lib/thumbnail/constants";

// top anchors: y = distance from top edge (positive = inside canvas)
// bottom anchors: y = distance above bottom edge (positive = inside canvas)
// right anchors: x = negative (e.g. -96 → 96px from right)
const POSITIONS = [
  { anchor: "top-center" as const,    label: "Top Center",  x: 0,   y: 100 },
  { anchor: "bottom-center" as const, label: "Bot Center",  x: 0,   y: 205 },
  { anchor: "bottom-left" as const,   label: "Bot Left",    x: 96,  y: 120 },
  { anchor: "bottom-right" as const,  label: "Bot Right",   x: -96, y: 120 },
] as const;

interface OverlayQuickEditorProps {
  preset: OverlayPreset | null;
  slotId: string;
  onSaved: (preset: OverlayPreset) => void;
  onDraftChange?: (draft: OverlayPreset | null) => void;
}

export function OverlayQuickEditor({ preset, slotId, onSaved, onDraftChange }: OverlayQuickEditorProps) {
  const [draft, setDraft] = useState<OverlayPreset | null>(preset);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(preset);
    setSaved(false);
    setError(null);
    onDraftChange?.(preset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, slotId]);

  if (!draft) return null;

  function updateDraft(next: OverlayPreset) {
    setDraft(next);
    setSaved(false);
    onDraftChange?.(next);
  }

  function setTypo<K extends keyof OverlayPreset["typography"]>(
    key: K,
    value: OverlayPreset["typography"][K]
  ) {
    if (!draft) return;
    updateDraft({ ...draft, typography: { ...draft.typography, [key]: value } });
  }

  function setColor(key: "artist" | "title", value: string) {
    if (!draft) return;
    updateDraft({ ...draft, color: { ...draft.color, [key]: value } });
  }

  function setAnchor(anchor: OverlayPreset["layout"]["anchor"], x: number, y: number) {
    if (!draft) return;
    updateDraft({ ...draft, layout: { ...draft.layout, anchor, x, y } });
  }

  async function handleSave() {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/overlay-presets/${slotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: { ...draft, id: slotId },
          name: draft.animation.animMemo ?? `슬롯 ${slotId.split("-")[1]}`,
        }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `저장 실패 (${res.status})`);
      }
      const updated = OverlayPresetSchema.parse(body);
      updateDraft(updated);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vm-panel vm-panel-pad flex flex-col gap-3">
      <span className="vm-label">Overlay Style</span>

      {/* Position */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--vm-muted)]">Position</span>
        <div className="grid grid-cols-4 gap-1">
          {POSITIONS.map(({ anchor, label, x, y }) => (
            <button
              key={anchor}
              type="button"
              onClick={() => setAnchor(anchor, x, y)}
              className={`py-1.5 text-[10px] border transition-colors ${
                draft.layout.anchor === anchor
                  ? "border-[var(--vm-cyan)] text-[var(--vm-cyan)] bg-[var(--vm-cyan)]/10"
                  : "border-[var(--vm-border)] text-[var(--vm-subtle)] hover:border-[var(--vm-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Artist */}
      <FontRow
        label="Artist"
        fontFamily={draft.typography.artistFontFamily}
        fontSize={draft.typography.artistFontSize}
        bold={draft.typography.artistWeight >= 700}
        italic={draft.typography.artistItalic}
        underline={draft.typography.artistUnderline}
        color={draft.color.artist}
        onFontFamily={(v) => setTypo("artistFontFamily", v)}
        onFontSize={(v) => setTypo("artistFontSize", v)}
        onBold={(v) => setTypo("artistWeight", v ? 700 : 400)}
        onItalic={(v) => setTypo("artistItalic", v)}
        onUnderline={(v) => setTypo("artistUnderline", v)}
        onColor={(v) => setColor("artist", v)}
      />

      {/* Title */}
      <FontRow
        label="Title"
        fontFamily={draft.typography.titleFontFamily}
        fontSize={draft.typography.titleFontSize}
        bold={draft.typography.titleWeight >= 700}
        italic={draft.typography.titleItalic}
        underline={draft.typography.titleUnderline}
        color={draft.color.title}
        onFontFamily={(v) => setTypo("titleFontFamily", v)}
        onFontSize={(v) => setTypo("titleFontSize", v)}
        onBold={(v) => setTypo("titleWeight", v ? 700 : 400)}
        onItalic={(v) => setTypo("titleItalic", v)}
        onUnderline={(v) => setTypo("titleUnderline", v)}
        onColor={(v) => setColor("title", v)}
      />

      {error && <p className="text-[10px] text-[var(--vm-error)]">{error}</p>}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="vm-button-secondary text-xs disabled:opacity-50"
      >
        {saving ? "저장 중..." : saved ? "저장됨 ✓" : "Save Style"}
      </button>
    </div>
  );
}

// ─── FontRow ──────────────────────────────────────────────────────────────────

interface FontRowProps {
  label: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  onFontFamily: (v: string) => void;
  onFontSize: (v: number) => void;
  onBold: (v: boolean) => void;
  onItalic: (v: boolean) => void;
  onUnderline: (v: boolean) => void;
  onColor: (v: string) => void;
}

function FontRow({
  label, fontFamily, fontSize, bold, italic, underline, color,
  onFontFamily, onFontSize, onBold, onItalic, onUnderline, onColor,
}: FontRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--vm-muted)]">{label}</span>
      <div className="flex items-center gap-1">
        <select
          value={fontFamily}
          onChange={(e) => onFontFamily(e.target.value)}
          className="vm-input min-w-0 flex-1 text-[11px]"
        >
          {FONTS.map((f) => (
            <option key={f.id} value={f.name}>{f.label}</option>
          ))}
        </select>
        <ScrubInput value={fontSize} min={8} max={120} onChange={onFontSize} />
        <BIU bold={bold} italic={italic} underline={underline} onBold={onBold} onItalic={onItalic} onUnderline={onUnderline} />
        <ColorSwatch value={color} onChange={onColor} />
      </div>
    </div>
  );
}

// ─── ScrubInput ───────────────────────────────────────────────────────────────

function ScrubInput({
  value, onChange, min = 1, max = 200,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const startY = useRef(0);
  const startVal = useRef(0);
  const hasDragged = useRef(false);

  function clamp(v: number) {
    return Math.max(min, Math.min(max, Math.round(v)));
  }

  function commitInput(raw: string) {
    const v = parseFloat(raw);
    if (!isNaN(v)) onChange(clamp(v));
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="number"
        value={inputVal}
        min={min}
        max={max}
        autoFocus
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={(e) => commitInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitInput((e.target as HTMLInputElement).value);
          if (e.key === "Escape") setEditing(false);
        }}
        className="vm-input w-12 text-center text-[11px]"
      />
    );
  }

  return (
    <div
      className="vm-input flex w-12 cursor-ns-resize select-none items-center justify-center text-[11px]"
      title="드래그로 조절 / 클릭해서 직접 입력"
      onPointerDown={(e) => {
        hasDragged.current = false;
        startY.current = e.clientY;
        startVal.current = value;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!(e.buttons & 1)) return;
        if (!hasDragged.current && Math.abs(e.clientY - startY.current) < 3) return;
        hasDragged.current = true;
        const delta = startY.current - e.clientY;
        onChange(clamp(startVal.current + delta));
      }}
      onPointerUp={() => {
        if (!hasDragged.current) {
          setInputVal(String(value));
          setEditing(true);
        }
      }}
    >
      {value}
    </div>
  );
}

// ─── BIU ─────────────────────────────────────────────────────────────────────

function BIU({
  bold, italic, underline, onBold, onItalic, onUnderline,
}: {
  bold: boolean; italic: boolean; underline: boolean;
  onBold: (v: boolean) => void;
  onItalic: (v: boolean) => void;
  onUnderline: (v: boolean) => void;
}) {
  const cls = (active: boolean) =>
    `h-7 w-7 flex items-center justify-center border text-[11px] transition-colors ${
      active
        ? "border-[var(--vm-cyan)] text-[var(--vm-cyan)] bg-[var(--vm-cyan)]/10"
        : "border-[var(--vm-border)] text-[var(--vm-subtle)] hover:border-[var(--vm-muted)]"
    }`;
  return (
    <div className="flex gap-0.5">
      <button type="button" onClick={() => onBold(!bold)} className={cls(bold)}>
        <span className="font-bold">B</span>
      </button>
      <button type="button" onClick={() => onItalic(!italic)} className={cls(italic)}>
        <span className="italic">I</span>
      </button>
      <button type="button" onClick={() => onUnderline(!underline)} className={cls(underline)}>
        <span className="underline">U</span>
      </button>
    </div>
  );
}

// ─── ColorSwatch ──────────────────────────────────────────────────────────────

function ColorSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = (() => {
    const rgba = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgba) {
      return `#${[rgba[1], rgba[2], rgba[3]]
        .map((n) => parseInt(n).toString(16).padStart(2, "0"))
        .join("")}`;
    }
    return value.startsWith("#") ? value : "#000000";
  })();
  return (
    <input
      type="color"
      value={hex}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-7 cursor-pointer border border-[var(--vm-border)] bg-transparent p-0.5"
      title="색상 선택"
    />
  );
}
