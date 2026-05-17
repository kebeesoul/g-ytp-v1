# Overlay Preset Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에디터에 오버레이 프리셋 슬롯 6개 선택 UI를 추가하고, Settings 페이지에서 각 슬롯을 Supabase DB 기반으로 편집할 수 있게 한다.

**Architecture:** Supabase `overlay_presets` 테이블에 슬롯 6개를 저장. API Route 2개(GET 전체 / PATCH 단건)로 CRUD. 에디터는 슬롯 선택 → `presetId`를 스냅샷에 반영. Settings 페이지는 사이드바(슬롯 목록) + 우측 폼(편집) + 실시간 미리보기 구조.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Zod, Supabase (supabase-js), Vitest, Tailwind CSS

---

## File Map

| Action | Path | Role |
|--------|------|------|
| Modify | `src/lib/schema.ts` | `OverlayPresetSchema`에 `animMemo` 필드 추가 |
| Create | `src/lib/presets.ts` | DB row ↔ OverlayPreset 변환 어댑터 |
| Create | `src/__tests__/presets.test.ts` | rowToPreset / presetToRow 단위 테스트 |
| Create | `src/app/api/overlay-presets/route.ts` | GET 전체 슬롯 |
| Create | `src/app/api/overlay-presets/[slotId]/route.ts` | PATCH 단건 슬롯 |
| Create | `src/__tests__/overlay-presets-api.test.ts` | API 어댑터 로직 단위 테스트 |
| Create | `src/components/editor/OverlayPresetSlots.tsx` | 에디터 내 슬롯 선택 그리드 |
| Modify | `src/app/editor/page.tsx` | Tracklist 이동 + 슬롯 선택 state + presetId 연동 |
| Modify | `src/app/layout.tsx` | nav에 Settings 링크 추가 |
| Create | `src/app/settings/page.tsx` | Settings 페이지 (사이드바 + 에디터 조립) |
| Create | `src/components/settings/PresetSidebar.tsx` | 슬롯 목록 사이드바 |
| Create | `src/components/settings/PresetEditor.tsx` | 폼 + 실시간 미리보기 |

---

## Task 1: DB Migration — `overlay_presets` 테이블 생성

**Files:**
- Supabase SQL Editor에서 직접 실행 (마이그레이션 파일 없음)

- [ ] **Step 1: Supabase SQL Editor에서 테이블 생성**

```sql
CREATE TABLE overlay_presets (
  id           TEXT PRIMARY KEY,           -- "slot-1" ~ "slot-6"
  slot_index   INTEGER UNIQUE NOT NULL,    -- 1~6
  name         TEXT NOT NULL DEFAULT '',
  version      INTEGER NOT NULL DEFAULT 1,
  renderer     TEXT NOT NULL DEFAULT 'drawtext',

  anchor       TEXT NOT NULL DEFAULT 'bottom-left',
  offset_x     INTEGER NOT NULL DEFAULT 80,
  offset_y     INTEGER NOT NULL DEFAULT -160,
  safe_margin_x INTEGER NOT NULL DEFAULT 96,
  safe_margin_y INTEGER NOT NULL DEFAULT 72,

  artist_font_family TEXT NOT NULL DEFAULT 'AppleSDGothicNeo',
  artist_font_size   INTEGER NOT NULL DEFAULT 32,
  artist_weight      INTEGER NOT NULL DEFAULT 500,
  title_font_family  TEXT NOT NULL DEFAULT 'AppleSDGothicNeo',
  title_font_size    INTEGER NOT NULL DEFAULT 42,
  title_weight       INTEGER NOT NULL DEFAULT 700,
  text_align         TEXT NOT NULL DEFAULT 'left',
  line_height        REAL NOT NULL DEFAULT 1.15,
  letter_spacing     INTEGER NOT NULL DEFAULT 0,
  max_lines_title    INTEGER NOT NULL DEFAULT 2,

  color_artist  TEXT NOT NULL DEFAULT '#FFFFFF',
  color_title   TEXT NOT NULL DEFAULT '#FFFFFF',
  color_bg      TEXT,
  color_shadow  TEXT,

  card_enabled  BOOLEAN NOT NULL DEFAULT false,
  card_padding_x INTEGER NOT NULL DEFAULT 32,
  card_padding_y INTEGER NOT NULL DEFAULT 24,
  card_radius    INTEGER NOT NULL DEFAULT 24,
  card_blur      INTEGER NOT NULL DEFAULT 0,
  card_opacity   REAL NOT NULL DEFAULT 1.0,

  fade_in_sec  REAL NOT NULL DEFAULT 0.3,
  fade_out_sec REAL NOT NULL DEFAULT 0.5,
  anim_memo    TEXT,

  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 슬롯 6개 기본 데이터 삽입
INSERT INTO overlay_presets (id, slot_index, name) VALUES
  ('slot-1', 1, '슬롯 1'),
  ('slot-2', 2, '슬롯 2'),
  ('slot-3', 3, '슬롯 3'),
  ('slot-4', 4, '슬롯 4'),
  ('slot-5', 5, '슬롯 5'),
  ('slot-6', 6, '슬롯 6');
```

- [ ] **Step 2: 삽입 확인**

```sql
SELECT id, slot_index, name FROM overlay_presets ORDER BY slot_index;
```

Expected: 6개 row (slot-1 ~ slot-6)

---

## Task 2: `OverlayPresetSchema`에 `animMemo` 추가

**Files:**
- Modify: `src/lib/schema.ts`

- [ ] **Step 1: `animation` 블록에 `animMemo` 필드 추가**

`src/lib/schema.ts`의 `OverlayPresetSchema` 내 `animation` 객체를:

```typescript
  animation: z.object({
    fadeInSec: z.number().default(0.3),
    fadeOutSec: z.number().default(0.5),
    animMemo: z.string().optional(),
  }),
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/lib/schema.ts
git commit -m "feat(schema): add animMemo to OverlayPreset animation"
```

---

## Task 3: `src/lib/presets.ts` — DB 어댑터

**Files:**
- Create: `src/lib/presets.ts`
- Create: `src/__tests__/presets.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/__tests__/presets.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rowToPreset, presetToRow } from "@/lib/presets";
import type { OverlayPreset } from "@/lib/schema";

const SAMPLE_ROW = {
  id: "slot-1",
  slot_index: 1,
  name: "박스형",
  version: 1,
  renderer: "drawtext",
  anchor: "bottom-left",
  offset_x: 80,
  offset_y: -160,
  safe_margin_x: 96,
  safe_margin_y: 72,
  artist_font_family: "AppleSDGothicNeo",
  artist_font_size: 32,
  artist_weight: 500,
  title_font_family: "AppleSDGothicNeo",
  title_font_size: 42,
  title_weight: 700,
  text_align: "left",
  line_height: 1.15,
  letter_spacing: 0,
  max_lines_title: 2,
  color_artist: "#FFFFFF",
  color_title: "#FFFFFF",
  color_bg: null,
  color_shadow: null,
  card_enabled: false,
  card_padding_x: 32,
  card_padding_y: 24,
  card_radius: 24,
  card_blur: 0,
  card_opacity: 1.0,
  fade_in_sec: 0.3,
  fade_out_sec: 0.5,
  anim_memo: "페이드인 0.3초",
  updated_at: "2026-05-17T00:00:00Z",
};

describe("rowToPreset", () => {
  it("maps all fields correctly", () => {
    const preset = rowToPreset(SAMPLE_ROW);
    expect(preset.id).toBe("slot-1");
    expect(preset.layout.anchor).toBe("bottom-left");
    expect(preset.layout.x).toBe(80);
    expect(preset.layout.y).toBe(-160);
    expect(preset.typography.artistFontSize).toBe(32);
    expect(preset.typography.titleFontSize).toBe(42);
    expect(preset.card.enabled).toBe(false);
    expect(preset.animation.fadeInSec).toBe(0.3);
    expect(preset.animation.animMemo).toBe("페이드인 0.3초");
  });

  it("handles null optional fields", () => {
    const preset = rowToPreset({ ...SAMPLE_ROW, color_bg: null, color_shadow: null, anim_memo: null });
    expect(preset.color.background).toBeUndefined();
    expect(preset.color.shadow).toBeUndefined();
    expect(preset.animation.animMemo).toBeUndefined();
  });
});

describe("presetToRow", () => {
  it("round-trips through rowToPreset → presetToRow", () => {
    const preset = rowToPreset(SAMPLE_ROW);
    const row = presetToRow(preset, 1, "박스형");
    expect(row.id).toBe("slot-1");
    expect(row.offset_x).toBe(80);
    expect(row.title_font_size).toBe(42);
    expect(row.card_enabled).toBe(false);
    expect(row.anim_memo).toBe("페이드인 0.3초");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/__tests__/presets.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/presets'"

- [ ] **Step 3: 어댑터 구현**

`src/lib/presets.ts`:

```typescript
import { OverlayPresetSchema, type OverlayPreset } from "@/lib/schema";

export type PresetRow = {
  id: string;
  slot_index: number;
  name: string;
  version: number;
  renderer: string;
  anchor: string;
  offset_x: number;
  offset_y: number;
  safe_margin_x: number;
  safe_margin_y: number;
  artist_font_family: string;
  artist_font_size: number;
  artist_weight: number;
  title_font_family: string;
  title_font_size: number;
  title_weight: number;
  text_align: string;
  line_height: number;
  letter_spacing: number;
  max_lines_title: number;
  color_artist: string;
  color_title: string;
  color_bg: string | null;
  color_shadow: string | null;
  card_enabled: boolean;
  card_padding_x: number;
  card_padding_y: number;
  card_radius: number;
  card_blur: number;
  card_opacity: number;
  fade_in_sec: number;
  fade_out_sec: number;
  anim_memo: string | null;
  updated_at: string;
};

export function rowToPreset(row: PresetRow): OverlayPreset {
  return OverlayPresetSchema.parse({
    id: row.id,
    version: row.version,
    renderer: row.renderer,
    layout: {
      anchor: row.anchor,
      x: row.offset_x,
      y: row.offset_y,
      safeMarginX: row.safe_margin_x,
      safeMarginY: row.safe_margin_y,
    },
    typography: {
      artistFontFamily: row.artist_font_family,
      titleFontFamily: row.title_font_family,
      artistFontSize: row.artist_font_size,
      titleFontSize: row.title_font_size,
      artistWeight: row.artist_weight,
      titleWeight: row.title_weight,
      letterSpacing: row.letter_spacing,
      lineHeight: row.line_height,
      maxLinesTitle: row.max_lines_title,
      textAlign: row.text_align,
    },
    color: {
      artist: row.color_artist,
      title: row.color_title,
      background: row.color_bg ?? undefined,
      shadow: row.color_shadow ?? undefined,
    },
    card: {
      enabled: row.card_enabled,
      paddingX: row.card_padding_x,
      paddingY: row.card_padding_y,
      radius: row.card_radius,
      blur: row.card_blur,
      opacity: row.card_opacity,
    },
    animation: {
      fadeInSec: row.fade_in_sec,
      fadeOutSec: row.fade_out_sec,
      animMemo: row.anim_memo ?? undefined,
    },
  });
}

export function presetToRow(
  preset: OverlayPreset,
  slotIndex: number,
  name: string
): Omit<PresetRow, "updated_at"> {
  return {
    id: preset.id,
    slot_index: slotIndex,
    name,
    version: preset.version + 1,
    renderer: preset.renderer,
    anchor: preset.layout.anchor,
    offset_x: preset.layout.x,
    offset_y: preset.layout.y,
    safe_margin_x: preset.layout.safeMarginX,
    safe_margin_y: preset.layout.safeMarginY,
    artist_font_family: preset.typography.artistFontFamily,
    artist_font_size: preset.typography.artistFontSize,
    artist_weight: preset.typography.artistWeight,
    title_font_family: preset.typography.titleFontFamily,
    title_font_size: preset.typography.titleFontSize,
    title_weight: preset.typography.titleWeight,
    text_align: preset.typography.textAlign,
    line_height: preset.typography.lineHeight,
    letter_spacing: preset.typography.letterSpacing,
    max_lines_title: preset.typography.maxLinesTitle,
    color_artist: preset.color.artist,
    color_title: preset.color.title,
    color_bg: preset.color.background ?? null,
    color_shadow: preset.color.shadow ?? null,
    card_enabled: preset.card.enabled,
    card_padding_x: preset.card.paddingX,
    card_padding_y: preset.card.paddingY,
    card_radius: preset.card.radius,
    card_blur: preset.card.blur,
    card_opacity: preset.card.opacity,
    fade_in_sec: preset.animation.fadeInSec,
    fade_out_sec: preset.animation.fadeOutSec,
    anim_memo: preset.animation.animMemo ?? null,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/__tests__/presets.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/presets.ts src/__tests__/presets.test.ts
git commit -m "feat(presets): add DB row adapter rowToPreset / presetToRow"
```

---

## Task 4: GET `/api/overlay-presets`

**Files:**
- Create: `src/app/api/overlay-presets/route.ts`

- [ ] **Step 1: 라우트 구현**

`src/app/api/overlay-presets/route.ts`:

```typescript
import { supabaseServer } from "@/lib/supabase/server";
import { rowToPreset, type PresetRow } from "@/lib/presets";

export async function GET(): Promise<Response> {
  const { data, error } = await supabaseServer
    .from("overlay_presets")
    .select("*")
    .order("slot_index");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const presets = (data as PresetRow[]).map(rowToPreset);
  return Response.json(presets);
}
```

- [ ] **Step 2: 개발 서버에서 수동 확인**

```bash
curl http://localhost:3000/api/overlay-presets | python3 -m json.tool | head -30
```

Expected: 6개 preset 객체 배열

- [ ] **Step 3: Commit**

```bash
git add src/app/api/overlay-presets/route.ts
git commit -m "feat(api): add GET /api/overlay-presets"
```

---

## Task 5: PATCH `/api/overlay-presets/[slotId]`

**Files:**
- Create: `src/app/api/overlay-presets/[slotId]/route.ts`

- [ ] **Step 1: 라우트 구현**

`src/app/api/overlay-presets/[slotId]/route.ts`:

```typescript
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { OverlayPresetSchema } from "@/lib/schema";
import { presetToRow, rowToPreset, type PresetRow } from "@/lib/presets";

const VALID_SLOT_IDS = new Set(["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"]);

interface RouteParams {
  params: Promise<{ slotId: string }>;
}

const PatchBodySchema = z.object({
  preset: OverlayPresetSchema,
  name: z.string().min(1).max(50),
});

export async function PATCH(req: Request, { params }: RouteParams): Promise<Response> {
  const { slotId } = await params;

  if (!VALID_SLOT_IDS.has(slotId)) {
    return Response.json({ error: "invalid slotId" }, { status: 400 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }

  const { preset, name } = parsed.data;

  // slot_index는 id에서 파생 (slot-1 → 1)
  const slotIndex = parseInt(slotId.split("-")[1], 10);
  const row = presetToRow({ ...preset, id: slotId }, slotIndex, name);

  const { data, error } = await supabaseServer
    .from("overlay_presets")
    .upsert({ ...row, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(rowToPreset(data as PresetRow));
}
```

- [ ] **Step 2: 수동 PATCH 확인**

```bash
curl -X PATCH http://localhost:3000/api/overlay-presets/slot-1 \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트","preset":{"id":"slot-1","version":1,"renderer":"drawtext","layout":{"anchor":"bottom-left","x":80,"y":-160,"safeMarginX":96,"safeMarginY":72},"typography":{"artistFontFamily":"AppleSDGothicNeo","titleFontFamily":"AppleSDGothicNeo","artistFontSize":32,"titleFontSize":42,"artistWeight":500,"titleWeight":700,"letterSpacing":0,"lineHeight":1.15,"maxLinesTitle":2,"textAlign":"left"},"color":{"artist":"#FFFFFF","title":"#FFFFFF"},"card":{"enabled":false,"paddingX":32,"paddingY":24,"radius":24,"blur":0,"opacity":1},"animation":{"fadeInSec":0.3,"fadeOutSec":0.5}}}' \
  | python3 -m json.tool
```

Expected: 저장된 preset 객체 반환 (version: 2)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/overlay-presets/[slotId]/route.ts
git commit -m "feat(api): add PATCH /api/overlay-presets/[slotId]"
```

---

## Task 6: `OverlayPresetSlots` 컴포넌트

**Files:**
- Create: `src/components/editor/OverlayPresetSlots.tsx`

- [ ] **Step 1: 컴포넌트 구현**

`src/components/editor/OverlayPresetSlots.tsx`:

```typescript
"use client";

import Link from "next/link";
import type { OverlayPreset } from "@/lib/schema";

interface OverlayPresetSlotsProps {
  presets: (OverlayPreset | null)[];   // 길이 6, null = 빈 슬롯
  selectedId: string;
  onChange: (presetId: string) => void;
}

export function OverlayPresetSlots({ presets, selectedId, onChange }: OverlayPresetSlotsProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-700 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">오버레이 디자인</span>
        <Link href="/settings" className="text-xs text-green-400 hover:text-green-300">
          ⚙ 편집
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset, i) => {
          const slotId = `slot-${i + 1}`;
          const isSelected = selectedId === slotId;
          const isEmpty = preset === null;

          if (isEmpty) {
            return (
              <Link
                key={slotId}
                href="/settings"
                className="flex flex-col items-center gap-1 rounded-md border border-dashed border-gray-700 p-2 text-center hover:border-gray-500"
              >
                <div className="flex h-9 w-full items-center justify-center rounded bg-gray-800 text-lg text-gray-700">
                  +
                </div>
                <span className="text-[10px] text-gray-700">슬롯 {i + 1}</span>
              </Link>
            );
          }

          return (
            <button
              key={slotId}
              onClick={() => onChange(slotId)}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors ${
                isSelected
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-700 hover:border-gray-500"
              }`}
            >
              <SlotThumb preset={preset} />
              <span className={`text-[10px] ${isSelected ? "text-blue-400" : "text-gray-500"}`}>
                {preset.animation.animMemo
                  ? preset.animation.animMemo.slice(0, 8) + (preset.animation.animMemo.length > 8 ? "…" : "")
                  : `슬롯 ${i + 1}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotThumb({ preset }: { preset: OverlayPreset }) {
  const cardStyle: React.CSSProperties = preset.card.enabled
    ? {
        background: preset.color.background ?? "rgba(0,0,0,0.55)",
        borderRadius: Math.round(preset.card.radius / 4),
        padding: "2px 4px",
      }
    : {};

  return (
    <div
      className="relative flex h-9 w-full flex-col justify-end overflow-hidden rounded p-1"
      style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)" }}
    >
      <div style={cardStyle}>
        <div
          className="truncate text-left leading-tight"
          style={{
            fontSize: Math.round(preset.typography.artistFontSize / 5),
            color: preset.color.artist,
            fontWeight: preset.typography.artistWeight,
          }}
        >
          Artist
        </div>
        <div
          className="truncate text-left leading-tight"
          style={{
            fontSize: Math.round(preset.typography.titleFontSize / 5),
            color: preset.color.title,
            fontWeight: preset.typography.titleWeight,
          }}
        >
          Title
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Storybook 없이 빠른 시각 확인 — Task 7에서 에디터에 붙인 후 확인**

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/OverlayPresetSlots.tsx
git commit -m "feat(editor): add OverlayPresetSlots component"
```

---

## Task 7: 에디터 페이지 변경

**Files:**
- Modify: `src/app/editor/page.tsx`

변경 사항:
1. `TracklistExport` → 좌측 컬럼 (TrackList 아래)
2. `OverlayPresetSlots` → 우측 컬럼 (BackgroundPicker 아래, 렌더 설정 위)
3. preset 목록 fetch + selectedPresetId state
4. `buildSnapshot()`에 selectedPresetId 반영

- [ ] **Step 1: import 추가 및 state 추가**

`src/app/editor/page.tsx` 상단 import에:
```typescript
import { OverlayPresetSlots } from "@/components/editor/OverlayPresetSlots";
import type { OverlayPreset } from "@/lib/schema";
```

컴포넌트 내부 state:
```typescript
const [presets, setPresets] = useState<(OverlayPreset | null)[]>(Array(6).fill(null));
const [selectedPresetId, setSelectedPresetId] = useState<string>("slot-1");
```

- [ ] **Step 2: preset fetch useEffect 추가**

기존 health check useEffect 아래에:

```typescript
useEffect(() => {
  (async () => {
    try {
      const res = await fetch("/api/overlay-presets");
      if (!res.ok) return;
      const data = (await res.json()) as OverlayPreset[];
      const slots: (OverlayPreset | null)[] = Array(6).fill(null);
      for (const p of data) {
        const idx = parseInt(p.id.split("-")[1], 10) - 1;
        if (idx >= 0 && idx < 6) slots[idx] = p;
      }
      setPresets(slots);
    } catch {
      // 프리셋 로드 실패 시 빈 슬롯 유지
    }
  })();
}, []);
```

- [ ] **Step 3: `buildSnapshot()`에 selectedPresetId 반영**

기존 `overlay` 객체:
```typescript
overlay: { ...DEFAULT_RENDER_CONFIG.overlay, displayMode: overlayMode, presetId: selectedPresetId },
```

`useMemo` deps에 `selectedPresetId` 추가:
```typescript
[title, tracks, background, transitionType, crossfadeSec, overlayMode, outputFormat, hashtags, selectedPresetId]
```

- [ ] **Step 4: JSX 재배치**

좌측 컬럼 `<AudioPlayer>` 아래에 `TracklistExport` 이동:
```tsx
{snapshotValid && tracks.length > 0 && (
  <TracklistExport snapshot={snapshot as ProjectSnapshot} />
)}
```

우측 컬럼에서 기존 `TracklistExport` 제거, `BackgroundPicker` 아래에 `OverlayPresetSlots` 추가:
```tsx
<OverlayPresetSlots
  presets={presets}
  selectedId={selectedPresetId}
  onChange={setSelectedPresetId}
/>
```

- [ ] **Step 5: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 6: 브라우저에서 확인**
  - http://localhost:3000/editor 열기
  - Tracklist가 좌측 하단에 있는지 확인
  - 슬롯 그리드가 렌더 설정 위에 있는지 확인

- [ ] **Step 7: Commit**

```bash
git add src/app/editor/page.tsx
git commit -m "feat(editor): move Tracklist left, add OverlayPresetSlots, wire presetId"
```

---

## Task 8: Nav에 Settings 링크 추가

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Settings 링크 추가**

`src/app/layout.tsx`의 `<nav>` 블록:

```tsx
<nav className="flex gap-4">
  <Link href="/editor" className="text-sm text-gray-300 hover:text-white transition-colors">
    Editor
  </Link>
  <Link href="/history" className="text-sm text-gray-300 hover:text-white transition-colors">
    History
  </Link>
  <Link href="/settings" className="text-sm text-gray-300 hover:text-white transition-colors">
    Settings
  </Link>
</nav>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(nav): add Settings link"
```

---

## Task 9: `PresetSidebar` 컴포넌트

**Files:**
- Create: `src/components/settings/PresetSidebar.tsx`

- [ ] **Step 1: 컴포넌트 구현**

`src/components/settings/PresetSidebar.tsx`:

```typescript
"use client";

import type { OverlayPreset } from "@/lib/schema";

interface PresetSidebarProps {
  presets: (OverlayPreset | null)[];   // 길이 6
  selectedIndex: number;               // 0-based
  onSelect: (index: number) => void;
}

export function PresetSidebar({ presets, selectedIndex, onSelect }: PresetSidebarProps) {
  return (
    <aside className="flex w-52 flex-col gap-1 border-r border-gray-800 bg-gray-900 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600">
        프리셋 (6)
      </p>

      {presets.map((preset, i) => {
        const isActive = selectedIndex === i;
        const isEmpty = preset === null;

        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`flex items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors ${
              isActive
                ? "border-blue-500/50 bg-blue-500/10"
                : "border-transparent hover:bg-gray-800"
            }`}
          >
            {/* 썸네일 */}
            <div
              className="relative flex h-7 w-10 flex-shrink-0 flex-col justify-end overflow-hidden rounded p-0.5"
              style={isEmpty ? { background: "#1a1a1a", border: "1px dashed #374151" } : { background: "linear-gradient(135deg,#1a1a2e,#0f3460)" }}
            >
              {isEmpty ? (
                <span className="text-center text-sm text-gray-700">+</span>
              ) : (
                <>
                  <div className="truncate text-[4px] leading-tight text-white/70">Artist</div>
                  <div className="truncate text-[5px] font-bold leading-tight text-white">Title</div>
                </>
              )}
            </div>

            {/* 메타 */}
            <div className="min-w-0 flex-1">
              <div className={`text-[11px] font-semibold ${isActive ? "text-blue-400" : "text-gray-300"}`}>
                {isEmpty ? `슬롯 ${i + 1}` : (preset.animation.animMemo ? preset.animation.animMemo.slice(0, 10) : `슬롯 ${i + 1}`)}
              </div>
              <div className="text-[10px] text-gray-600">
                {isEmpty ? "비어 있음" : preset.layout.anchor}
              </div>
            </div>
          </button>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/PresetSidebar.tsx
git commit -m "feat(settings): add PresetSidebar component"
```

---

## Task 10: `PresetEditor` 컴포넌트

**Files:**
- Create: `src/components/settings/PresetEditor.tsx`

이 컴포넌트는 실시간 미리보기 + 폼 4개 섹션 (타이포그래피, 텍스트 배경, 위치, 애니메이션)을 포함한다.

- [ ] **Step 1: 컴포넌트 구현**

`src/components/settings/PresetEditor.tsx`:

```typescript
"use client";

import { useState } from "react";
import type { OverlayPreset } from "@/lib/schema";

interface PresetEditorProps {
  slotIndex: number;          // 0-based
  initialPreset: OverlayPreset;
  onSave: (preset: OverlayPreset, name: string) => Promise<void>;
}

const ANCHORS = [
  "top-left",    "top-center",    "top-right",
  "center",      "center",        "center",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

// 앵커 9칸 그리드용 — 중간 행은 "center" 하나만 유효하게 표현
const ANCHOR_GRID: Array<OverlayPreset["layout"]["anchor"]> = [
  "top-left",    "top-center",    "top-right",
  "center",      "center",        "center",
  "bottom-left", "bottom-center", "bottom-right",
];

export function PresetEditor({ slotIndex, initialPreset, onSave }: PresetEditorProps) {
  const [preset, setPreset] = useState<OverlayPreset>(initialPreset);
  const [name, setName] = useState(initialPreset.animation.animMemo ?? `슬롯 ${slotIndex + 1}`);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function set<K extends keyof OverlayPreset>(key: K, value: OverlayPreset[K]) {
    setPreset((p) => ({ ...p, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(preset, name);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  // 미리보기용 CSS
  const previewArtistStyle: React.CSSProperties = {
    fontSize: Math.round(preset.typography.artistFontSize * 0.22),
    color: preset.color.artist,
    fontWeight: preset.typography.artistWeight,
    lineHeight: preset.typography.lineHeight,
  };
  const previewTitleStyle: React.CSSProperties = {
    fontSize: Math.round(preset.typography.titleFontSize * 0.22),
    color: preset.color.title,
    fontWeight: preset.typography.titleWeight,
    lineHeight: preset.typography.lineHeight,
  };
  const cardStyle: React.CSSProperties = preset.card.enabled
    ? {
        background: preset.color.background ?? "rgba(0,0,0,0.55)",
        borderRadius: preset.card.radius * 0.4,
        padding: `${preset.card.paddingY * 0.18}px ${preset.card.paddingX * 0.18}px`,
        backdropFilter: preset.card.blur > 0 ? `blur(${preset.card.blur * 0.3}px)` : undefined,
      }
    : {};

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-800 pb-4">
        <div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-48 rounded border border-gray-700 bg-transparent px-2 py-1 text-base font-bold text-white focus:border-blue-500 focus:outline-none"
            placeholder={`슬롯 ${slotIndex + 1}`}
          />
          <p className="mt-1 text-[10px] text-gray-600">
            DB ID: slot-{slotIndex + 1} · v{preset.version}
          </p>
        </div>
        <div className="flex gap-2">
          {saveError && <span className="text-xs text-red-400">{saveError}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {/* Live Preview */}
      <div className="overflow-hidden rounded-lg border border-gray-700">
        <div className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">미리보기</span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-green-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
            실시간 반영
          </span>
        </div>
        <div
          className="relative flex h-28 items-end p-4"
          style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#0f3460 60%,#16213e 100%)" }}
        >
          <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-white/40">
            fade-in {preset.animation.fadeInSec}s · fade-out {preset.animation.fadeOutSec}s
          </span>
          <div style={cardStyle}>
            <div style={previewArtistStyle}>Dynamic Duo · CHEN(첸)</div>
            <div style={previewTitleStyle}>nosedive (기다렸다 가)</div>
          </div>
        </div>
      </div>

      {/* ── 타이포그래피 ── */}
      <Section title="Aa 타이포그래피">
        <Grid>
          <Field label="아티스트 폰트">
            <Input value={preset.typography.artistFontFamily}
              onChange={(v) => set("typography", { ...preset.typography, artistFontFamily: v })} />
          </Field>
          <Field label="아티스트 크기">
            <NumberInput value={preset.typography.artistFontSize}
              onChange={(v) => set("typography", { ...preset.typography, artistFontSize: v })} />
          </Field>
          <Field label="곡명 폰트">
            <Input value={preset.typography.titleFontFamily}
              onChange={(v) => set("typography", { ...preset.typography, titleFontFamily: v })} />
          </Field>
          <Field label="곡명 크기">
            <NumberInput value={preset.typography.titleFontSize}
              onChange={(v) => set("typography", { ...preset.typography, titleFontSize: v })} />
          </Field>
          <Field label="아티스트 굵기">
            <Select value={String(preset.typography.artistWeight)}
              options={[["300","Light"],["400","Regular"],["500","Medium"],["600","SemiBold"],["700","Bold"]]}
              onChange={(v) => set("typography", { ...preset.typography, artistWeight: Number(v) })} />
          </Field>
          <Field label="곡명 굵기">
            <Select value={String(preset.typography.titleWeight)}
              options={[["300","Light"],["400","Regular"],["500","Medium"],["600","SemiBold"],["700","Bold"]]}
              onChange={(v) => set("typography", { ...preset.typography, titleWeight: Number(v) })} />
          </Field>
          <Field label="정렬">
            <Select value={preset.typography.textAlign}
              options={[["left","Left"],["center","Center"],["right","Right"]]}
              onChange={(v) => set("typography", { ...preset.typography, textAlign: v as "left"|"center"|"right" })} />
          </Field>
          <Field label="줄 높이">
            <NumberInput value={preset.typography.lineHeight} step={0.05}
              onChange={(v) => set("typography", { ...preset.typography, lineHeight: v })} />
          </Field>
        </Grid>
      </Section>

      {/* ── 텍스트 배경 ── */}
      <Section title="▭ 텍스트 배경">
        <div className="flex items-center justify-between px-1 pb-2">
          <div>
            <p className="text-sm text-gray-200">카드 배경</p>
            <p className="text-[10px] text-gray-600">텍스트 뒤 박스/블러</p>
          </div>
          <button
            onClick={() => set("card", { ...preset.card, enabled: !preset.card.enabled })}
            className={`relative h-5 w-8 rounded-full transition-colors ${preset.card.enabled ? "bg-green-600" : "bg-gray-700"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${preset.card.enabled ? "right-0.5" : "left-0.5"}`} />
          </button>
        </div>
        {preset.card.enabled && (
          <Grid>
            <Field label="배경색 (CSS)">
              <Input value={preset.color.background ?? "rgba(0,0,0,0.55)"}
                onChange={(v) => set("color", { ...preset.color, background: v })} />
            </Field>
            <Field label="불투명도">
              <NumberInput value={preset.card.opacity} step={0.05} min={0} max={1}
                onChange={(v) => set("card", { ...preset.card, opacity: v })} />
            </Field>
            <Field label="블러 (px)">
              <NumberInput value={preset.card.blur}
                onChange={(v) => set("card", { ...preset.card, blur: v })} />
            </Field>
            <Field label="모서리 (px)">
              <NumberInput value={preset.card.radius}
                onChange={(v) => set("card", { ...preset.card, radius: v })} />
            </Field>
          </Grid>
        )}
      </Section>

      {/* ── 위치 ── */}
      <Section title="⊞ 위치">
        <Grid>
          <Field label="앵커">
            <div className="grid grid-cols-3 gap-1" style={{ width: 90 }}>
              {ANCHOR_GRID.map((anchor, idx) => (
                <button
                  key={idx}
                  onClick={() => set("layout", { ...preset.layout, anchor })}
                  className={`flex h-6 items-center justify-center rounded border transition-colors ${
                    preset.layout.anchor === anchor
                      ? "border-blue-500 bg-blue-500/20"
                      : "border-gray-700 hover:border-gray-500"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${preset.layout.anchor === anchor ? "bg-blue-400" : "bg-gray-600"}`} />
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-gray-600">{preset.layout.anchor}</p>
          </Field>
          <div className="flex flex-col gap-2">
            <Field label="X 오프셋 (px)">
              <NumberInput value={preset.layout.x}
                onChange={(v) => set("layout", { ...preset.layout, x: v })} />
            </Field>
            <Field label="Y 오프셋 (px)">
              <NumberInput value={preset.layout.y}
                onChange={(v) => set("layout", { ...preset.layout, y: v })} />
            </Field>
          </div>
        </Grid>
      </Section>

      {/* ── 애니메이션 ── */}
      <Section title="◎ 애니메이션">
        <Grid>
          <Field label="Fade In (초)">
            <NumberInput value={preset.animation.fadeInSec} step={0.1} min={0}
              onChange={(v) => set("animation", { ...preset.animation, fadeInSec: v })} />
          </Field>
          <Field label="Fade Out (초)">
            <NumberInput value={preset.animation.fadeOutSec} step={0.1} min={0}
              onChange={(v) => set("animation", { ...preset.animation, fadeOutSec: v })} />
          </Field>
        </Grid>
        <div className="mt-2 px-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">메모</p>
          <textarea
            value={preset.animation.animMemo ?? ""}
            onChange={(e) => set("animation", { ...preset.animation, animMemo: e.target.value || undefined })}
            rows={3}
            placeholder="애니메이션 메모 (자유 텍스트, 저장됩니다)"
            className="w-full resize-none rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-gray-600">
            직접 fadeInSec / fadeOutSec 값을 위에 설정하세요. 이 메모는 참고용으로 DB에 저장됩니다.
          </p>
        </div>
      </Section>
    </div>
  );
}

// ── 내부 헬퍼 컴포넌트 ──────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-800">
      <div className="border-b border-gray-800 bg-gray-950 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {title}
      </div>
      <div className="bg-gray-900 p-3">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
    />
  );
}

function NumberInput({ value, onChange, step = 1, min, max }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
    />
  );
}

function Select({ value, options, onChange }: {
  value: string; options: [string, string][]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
    >
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/PresetEditor.tsx
git commit -m "feat(settings): add PresetEditor component with live preview"
```

---

## Task 11: Settings 페이지 조립

**Files:**
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: 페이지 구현**

`src/app/settings/page.tsx`:

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import type { OverlayPreset } from "@/lib/schema";
import { PresetSidebar } from "@/components/settings/PresetSidebar";
import { PresetEditor } from "@/components/settings/PresetEditor";

const DEFAULT_PRESET: OverlayPreset = {
  id: "slot-1",
  version: 1,
  renderer: "drawtext",
  layout: { anchor: "bottom-left", x: 80, y: -160, safeMarginX: 96, safeMarginY: 72 },
  typography: {
    artistFontFamily: "AppleSDGothicNeo",
    titleFontFamily: "AppleSDGothicNeo",
    artistFontSize: 32,
    titleFontSize: 42,
    artistWeight: 500,
    titleWeight: 700,
    letterSpacing: 0,
    lineHeight: 1.15,
    maxLinesTitle: 2,
    textAlign: "left",
  },
  color: { artist: "#FFFFFF", title: "#FFFFFF" },
  card: { enabled: false, paddingX: 32, paddingY: 24, radius: 24, blur: 0, opacity: 1 },
  animation: { fadeInSec: 0.3, fadeOutSec: 0.5 },
};

export default function SettingsPage() {
  const [presets, setPresets] = useState<(OverlayPreset | null)[]>(Array(6).fill(null));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/overlay-presets");
        if (!res.ok) return;
        const data = (await res.json()) as OverlayPreset[];
        const slots: (OverlayPreset | null)[] = Array(6).fill(null);
        for (const p of data) {
          const idx = parseInt(p.id.split("-")[1], 10) - 1;
          if (idx >= 0 && idx < 6) slots[idx] = p;
        }
        setPresets(slots);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(async (preset: OverlayPreset, name: string) => {
    const slotId = `slot-${selectedIndex + 1}`;
    const res = await fetch(`/api/overlay-presets/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: { ...preset, id: slotId }, name }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? "저장 실패");
    }
    const saved = (await res.json()) as OverlayPreset;
    setPresets((prev) => {
      const next = [...prev];
      next[selectedIndex] = saved;
      return next;
    });
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-950">
        <p className="text-sm text-gray-500">로딩 중…</p>
      </div>
    );
  }

  const currentPreset = presets[selectedIndex] ?? { ...DEFAULT_PRESET, id: `slot-${selectedIndex + 1}` };

  return (
    <div className="flex flex-1 bg-gray-950">
      <PresetSidebar
        presets={presets}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
      />
      <PresetEditor
        key={selectedIndex}                // 슬롯 바꿀 때 state 리셋
        slotIndex={selectedIndex}
        initialPreset={currentPreset}
        onSave={handleSave}
      />
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 브라우저에서 전체 흐름 확인**
  - http://localhost:3000/settings 열기
  - 슬롯 목록 표시 확인
  - 폼 필드 변경 → 미리보기 즉시 반영 확인
  - 저장 버튼 → API 호출 확인 (Network 탭)
  - 저장 후 버전 번호 +1 확인

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat(settings): assemble Settings page with sidebar + editor"
```

---

## Task 12: 전체 E2E 확인 및 타입/테스트 최종 통과

- [ ] **Step 1: 전체 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 2: 전체 테스트 실행**

```bash
npx vitest run
```

Expected: 모든 테스트 PASS

- [ ] **Step 3: 브라우저 E2E 시나리오**
  - Editor → 슬롯 1 선택 → 렌더 설정에 presetId "slot-1" 포함 확인
  - Settings → 슬롯 2 선택 → 폼 변경 → 저장 → Editor 새로고침 → 슬롯 2 썸네일 업데이트 확인
  - Tracklist가 좌측 음원 추가 아래 있는지 확인

- [ ] **Step 4: 최종 Commit**

```bash
git add -A
git commit -m "feat: overlay preset slots + Settings page (Supabase DB)"
```
