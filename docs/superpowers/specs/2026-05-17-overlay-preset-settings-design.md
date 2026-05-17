# Overlay Preset Settings — Design Spec

Date: 2026-05-17
Status: Approved

---

## Overview

세 가지 변경을 하나의 작업으로 묶는다.

1. **Tracklist 위치 이동** — 우측 하단 → 좌측 "음원 추가" 아래
2. **오버레이 프리셋 슬롯 선택 UI** — 렌더 설정 위에 6개 슬롯 그리드 추가
3. **Settings 페이지** — nav에 탭 추가, Supabase DB 기반 6개 프리셋 편집

---

## 1. Layout Change — Tracklist 이동

**변경 전:** `TracklistExport` 컴포넌트가 오른쪽 컬럼 최하단
**변경 후:** 왼쪽 컬럼, `TrackList` (음원 추가 버튼 포함) 바로 아래

파일: `src/app/editor/page.tsx` JSX 구조만 수정.

---

## 2. 오버레이 프리셋 슬롯 UI

### 위치
오른쪽 컬럼, `BackgroundPicker` 아래 / `렌더 설정` 위.

### 동작
- 6개 슬롯을 3×2 그리드로 표시
- 각 슬롯: 썸네일 미리보기(작은 그라디언트 배경 + 오버레이 텍스트) + 슬롯 이름
- 클릭하면 선택(단일 선택), 선택된 슬롯의 `presetId`가 렌더 설정에 반영
- 빈 슬롯(DB에 데이터 없음): 점선 테두리 + "+" 아이콘, 클릭하면 Settings로 이동
- 우측 상단 "⚙ Settings에서 편집" 링크

### 데이터 흐름
```
Supabase overlay_presets 테이블
  → /api/overlay-presets GET (slot 1-6 전체 fetch)
  → Editor 페이지에서 useEffect로 로드
  → OverlayPresetSlots 컴포넌트에 props로 전달
  → 선택 시 selectedPresetId → buildSnapshot()에 반영
```

### 스키마 연동
`OverlayConfig.presetId` 필드에 선택된 슬롯의 DB id 저장.
기존 `"default"` presetId는 슬롯 1 선택으로 대체.

---

## 3. Settings 페이지

### 라우트
`src/app/settings/page.tsx` (신규)

### Nav
`src/app/layout.tsx`에 Settings 링크 추가 (Editor, History 오른쪽).

### 레이아웃
- 좌측 사이드바: 6개 슬롯 목록 (썸네일 + 이름 + 앵커 위치 요약)
- 우측 에디터: 선택된 슬롯의 전체 설정 폼

### 폼 섹션
| 섹션 | 필드 |
|---|---|
| 타이포그래피 | 아티스트 폰트/크기/굵기, 곡명 폰트/크기/굵기, 텍스트 정렬, 줄 높이 |
| 텍스트 배경 | 카드 활성화 토글, 배경색, 불투명도, 블러, 모서리 둥글기 |
| 위치 | 앵커(3×3 그리드 클릭), X/Y 오프셋 |
| 애니메이션 | fadeInSec, fadeOutSec, 메모(자유 텍스트) |

**애니메이션 메모**: 자유 텍스트 입력 → DB에 저장. API 호출 없음. 사용자가 메모를 보고 fadeInSec/fadeOutSec를 직접 설정.

### 실시간 미리보기
- 우측 에디터 상단에 고정
- 폼 값 변경 시 즉시 반영 (React state → CSS/inline style 업데이트)
- 샘플 텍스트: "Dynamic Duo · CHEN(첸)" / "nosedive (기다렸다 가)"
- 배경: 그라디언트 고정 (실제 배경 이미지 없이)

### 저장
"저장" 버튼 클릭 → `PATCH /api/overlay-presets/[slotId]` → Supabase upsert

---

## 4. Supabase DB 스키마

```sql
CREATE TABLE overlay_presets (
  id          TEXT PRIMARY KEY,        -- "slot-1" ~ "slot-6"
  slot_index  INTEGER UNIQUE NOT NULL, -- 1~6
  name        TEXT NOT NULL,
  renderer    TEXT NOT NULL DEFAULT 'drawtext',

  -- layout
  anchor      TEXT NOT NULL DEFAULT 'bottom-left',
  offset_x    INTEGER NOT NULL DEFAULT 80,
  offset_y    INTEGER NOT NULL DEFAULT -160,

  -- typography
  artist_font_family  TEXT NOT NULL DEFAULT 'AppleSDGothicNeo',
  artist_font_size    INTEGER NOT NULL DEFAULT 32,
  artist_weight       INTEGER NOT NULL DEFAULT 500,
  title_font_family   TEXT NOT NULL DEFAULT 'AppleSDGothicNeo',
  title_font_size     INTEGER NOT NULL DEFAULT 42,
  title_weight        INTEGER NOT NULL DEFAULT 700,
  text_align          TEXT NOT NULL DEFAULT 'left',
  line_height         REAL NOT NULL DEFAULT 1.15,
  letter_spacing      INTEGER NOT NULL DEFAULT 0,
  max_lines_title     INTEGER NOT NULL DEFAULT 2,

  -- color
  color_artist    TEXT NOT NULL DEFAULT '#FFFFFF',
  color_title     TEXT NOT NULL DEFAULT '#FFFFFF',
  color_bg        TEXT,
  color_shadow    TEXT,

  -- card background
  card_enabled    BOOLEAN NOT NULL DEFAULT false,
  card_padding_x  INTEGER NOT NULL DEFAULT 32,
  card_padding_y  INTEGER NOT NULL DEFAULT 24,
  card_radius     INTEGER NOT NULL DEFAULT 24,
  card_blur       INTEGER NOT NULL DEFAULT 0,
  card_opacity    REAL NOT NULL DEFAULT 1.0,

  -- animation
  fade_in_sec     REAL NOT NULL DEFAULT 0.3,
  fade_out_sec    REAL NOT NULL DEFAULT 0.5,
  anim_memo       TEXT,               -- 자유 텍스트 메모

  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. API Routes

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/overlay-presets` | 슬롯 1-6 전체 반환 |
| PATCH | `/api/overlay-presets/[slotId]` | 단일 슬롯 upsert |

두 라우트 모두 `src/app/api/overlay-presets/` 아래 생성.
응답은 `OverlayPresetSchema`(기존 Zod 스키마)로 검증.

DB row → `OverlayPreset` 변환 함수 `rowToPreset()` 를 `src/lib/presets.ts`에 작성.

---

## 6. 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|---|---|---|
| `OverlayPresetSlots` | `src/components/editor/OverlayPresetSlots.tsx` | 에디터 내 6개 슬롯 선택 그리드 |
| `SettingsPage` | `src/app/settings/page.tsx` | Settings 전체 페이지 |
| `PresetEditor` | `src/components/settings/PresetEditor.tsx` | 우측 폼 + 실시간 미리보기 |
| `PresetSidebar` | `src/components/settings/PresetSidebar.tsx` | 좌측 슬롯 목록 |

---

## 7. 스키마 변경 없음

`OverlayPreset` Zod 스키마(`src/lib/schema.ts`)는 이미 모든 필드를 포함.
DB row를 이 스키마로 파싱하는 어댑터 레이어만 추가.

---

## 8. 범위 외

- 오버레이 렌더링 로직(`renderVideo.ts`) 변경 없음 — presetId로 DB 프리셋을 로드하는 부분은 이미 구조화되어 있음
- 인증/권한 없음 (로컬 내부 툴)
- 슬롯 순서 재정렬 없음
