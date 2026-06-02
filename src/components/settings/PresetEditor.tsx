"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";
import { FONTS } from "@/lib/thumbnail/constants";

interface PresetEditorProps {
  slotId: string; // "slot-1" ~ "slot-6"
  preset: OverlayPreset | null;
  onSaved: (preset: OverlayPreset) => void;
  onDraftChange?: (draft: OverlayPreset) => void;
  /** Called once on mount; receives a setter fn the page can call to push x/y from preview drag */
  onRegisterPositionSync?: (fn: (x: number, y: number) => void) => () => void;
}

function defaultDraft(slotId: string): OverlayPreset {
  return OverlayPresetSchema.parse({ id: slotId, version: 1 });
}

export function PresetEditor({ slotId, preset, onSaved, onDraftChange, onRegisterPositionSync }: PresetEditorProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<OverlayPreset>(() => preset ?? defaultDraft(slotId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Sync draft/name when slot changes or preset is updated from outside (e.g. after save)
  useEffect(() => {
    const d = preset ?? defaultDraft(slotId);
    queueMicrotask(() => {
      setDraft(d);
      setName(preset?.animation.animMemo ?? "");
      setError(null);
      onDraftChange?.(d);
    });
  }, [slotId, preset, onDraftChange]);

  // Reset saved indicator only when navigating to a different slot
  useEffect(() => {
    queueMicrotask(() => setSaved(false));
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

  // Allow the page's preview drag to push x/y back into this editor's draft
  useEffect(() => {
    if (!onRegisterPositionSync) return;
    return onRegisterPositionSync((x, y) => {
      setDraft((prev) => {
        const next = { ...prev, layout: { ...prev.layout, x, y } };
        onDraftChange?.(next);
        return next;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof OverlayPreset>(
    section: K,
    key: keyof OverlayPreset[K],
    value: unknown
  ) {
    setDraft((prev) => {
      const next = { ...prev, [section]: { ...(prev[section] as object), [key]: value } };
      onDraftChange?.(next);
      return next;
    });
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

      // Update editor draft localStorage to pre-select this slot, then navigate
      try {
        const raw = window.localStorage.getItem("gytp:editor-draft");
        const editorDraft = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        window.localStorage.setItem("gytp:editor-draft", JSON.stringify({ ...editorDraft, overlayPresetId: slotId }));
      } catch {}
      setTimeout(() => router.push("/editor"), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Slot name */}
      <Field label="슬롯 이름">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            set("animation", "animMemo", e.target.value || undefined);
          }}
          placeholder={`슬롯 ${slotId.split("-")[1]}`}
          className={inputCls}
        />
      </Field>

      {/* Layout — X/Y only; position can also be set by dragging the preview */}
      <Section title="위치">
        <p className="text-[10px] text-gray-600">미리보기에서 텍스트를 드래그하면 위치가 바뀝니다</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="X 오프셋">
            <ScrubInput value={draft.layout.x} onChange={(v) => set("layout", "x", v)} step={2} />
            <button
              type="button"
              onClick={() => set("layout", "x", 480)}
              className="mt-1 w-full rounded py-1 text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
            >
              X 센터
            </button>
          </Field>
          <Field label="Y 오프셋">
            <ScrubInput value={draft.layout.y} onChange={(v) => set("layout", "y", v)} step={2} />
            <button
              type="button"
              onClick={() => set("layout", "y", -760)}
              className="mt-1 w-full rounded py-1 text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
            >
              Y 센터
            </button>
          </Field>
        </div>
      </Section>

      {/* Typography */}
      <Section title="타이포그래피">
        <div className="grid grid-cols-2 gap-3">
          <Field label="아티스트 폰트 크기">
            <ScrubInput value={draft.typography.artistFontSize} onChange={(v) => set("typography", "artistFontSize", v)} min={8} max={120} />
          </Field>
          <Field label="제목 폰트 크기">
            <ScrubInput value={draft.typography.titleFontSize} onChange={(v) => set("typography", "titleFontSize", v)} min={8} max={120} />
          </Field>
          <Field label="행간">
            <ScrubInput value={draft.typography.lineHeight} onChange={(v) => set("typography", "lineHeight", v)} min={-100} max={200} step={1} />
          </Field>
          <Field label="자간">
            <ScrubInput value={draft.typography.letterSpacing} onChange={(v) => set("typography", "letterSpacing", v)} step={1} />
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
            onChange={(v) => {
              set("typography", "artistFontFamily", v);
              const font = FONTS.find((f) => f.name === v);
              if (font) set("typography", "artistWeight", parseInt(font.weight, 10));
            }}
          />
          <StyleToggle
            bold={draft.typography.artistWeight >= 700}
            italic={draft.typography.artistItalic}
            underline={draft.typography.artistUnderline}
            onBold={(v) => set("typography", "artistWeight", v ? 700 : 400)}
            onItalic={(v) => set("typography", "artistItalic", v)}
            onUnderline={(v) => set("typography", "artistUnderline", v)}
          />
        </Field>
        <Field label="제목 폰트">
          <FontSelect
            value={draft.typography.titleFontFamily}
            onChange={(v) => {
              set("typography", "titleFontFamily", v);
              const font = FONTS.find((f) => f.name === v);
              if (font) set("typography", "titleWeight", parseInt(font.weight, 10));
            }}
          />
          <StyleToggle
            bold={draft.typography.titleWeight >= 700}
            italic={draft.typography.titleItalic}
            underline={draft.typography.titleUnderline}
            onBold={(v) => set("typography", "titleWeight", v ? 700 : 400)}
            onItalic={(v) => set("typography", "titleItalic", v)}
            onUnderline={(v) => set("typography", "titleUnderline", v)}
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
        </div>
      </Section>

      {/* Animation */}
      <Section title="애니메이션">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fade In (초)">
            <ScrubInput value={draft.animation.fadeInSec} onChange={(v) => set("animation", "fadeInSec", v)} min={0} max={1} step={0.05} />
          </Field>
          <Field label="Fade Out (초)">
            <ScrubInput value={draft.animation.fadeOutSec} onChange={(v) => set("animation", "fadeOutSec", v)} min={0} max={1} step={0.05} />
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

function ScrubInput({
  value, onChange, min, max, step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const startY = useRef(0);
  const startVal = useRef(0);
  const hasDragged = useRef(false);

  function clamp(v: number) {
    let out = v;
    if (min !== undefined && out < min) out = min;
    if (max !== undefined && out > max) out = max;
    return out;
  }

  function snap(v: number) {
    const inv = 1 / step;
    return Math.round(v * inv) / inv;
  }

  function commitInput(raw: string) {
    const v = parseFloat(raw);
    if (!isNaN(v)) onChange(clamp(snap(v)));
    setEditing(false);
  }

  const display = step < 0.1 ? value.toFixed(2) : step < 1 ? value.toFixed(1) : String(value);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={inputVal}
        step={step}
        autoFocus
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={(e) => commitInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitInput((e.target as HTMLInputElement).value);
          if (e.key === "Escape") setEditing(false);
        }}
        className={inputCls}
      />
    );
  }

  return (
    <div
      className={`${inputCls} flex cursor-ns-resize select-none items-center justify-between`}
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
        onChange(clamp(snap(startVal.current + delta * step)));
      }}
      onPointerUp={() => {
        if (!hasDragged.current) {
          // click without drag → enter edit mode
          setInputVal(display);
          setEditing(true);
        }
      }}
    >
      <span className="text-[10px] text-gray-600">↕</span>
      <span className="font-mono">{display}</span>
    </div>
  );
}

// ─── PresetPreview ────────────────────────────────────────────────────────────

const PREVIEW_SCALE = 480 / 1920; // 1/4 of full 1920×1080

export function PresetPreview({
  draft,
  onPositionChange,
}: {
  draft: OverlayPreset;
  onPositionChange?: (x: number, y: number) => void;
}) {
  // y is the title's top position; artist sits above by artistFontSize + lineHeight (row gap)
  const yAbsolute = draft.layout.y < 0 ? 1080 + draft.layout.y : draft.layout.y;
  const rowGapPx = draft.typography.lineHeight * PREVIEW_SCALE;
  const artistOffsetPx = (draft.typography.artistFontSize + draft.typography.lineHeight) * PREVIEW_SCALE;

  const xPx = Math.max(0, draft.layout.x * PREVIEW_SCALE);
  const yTitlePx = yAbsolute * PREVIEW_SCALE;
  const yArtistPx = Math.max(0, yTitlePx - artistOffsetPx);

  const artistFont = FONTS.find((f) => f.name === draft.typography.artistFontFamily);
  const titleFont = FONTS.find((f) => f.name === draft.typography.titleFontFamily);
  const artistCss = artistFont?.family ?? draft.typography.artistFontFamily;
  const titleCss = titleFont?.family ?? draft.typography.titleFontFamily;

  // Drag state
  const dragStart = useRef<{ clientX: number; clientY: number; layoutX: number; layoutY: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    if (!onPositionChange) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      layoutX: draft.layout.x,
      layoutY: draft.layout.y,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current || !onPositionChange) return;
    const dx = Math.round((e.clientX - dragStart.current.clientX) / PREVIEW_SCALE);
    const dy = Math.round((e.clientY - dragStart.current.clientY) / PREVIEW_SCALE);
    onPositionChange(dragStart.current.layoutX + dx, dragStart.current.layoutY + dy);
  }

  function handlePointerUp() {
    dragStart.current = null;
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: 480,
        height: 270,
        background: "linear-gradient(135deg,#1a1a2e 0%,#0f3460 55%,#16213e 100%)",
      }}
    >
      <span className="absolute top-1.5 right-2 text-[9px] text-white/30 select-none">
        미리보기 (1/4)
      </span>
      {/* Draggable text block */}
      <div
        style={{
          position: "absolute",
          left: xPx,
          top: Math.max(0, yArtistPx),
          cursor: onPositionChange ? "move" : "default",
          userSelect: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div>
          <div
            style={{
              fontFamily: artistCss,
              fontSize: draft.typography.artistFontSize * PREVIEW_SCALE,
              fontWeight: draft.typography.artistWeight,
              fontStyle: draft.typography.artistItalic ? "italic" : "normal",
              textDecoration: draft.typography.artistUnderline ? "underline" : "none",
              color: draft.color.artist,
              whiteSpace: "nowrap",
              textAlign: draft.typography.textAlign,
              letterSpacing: `${draft.typography.letterSpacing * PREVIEW_SCALE}px`,
            }}
          >
            Artist Name
          </div>
          <div
            style={{
              fontFamily: titleCss,
              fontSize: draft.typography.titleFontSize * PREVIEW_SCALE,
              fontWeight: draft.typography.titleWeight,
              fontStyle: draft.typography.titleItalic ? "italic" : "normal",
              textDecoration: draft.typography.titleUnderline ? "underline" : "none",
              color: draft.color.title,
              whiteSpace: "nowrap",
              textAlign: draft.typography.textAlign,
              letterSpacing: `${draft.typography.letterSpacing * PREVIEW_SCALE}px`,
              marginTop: rowGapPx,
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
          {FONTS.map((f) => {
            const renderOk = "googleKey" in f && f.googleKey !== null;
            return (
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
                <span className="shrink-0 text-[10px] text-gray-500">
                  {"tag" in f ? f.tag : ""}
                  {!renderOk && <span className="ml-1 text-amber-500">⚠ 렌더 미지원</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StyleToggle({
  bold, italic, underline, onBold, onItalic, onUnderline,
}: {
  bold: boolean; italic: boolean; underline: boolean;
  onBold: (v: boolean) => void; onItalic: (v: boolean) => void; onUnderline: (v: boolean) => void;
}) {
  const btnCls = (active: boolean) =>
    `flex-1 rounded py-1 text-xs font-medium transition-colors ${
      active ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
    }`;
  return (
    <div className="flex gap-1">
      <button type="button" onClick={() => onBold(!bold)} className={btnCls(bold)}>
        <span className="font-bold">B</span>
      </button>
      <button type="button" onClick={() => onItalic(!italic)} className={btnCls(italic)}>
        <span className="italic">I</span>
      </button>
      <button type="button" onClick={() => onUnderline(!underline)} className={btnCls(underline)}>
        <span className="underline">U</span>
      </button>
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
