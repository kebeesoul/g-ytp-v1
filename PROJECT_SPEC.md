# PROJECT_SPEC.md — g-ytp-v1

YouTube 음악 플레이리스트 채널(hushwav 등) 영상 제작 자동화 툴 — 구현 매뉴얼.

> **본 문서의 위치**: 키비의 듀얼 파일 시스템에서 `CLAUDE.md`(MODE 1 PM/Architect 표준값)와 `AGENTS.md`(MODE 2 Implementation Engine 표준값) 위에 얹는 **이 프로젝트 고유의 구현 진실 출처**.
>
> Claude Code는 다음 우선순위로 결정한다:
> 1. 키비의 명시적 지시 (대화 중)
> 2. **본 PROJECT_SPEC.md (최신)**
> 3. CLAUDE.md / AGENTS.md (프로젝트 표준값)
> 4. 일반 모범 사례
>
> 본 문서는 SPEC v3.5 — 외부 분석 검토 반영 (Render Execution Policy + Design Layer + DB 상태 원천화 + Sprint 4 분할).

---

## 0. 검토 결과 — 해결된 모순점 및 결정사항

### 0.1 v3.1까지 락인된 결정 (유지)

| # | 항목 | 해결 |
|---|---|---|
| 1 | 업로드 시점에 exportId가 없음 | Editor 진입 시 `editorSessionId` 생성, Export 시 `exportId = editorSessionId`로 확정 |
| 2 | 재익스포트 시 음원 파일 경로 충돌 | 재익스포트 시 import 파일을 새 폴더로 **복사** |
| 3 | render_jobs cascade 누락 | 삭제 순서에 render_jobs DELETE 단계 추가 |
| 4 | History 진입 시 다운로드 버튼 | **없음**. 단, **마지막 Export 시점 상태 100% 복원 보장** |
| 5 | 좀비 잡 정리 | **부팅 시 일괄 + 폴링 시 감지 (이중 방어)** |

### 0.2 v3.5 신규 락인 (외부 분석 검토 반영)

| # | 항목 | 결정 |
|---|---|---|
| 6 | `/api/export` 역할 충돌 | **제거**. `/api/render`가 후처리까지 책임. 단일 진입점 |
| 7 | `ActiveRenderSchema.jobId` null 충돌 | **A안**: jobId 수신 후에만 localStorage 저장 |
| 8 | `render_jobs.project_id`와 projects 부재 | **projects를 렌더 시작 시점에 INSERT** (status='rendering'). FK 정합성 확보 |
| 9 | 삭제 Cascade 동시성 위험 | **STEP 0 추가**: running/queued 잡 존재 시 삭제 거부 (409) |
| 10 | Overlay preset 디자인 변경 시 과거 재현 불가 | **`presetVersion` 추가**. preset 수정 시 version 증가 |
| 11 | drawtext 단일 의존 | **`renderer` 분리** (drawtext / png_card). v1은 drawtext 구현, png_card는 스키마/폴더만 |
| 12 | 출력 포맷 mov 고정 | **mp4 기본** + mov 선택 (라디오) |
| 13 | crossfade 2초 고정 | **`crossfadeSec` 숫자화** (스키마). v1 UI는 2초 기본값 노출 |
| 14 | 배경 fit 정책 부재 | **`fit/dim/blur` 스키마 슬롯**. v1 UI는 cover + dim 0.25 기본값 |
| 15 | 트랙 간 음량 편차 | **EBU R128 loudness normalize v1부터 적용** |
| 16 | Next API에 FFmpeg 직접 실행 | **Render Execution Policy 신설**. 코어 분리 + DB 상태 원천화 + 동시성 6중 방어 |
| 17 | 렌더 후처리 중간 실패 | DB가 상태 원천 (`projects.status`, `render_jobs.status`). try/catch/finally + graceful shutdown |

---

## 1. 프로젝트 정체성

- **이름**: `g-ytp-v1`
- **목적**: YouTube 음악 플레이리스트 채널 영상 제작 자동화
- **운영 환경**: localhost dev (Next.js), Mac Studio M1
- **상태**: v1 (Editor + History + Export)
- **별개 프로젝트**: `galaxymap_ytp_v2`(Remotion Curator 라인)와 무관

---

## 2. 핵심 식별자(ID) 체계

설계의 정합성을 결정짓는 가장 중요한 부분.

| ID | 생성 시점 | 생성 주체 | 수명 | 용도 |
|---|---|---|---|---|
| `editorSessionId` | Editor 진입 (신규/기존 모두) | 클라이언트 | Editor 페이지 세션 | 업로드 시 폴더명 |
| `exportId` | Export 클릭 시 확정 | 클라이언트(editorSessionId 승격) | 영구 | DB `projects.id`, Storage 폴더명 |
| `jobId` | Export 클릭 → API 호출 시 | 서버 | 렌더 종료 후 영구 보존 | DB `render_jobs.id`, FFmpeg 임시 폴더명 |

### 관계
```
editorSessionId ─(Export 클릭)─▶ exportId
                                    │
                                    ├─ projects.id
                                    ├─ render_jobs.project_id
                                    ├─ import/{exportId}/
                                    └─ export/{exportId}/

jobId ─▶ render_jobs.id
      └─ workspace/tmp/{jobId}/
```

### 핵심 규칙
- 신규 프로젝트: `editorSessionId = exportId` (동일 UUID)
- 기존 프로젝트(History 진입): 새 `editorSessionId` 생성 ≠ 기존 `exportId`. 재익스포트 시 새 `exportId` 발급.
- 1개의 exportId당 1개의 projects 레코드, 1~N개의 render_jobs 레코드 (재시도 가능성).

---

## 3. 전체 흐름도

### 3.1 신규 프로젝트 — Editor 진입부터 Export까지

```
[/editor 진입 (신규)]
     │
     ├─ editorSessionId = crypto.randomUUID() 생성
     └─ React state 초기화 (빈 트랙리스트, 빈 배경)

[음원 업로드]
     ├─ POST /api/upload (multipart, editorSessionId 동봉)
     ├─ 서버: music-metadata 파싱
     ├─ 서버: Supabase Storage import/{editorSessionId}/track_xxx.mp3 업로드
     └─ Track[] 반환 (storagePath = import/{editorSessionId}/track_xxx.mp3)

[배경 업로드]
     ├─ POST /api/upload-bg (multipart, editorSessionId 동봉)
     ├─ 서버: mime 판별 (image/video)
     ├─ 서버: Storage import/{editorSessionId}/bg.{ext} 업로드
     └─ Background 반환

[제목 입력 + Overlay 설정 + Transition 선택 + 출력 포맷 선택]
     └─ React state 업데이트만 (서버 호출 없음)

[Export 클릭]
     │
     ├─ 1. 클라이언트: 제목 validation (min 1자)
     ├─ 2. 클라이언트: exportId = editorSessionId (확정)
     ├─ 3. POST /api/render { snapshot, exportId }
     │      ├─ 서버: snapshot zod 검증 (ProjectSnapshotSchema)
     │      ├─ 서버: ensureBootCleanup() 호출 (싱글톤)
     │      ├─ 서버: DB 동시성 체크 — 다른 running/queued 잡 존재 시 409 (Render Execution Policy D)
     │      ├─ 서버: jobId 생성
     │      ├─ 서버: projects INSERT { id: exportId, snapshot, status: 'rendering', ... } ← 즉시
     │      ├─ 서버: render_jobs INSERT { id: jobId, project_id: exportId, status: 'queued' }
     │      ├─ 서버: void startRenderJob(jobId) — 비차단 백그라운드 시작
     │      └─ 응답: { jobId, exportId }
     │
     ├─ 4. 클라이언트: localStorage['gytpv1:active-render'] = { exportId, jobId } ← 수신 후에만
     ├─ 5. 클라이언트: 5초 간격 폴링 시작 (GET /api/render-status/{jobId})
     │
     └─ 6. 서버 백그라운드 (lib/render/runRenderPipeline.ts)
            │
            ├─ try {
            │   ├─ render_jobs UPDATE status='running'
            │   ├─ activeProcesses.set(jobId, ...) 등록 (Policy E)
            │   ├─ STEP A: import 파일 복사 (재익스포트인 경우)
            │   ├─ STEP B: Phase 1 오디오 concat + loudness normalize
            │   │            → workspace/tmp/{jobId}/concat.m4a
            │   ├─ STEP C: Phase 2 영상 합성 + 오버레이
            │   │            → workspace/tmp/{jobId}/final.{mp4|mov}
            │   ├─ STEP D: 썸네일 추출 (640×360)
            │   │            → Storage import/{exportId}/thumbnail.jpg
            │   ├─ STEP E: tracklist.txt 생성
            │   │            → Storage export/{exportId}/tracklist.txt
            │   ├─ render_jobs UPDATE status='done', output_path=...
            │   └─ projects UPDATE status='done', thumbnail_path=..., exported_at=now()
            │ } catch (err) {
            │   ├─ render_jobs UPDATE status='error', error_msg=...
            │   └─ projects UPDATE status='error'
            │ } finally {
            │   ├─ activeProcesses.delete(jobId)
            │   └─ workspace/tmp/{jobId}/concat.m4a 등 중간 파일 정리 (final.mov는 유지)
            │ }

[클라이언트 폴링: status='done' 수신]
     ├─ [⬇ 다운로드] 버튼 활성화 (현재 세션 한정)
     ├─ Tracklist 컴포넌트 표시 + 복사 버튼
     └─ localStorage['gytpv1:active-render'] 삭제

[클라이언트 폴링: status='error' 수신]
     ├─ 에러 메시지 표시 (error_msg)
     └─ localStorage 정리
```

> **핵심 변경**: `/api/export` 엔드포인트는 제거됨. 모든 후처리(썸네일/tracklist/projects 업데이트)는 `runRenderPipeline` 안에서 처리. 중간 실패 상태 발생 차단.
```

### 3.2 기존 프로젝트 — History 진입 후 재익스포트

**복원 보장 (락인)**: 진입 시 마지막 Export 시점의 상태를 100% 동일하게 복원.

| 항목 | 저장 위치 | 복원 방식 |
|---|---|---|
| 플레이리스트 제목 | `snapshot.title` | hydrate |
| 트랙 순서 | `snapshot.tracks[].order` | hydrate |
| 트랙 아티스트명/곡명 (편집된 값 포함) | `snapshot.tracks[].artist / title` | hydrate |
| 음원 파일 (재생 가능 상태) | Storage `import/{oldExportId}/...` | snapshot.tracks[].storagePath로 재로드 |
| 배경 이미지/영상 | Storage `import/{oldExportId}/bg.*` | snapshot.background.storagePath로 재로드 |
| Transition (silence/crossfade) | `snapshot.renderConfig.transition` | hydrate |
| Overlay 표시 모드 (0/2/5/full) | `snapshot.renderConfig.overlay.displayMode` | hydrate |
| 해시태그 | `snapshot.hashtags` | hydrate |

> snapshot은 **Export 시점의 최종 상태**를 jsonb 컬럼에 원자적으로 저장. 어느 항목도 누락되지 않음.
> 복원 후 다운로드 버튼은 표시되지 않음 (mov는 로컬 workspace에만 존재했고 이미 휘발).
> 다운로드가 필요하면 재익스포트 진행.

```
[/history → 카드 클릭 → /editor?from={oldExportId}]
     │
     ├─ 1. 클라이언트: GET /api/project/{oldExportId}
     │      └─ 응답: ProjectRecord { snapshot, title, ... }
     │      └─ zod 검증: ProjectSnapshotSchema 적용 (실패 시 에러 표시)
     ├─ 2. 클라이언트: 새 editorSessionId = crypto.randomUUID() (oldExportId와 다름)
     ├─ 3. 클라이언트: snapshot으로 React state hydrate
     │      ├─ TitleInput에 snapshot.title 주입
     │      ├─ TrackList에 snapshot.tracks 주입 (order 순)
     │      ├─ BackgroundPicker에 snapshot.background 주입
     │      ├─ RenderConfig 라디오 버튼 상태 복원
     │      └─ Track.storagePath는 그대로 import/{oldExportId}/... 유지 (재생용)
     └─ 4. UI 렌더 — Export 직전 상태 그대로 복원

[편집 작업 — 트랙 추가/삭제/순서 변경 등]
     │
     ├─ 새 음원 추가 시: POST /api/upload (editorSessionId 동봉)
     │      └─ Storage import/{editorSessionId}/track_xxx.mp3 (새 폴더)
     └─ 결과: snapshot 안에 두 종류 storagePath 공존
             - 기존 곡: import/{oldExportId}/...
             - 새 곡:   import/{editorSessionId}/...

[Export 클릭]
     │
     ├─ 1. exportId = editorSessionId (신규 UUID)
     ├─ 2. POST /api/render { snapshot, exportId }
     ├─ 3. 서버: import 파일 통합 복사 (락인)
     │      ├─ snapshot.tracks 각 storagePath에서
     │      │   → Storage import/{exportId}/track_xxx.mp3 로 복사
     │      ├─ snapshot.background.storagePath 도 마찬가지
     │      └─ 복사 후 snapshot의 storagePath들을 새 경로로 업데이트
     ├─ 4. 렌더 진행 (이하 신규 프로젝트와 동일)
     └─ 5. projects INSERT { id: exportId (신규), ... }
            ※ History에 새 카드 추가됨 (이전 카드는 그대로 유지)
            ※ 이전 프로젝트가 보호됨 — 음원 파일이 새 폴더에 복사되었으므로
              이전 프로젝트 삭제해도 새 프로젝트 깨지지 않음
```

### 3.3 페이지 이탈/복귀

```
[Editor에서 렌더 진행 중]
     │
     └─ 페이지 이탈 (다른 메뉴, 새 탭, 브라우저 종료 등)
            ├─ React state 소멸
            ├─ FFmpeg는 서버에서 계속 진행
            ├─ render_jobs DB는 계속 업데이트
            └─ localStorage['gytpv1:active-render'] 유지

[같은 프로젝트로 복귀 — /editor?from={exportId} 또는 /editor]
     │
     ├─ 1. useEffect: localStorage['gytpv1:active-render'] 확인
     ├─ 2. 발견 시: GET /api/render-status/{jobId}
     ├─ 3. 분기:
     │      ├─ status='running' 또는 'queued' → 폴링 재개, 진행률 표시
     │      ├─ status='done' → 다운로드 버튼 표시, localStorage 정리
     │      └─ status='error' → 에러 메시지, localStorage 정리
     └─ 4. localStorage 없음 → 새 작업으로 처리
```

---

## 4. 데이터 모델 (zod 스키마 전체)

```typescript
// lib/schema.ts
import { z } from "zod";

// ─── 트랙 ───────────────────────────────────────────────
export const TrackSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  storagePath: z.string(),          // import/{exportId}/track_xxx.mp3
  artist: z.string(),
  title: z.string(),
  durationSec: z.number().positive(),
  order: z.number().int().nonneg(),
});
export type Track = z.infer<typeof TrackSchema>;

// ─── 배경 ───────────────────────────────────────────────
export const BackgroundSchema = z.object({
  kind: z.enum(["image", "video"]),
  storagePath: z.string(),
  durationSec: z.number().optional(),

  // v3.5 신규 — UI는 v1에서 노출 안 함, 기본값으로 렌더
  fit: z.enum(["cover", "contain", "blurred_contain"]).default("cover"),
  dim: z.number().min(0).max(1).default(0.25),        // 가독성용 어둡게
  blur: z.number().min(0).max(50).default(0),
  cropPosition: z.enum(["center", "top", "bottom"]).default("center"),
});
export type Background = z.infer<typeof BackgroundSchema>;

// ─── 오버레이 프리셋 (Design Layer) ──────────────────────
// v1은 "default" 프리셋 1종만 하드코딩. v1.5+ JSON 파일 시스템.
export const OverlayPresetSchema = z.object({
  id: z.string(),                            // "default", "minimal-left" 등
  version: z.number().int().positive(),      // preset 수정 시 증가
  renderer: z.enum(["drawtext", "png_card"]).default("drawtext"),

  layout: z.object({
    anchor: z.enum([
      "top-left", "top-center", "top-right",
      "center",
      "bottom-left", "bottom-center", "bottom-right",
    ]).default("bottom-left"),
    x: z.number().default(80),
    y: z.number().default(-160),             // h-160 의미 (음수 = 하단 기준)
    width: z.number().optional(),
    height: z.number().optional(),
    safeMarginX: z.number().default(96),
    safeMarginY: z.number().default(72),
  }),

  typography: z.object({
    artistFontFamily: z.string().default("AppleSDGothicNeo"),
    titleFontFamily: z.string().default("AppleSDGothicNeo"),
    artistFontSize: z.number().default(32),
    titleFontSize: z.number().default(42),
    artistWeight: z.number().default(500),
    titleWeight: z.number().default(700),
    letterSpacing: z.number().default(0),
    lineHeight: z.number().default(1.15),
    maxLinesTitle: z.number().default(2),
    textAlign: z.enum(["left", "center", "right"]).default("left"),
  }),

  color: z.object({
    artist: z.string().default("#FFFFFF"),
    title: z.string().default("#FFFFFF"),
    background: z.string().optional(),
    shadow: z.string().optional(),
  }),

  card: z.object({
    enabled: z.boolean().default(false),
    paddingX: z.number().default(32),
    paddingY: z.number().default(24),
    radius: z.number().default(24),
    blur: z.number().default(0),
    opacity: z.number().default(1),
  }),

  animation: z.object({
    fadeInSec: z.number().default(0.3),
    fadeOutSec: z.number().default(0.5),
  }),
});
export type OverlayPreset = z.infer<typeof OverlayPresetSchema>;

// ─── 오버레이 설정 (Editor에서 선택) ─────────────────────
export const OverlayConfigSchema = z.object({
  displayMode: z.enum(["0", "2", "5", "full"]).default("5"),
  presetId: z.string().default("default"),
  presetVersion: z.number().int().positive().default(1),  // v3.5 신규
});
export type OverlayConfig = z.infer<typeof OverlayConfigSchema>;

// ─── 오디오 설정 (v3.5 신규) ─────────────────────────────
export const AudioConfigSchema = z.object({
  normalize: z.enum(["off", "ebu_r128"]).default("ebu_r128"),  // v1부터 ON
  targetLufs: z.number().default(-14),                          // YouTube 표준
  truePeakDb: z.number().default(-1),
});
export type AudioConfig = z.infer<typeof AudioConfigSchema>;

// ─── 트랜지션 (v3.5 확장) ────────────────────────────────
export const TransitionConfigSchema = z.object({
  type: z.enum(["silence", "crossfade"]).default("crossfade"),
  crossfadeSec: z.number().min(0).max(10).default(2),  // v1 UI는 2초 노출
});
export type TransitionConfig = z.infer<typeof TransitionConfigSchema>;

// ─── 썸네일 설정 (스키마 슬롯만, v1은 extract 고정) ──────
export const ThumbnailConfigSchema = z.object({
  mode: z.enum(["extract", "designed"]).default("extract"),
  presetId: z.string().default("default"),
  presetVersion: z.number().int().positive().default(1),
});
export type ThumbnailConfig = z.infer<typeof ThumbnailConfigSchema>;

// ─── 렌더 설정 ──────────────────────────────────────────
export const RenderConfigSchema = z.object({
  transition: TransitionConfigSchema,
  overlay: OverlayConfigSchema,
  audio: AudioConfigSchema,
  thumbnail: ThumbnailConfigSchema,
  outputFormat: z.enum(["mp4", "mov"]).default("mp4"),  // v3.5: mp4 기본
  audioBitrateKbps: z.literal(192),
  resolution: z.tuple([z.literal(1920), z.literal(1080)]),
  hwaccel: z.enum(["videotoolbox", "none"]).default("videotoolbox"),
});
export type RenderConfig = z.infer<typeof RenderConfigSchema>;

// ─── 프로젝트 스냅샷 (Editor 상태 전체) ──────────────────
export const ProjectSnapshotSchema = z.object({
  title: z.string().min(1),
  tracks: z.array(TrackSchema),
  background: BackgroundSchema.nullable(),
  renderConfig: RenderConfigSchema,
  hashtags: z.array(z.string()),
});
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

// ─── Supabase DB: projects 테이블 (v3.5: status 추가) ────
export const ProjectRecordSchema = z.object({
  id: z.string().uuid(),               // = exportId
  title: z.string().min(1),
  snapshot: ProjectSnapshotSchema,
  status: z.enum(["rendering", "done", "error"]),   // v3.5 신규
  thumbnail_path: z.string().nullable(),
  export_folder: z.string(),           // export/{exportId}/
  latest_job_id: z.string().uuid().nullable(),      // v3.5 신규
  exported_at: z.string().datetime().nullable(),    // v3.5: nullable (rendering 중에는 null)
  created_at: z.string().datetime(),
});
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;

// ─── Supabase DB: render_jobs 테이블 ─────────────────────
export const RenderJobRecordSchema = z.object({
  id: z.string().uuid(),               // = jobId
  project_id: z.string().uuid(),       // = exportId (NOT NULL)
  status: z.enum(["queued", "running", "done", "error"]),
  progress: z.number().min(0).max(1),
  eta_sec: z.number().nullable(),
  output_path: z.string().nullable(),  // workspace/tmp/{jobId}/final.{mp4|mov}
  error_msg: z.string().nullable(),
  started_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
});
export type RenderJobRecord = z.infer<typeof RenderJobRecordSchema>;

// ─── localStorage 상태 (v3.5: jobId 수신 후에만 저장) ────
export const ActiveRenderSchema = z.object({
  exportId: z.string().uuid(),
  jobId: z.string().uuid(),            // null 불허 — A안 확정
});
export type ActiveRender = z.infer<typeof ActiveRenderSchema>;

// ─── 트랙리스트 (익스포트 결과) ──────────────────────────
export const TracklistLineSchema = z.object({
  timecode: z.string(),                // "00:00"
  artist: z.string(),
  title: z.string(),
});
export const TracklistSchema = z.object({
  lines: z.array(TracklistLineSchema),
  hashtags: z.array(z.string()),
});
export type Tracklist = z.infer<typeof TracklistSchema>;
```

// ─── 트랙리스트 (익스포트 결과) ──────────────────────────
export const TracklistLineSchema = z.object({
  timecode: z.string(),                // "00:00"
  artist: z.string(),
  title: z.string(),
});
export const TracklistSchema = z.object({
  lines: z.array(TracklistLineSchema),
  hashtags: z.array(z.string()),
});
export type Tracklist = z.infer<typeof TracklistSchema>;
```

---

## 5. Supabase 구조

### 5.1 DB 마이그레이션

```sql
-- supabase/migrations/0001_create_projects.sql
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  snapshot        jsonb not null,
  status          text not null default 'rendering'
                  check (status in ('rendering', 'done', 'error')),  -- v3.5
  thumbnail_path  text,
  export_folder   text not null,
  latest_job_id   uuid,                                              -- v3.5
  exported_at     timestamptz,                                       -- v3.5: nullable
  created_at      timestamptz not null default now()
);
create index idx_projects_status on public.projects (status);
alter table public.projects disable row level security;
```

```sql
-- supabase/migrations/0002_create_render_jobs.sql
create table public.render_jobs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null,
  status        text not null check (status in ('queued','running','done','error')),
  progress      numeric(4,3) default 0,
  eta_sec       integer,
  output_path   text,
  error_msg     text,
  started_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  completed_at  timestamptz
);
create index idx_render_jobs_project on public.render_jobs (project_id);
create index idx_render_jobs_status on public.render_jobs (status);
alter table public.render_jobs disable row level security;
```

```sql
-- supabase/migrations/0003_add_project_render_link.sql (v3.5 신규)
-- projects ↔ render_jobs FK 명시 (cascade는 애플리케이션에서 처리하므로 ON DELETE 정책은 없음)
alter table public.render_jobs
  add constraint fk_render_jobs_project
  foreign key (project_id) references public.projects(id);

-- latest_job_id 도 FK (참조 무결성)
alter table public.projects
  add constraint fk_projects_latest_job
  foreign key (latest_job_id) references public.render_jobs(id)
  deferrable initially deferred;  -- 동시 INSERT 순서 문제 회피
```

> **마이그레이션 규칙**: 스키마 변경 시 새 마이그레이션 파일 생성. Supabase Studio 직접 편집 금지.

### 5.2 Storage 구조

```
bucket: g-ytp-v1
│
├── import/{exportId}/
│   ├── track_001.mp3              ← 음원 원본
│   ├── track_002.mp3
│   ├── ...
│   ├── bg.jpg | bg.mp4            ← 배경
│   └── thumbnail.jpg              ← 640×360 (History 카드용)
│
└── export/{exportId}/
    └── tracklist.txt              ← 텍스트만. mov/mp4는 로컬에만 존재.
```

> 출력 파일(`.mp4` 또는 `.mov`)은 Storage에 업로드하지 않음. 파일 크기/비용 문제.
> `workspace/tmp/{jobId}/final.{mp4|mov}` 로컬에서만 직접 다운로드 (현재 세션 한정).

---

## 6. API 엔드포인트 매트릭스

| Method | Path | Body / Query | Response | 비고 |
|---|---|---|---|---|
| POST | `/api/upload` | multipart + `editorSessionId` | `Track[]` | Storage 업로드 + 메타데이터 |
| POST | `/api/upload-bg` | multipart + `editorSessionId` | `Background` | mime 자동 판별 |
| POST | `/api/render` | `{snapshot, exportId}` | `{jobId, exportId}` | 후처리 포함. 동시 1개 제한 (409) |
| GET | `/api/render-status/[jobId]` | — | `RenderJobRecord` | in-mem 우선, DB fallback |
| GET | `/api/download/[jobId]` | — | mp4/mov 스트리밍 | 로컬 파일만, 현재 세션 한정 |
| GET | `/api/project` | — | `ProjectRecord[]` | History 목록 (status='done'만) |
| GET | `/api/project/[exportId]` | — | `ProjectRecord` | 단건 조회 |
| DELETE | `/api/project/[exportId]` | — | `{ok: true}` | cascade 삭제 (STEP 0 포함) |
| POST | `/api/description` | `{snapshot}` | `Tracklist` | 타임코드 계산 |

> **v3.5 변경**: `/api/export` 제거. 모든 후처리는 `/api/render` 단일 진입점에서 처리.

---

## 7. UI 페이지 구조

### 7.1 메뉴

```
┌─────────────────────────────────────────────┐
│  g-ytp-v1          [ Editor ]  [ History ]  │
└─────────────────────────────────────────────┘
```

### 7.2 Editor (`/editor`, `/editor?from={exportId}`)

```
┌──────────────────────────────────┬──────────────────────────┐
│  플레이리스트 제목: [__________] │  [Background]            │
│                                  │   [업로드 dropzone]      │
│  [Track List - DnD]              │   [미리보기 canvas]      │
│   ⠿ 01 Artist - Title  ▶ ✏ 🗑  │                          │
│   ⠿ 02 Artist - Title  ▶ ✏ 🗑  │  ──────────────────────  │
│   ⠿ 03 Artist - Title  ▶ ✏ 🗑  │  [Render Config]         │
│   + 음원 추가 (dropzone)          │   Transition:           │
│                                  │     ○ silence            │
│                                  │     ● crossfade 2s       │
│                                  │   Overlay 표시:          │
│                                  │     ○ 없음  ○ 2s        │
│                                  │     ● 5s    ○ Full      │
│                                  │   [▶ Export]            │
│                                  │   ▓▓▓▓▓░░░ 56% ETA 4:32│
│                                  │                          │
│                                  │  ──────────────────────  │
│                                  │  [⬇ 다운로드] (완료 후)  │
│                                  │  [Tracklist] (완료 후)   │
│                                  │   00:00 Artist - Title   │
│                                  │   03:42 ...              │
│                                  │   [📋 복사]               │
└──────────────────────────────────┴──────────────────────────┘
```

### 7.3 History (`/history`)

```
[ 과거 익스포트 프로젝트 ]

┌──────────┐  ┌──────────┐  ┌──────────┐
│[썸네일]  │  │[썸네일]  │  │[썸네일]  │
│640×360   │  │          │  │          │
│제목      │  │제목      │  │제목      │
│2026.05.13│  │2026.05.10│  │2026.05.07│
│[편집][삭]│  │[편집][삭]│  │[편집][삭]│
└──────────┘  └──────────┘  └──────────┘
```

- **편집**: `/editor?from={exportId}` 이동, snapshot hydrate
- **삭제**: confirm 모달 후 cascade DELETE 실행

---

## 8. Export 플로우 (단계별 검증)

```
[Export 클릭]
   │
   │ ╔════════════════════════════════════════╗
   │ ║ STEP 1: 클라이언트 사전 검증           ║
   │ ╠════════════════════════════════════════╣
   │ ║ ✓ 제목 1자 이상                       ║
   │ ║ ✓ 트랙 1개 이상                       ║
   │ ║ ✓ 배경 존재                           ║
   │ ║ ✓ localStorage에 active-render 없음   ║
   │ ║   (있다면 진행 중인 렌더 표시)        ║
   │ ╚════════════════════════════════════════╝
   │
   ├─ POST /api/render { snapshot, exportId } ← 단일 진입점 (v3.5)
   │
   │ ╔════════════════════════════════════════╗
   │ ║ STEP 2: 서버 사전 검증 + INSERT        ║
   │ ╠════════════════════════════════════════╣
   │ ║ ✓ ensureBootCleanup() (싱글톤)        ║
   │ ║ ✓ snapshot zod 검증                   ║
   │ ║ ✓ DB 동시성 — render_jobs SELECT      ║
   │ ║   queued/running 존재 시 → 409         ║
   │ ║ ✓ jobId 생성                          ║
   │ ║ ✓ projects INSERT status='rendering'  ║ ← v3.5: 즉시
   │ ║ ✓ render_jobs INSERT status='queued'  ║
   │ ║ ✓ void startRenderJob(jobId)          ║ ← 비차단
   │ ║ ✓ 응답 { jobId, exportId }            ║
   │ ╚════════════════════════════════════════╝
   │
   ├─ 클라이언트: localStorage = { exportId, jobId } ← jobId 수신 후 (A안)
   ├─ 클라이언트: 폴링 시작 (5초 간격)
   │
   │ ╔════════════════════════════════════════╗
   │ ║ STEP 3: 비동기 import 복사            ║
   │ ║   (재익스포트인 경우만)               ║
   │ ╠════════════════════════════════════════╣
   │ ║ snapshot.tracks 각 storagePath        ║
   │ ║   기존 경로 → import/{exportId}/      ║
   │ ║ snapshot.background.storagePath 동일  ║
   │ ║ snapshot의 storagePath들 업데이트     ║
   │ ╚════════════════════════════════════════╝
   │
   │ ╔════════════════════════════════════════╗
   │ ║ STEP 4: FFmpeg Phase 1 (오디오)       ║
   │ ╠════════════════════════════════════════╣
   │ ║ Storage import/{exportId}/ 다운로드   ║
   │ ║   → workspace/tmp/{jobId}/audio/      ║
   │ ║ concat (silence | crossfade Ns)       ║
   │ ║   → concat_raw.wav                    ║
   │ ║ 진행률: 0 ~ 0.10                       ║
   │ ╚════════════════════════════════════════╝
   │
   │ ╔════════════════════════════════════════╗
   │ ║ STEP 5: Loudness Normalize (v3.5)     ║
   │ ╠════════════════════════════════════════╣
   │ ║ EBU R128 2-pass                       ║
   │ ║   1차: 통계 측정                       ║
   │ ║   2차: 정규화 + AAC 192kbps           ║
   │ ║   → concat.m4a                        ║
   │ ║ 진행률: 0.10 ~ 0.15                    ║
   │ ║ (normalize=off 시 건너뛰기, 0.15 도달) ║
   │ ╚════════════════════════════════════════╝
   │
   │ ╔════════════════════════════════════════╗
   │ ║ STEP 6: FFmpeg Phase 2 (영상)         ║
   │ ╠════════════════════════════════════════╣
   │ ║ 배경 + concat.m4a + drawtext 오버레이 ║
   │ ║   → workspace/tmp/{jobId}/final.{mp4|mov} ║
   │ ║ 진행률: 0.15 ~ 1.0                     ║
   │ ║ DB UPDATE 5초마다 (fire-and-forget)   ║
   │ ╚════════════════════════════════════════╝
   │
   │ ╔════════════════════════════════════════╗
   │ ║ STEP 7: 후처리 (runRenderPipeline 내) ║
   │ ╠════════════════════════════════════════╣
   │ ║ 1. 썸네일 추출 (640×360)              ║
   │ ║ 2. 썸네일 업로드 → Storage import/    ║
   │ ║ 3. tracklist.txt 생성                  ║
   │ ║ 4. tracklist 업로드 → Storage export/ ║
   │ ║ 5. render_jobs UPDATE status='done'   ║
   │ ║ 6. projects UPDATE status='done',     ║
   │ ║    thumbnail_path, exported_at        ║
   │ ╚════════════════════════════════════════╝
   │
   ├─ 클라이언트(폴링): status='done' 수신
   ├─ 클라이언트: [⬇ 다운로드] 활성화
   ├─ 클라이언트: Tracklist 컴포넌트 표시
   └─ 클라이언트: localStorage 정리
```

> **에러 시 거동**: try/catch에서 render_jobs.status='error' + error_msg, projects.status='error' 동시 갱신.
> 클라이언트 폴링이 error 수신 시 사용자에게 에러 메시지 + localStorage 정리.

---

## 9. 페이지 이탈/복귀 시나리오

### 9.1 시나리오 매트릭스

| 상황 | localStorage | DB render_jobs | 클라이언트 거동 |
|---|---|---|---|
| 신규 진입 (저장된 잡 없음) | 없음 | — | 빈 Editor |
| 렌더 중 같은 탭에 복귀 | 있음, jobId 유효 | status='running' | 폴링 재개, 진행률 표시 |
| 렌더 완료 후 복귀 (같은 세션) | 있음, jobId 유효 | status='done' | 다운로드 버튼 표시, localStorage 정리 |
| 에러 후 복귀 | 있음, jobId 유효 | status='error' | 에러 메시지, localStorage 정리 |
| 서버 재시작 후 복귀 | 있음, jobId 유효 | status='running' (좀비) | 서버 재시작 감지 → status='error'로 보정 후 안내 |
| localStorage만 있고 DB에 없음 | 있음 | 레코드 없음 | localStorage 정리, 빈 Editor |

### 9.2 좀비 잡 감지 (서버 재시작)

```typescript
// app/api/render-status/[id]/route.ts
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const parsed = z.string().uuid().safeParse(params.id);
  if (!parsed.success) return Response.json({ error: "invalid id" }, { status: 400 });

  // 1순위: in-memory
  const memJob = jobQueue.get(parsed.data);
  if (memJob) return Response.json(memJob);

  // 2순위: DB
  const { data } = await supabaseServer
    .from("render_jobs").select("*").eq("id", parsed.data).single();
  if (!data) return Response.json({ error: "not found" }, { status: 404 });

  // 좀비 감지: DB='running'인데 in-memory 없음 = 서버 재시작 흔적
  if (data.status === "running" && !memJob) {
    await supabaseServer
      .from("render_jobs")
      .update({
        status: "error",
        error_msg: "server restarted during render",
        completed_at: new Date().toISOString(),
      })
      .eq("id", parsed.data);
    return Response.json({ ...data, status: "error", error_msg: "server restarted during render" });
  }

  const verified = RenderJobRecordSchema.safeParse(data);
  if (!verified.success) return Response.json({ error: "invalid record" }, { status: 500 });
  return Response.json(verified.data);
}
```

---

## 10. 삭제 Cascade (검증 강화 버전)

### 10.1 순서

```
[History 카드 삭제 클릭]
   │
   ├─ 확인 모달 ("이 프로젝트와 모든 음원/배경/결과물이 삭제됩니다")
   ├─ DELETE /api/project/{exportId}
   │
   │ ╔════════════════════════════════════════════════════════════╗
   │ ║ STEP 0 (v3.5 신규): 진행 중인 렌더 차단                    ║
   │ ╠════════════════════════════════════════════════════════════╣
   │ ║ SELECT * FROM render_jobs                                  ║
   │ ║   WHERE project_id = exportId                              ║
   │ ║   AND status IN ('queued', 'running')                      ║
   │ ║                                                            ║
   │ ║ 결과 있음 → 409 "cannot delete while rendering"            ║
   │ ║ activeProcesses에도 있음 → 409 + child process 보호        ║
   │ ╚════════════════════════════════════════════════════════════╝
   │
   │ STEP 1: DB 레코드 존재 확인
   │   └─ 없으면 404 반환
   │
   │ STEP 2: Storage export 폴더 삭제 + 검증
   │   ├─ list files in export/{exportId}/
   │   ├─ remove 전체
   │   └─ 다시 list → 0개여야 함, 아니면 500
   │
   │ STEP 3: Storage import 폴더 삭제 + 검증
   │   ├─ list files in import/{exportId}/
   │   ├─ remove 전체
   │   └─ 다시 list → 0개여야 함, 아니면 500
   │
   │ STEP 4: projects.latest_job_id NULL로 설정
   │   └─ FK 제약 (deferred)이지만 명시적 해제 권장
   │
   │ STEP 5: render_jobs DELETE WHERE project_id={exportId}
   │   └─ 같은 exportId의 모든 잡 레코드 삭제
   │
   │ STEP 6: projects DELETE WHERE id={exportId}
   │   ├─ DB 삭제 실행
   │   └─ 다시 SELECT → null이어야 함, 아니면 500
   │
   └─ 모든 STEP 통과 시에만 { ok: true } 반환
       └─ 클라이언트: 카드 제거
       에러 시 → UI 변경 없음 + 토스트
```

### 10.2 구현

```typescript
// app/api/project/[id]/route.ts
import { activeProcesses } from "@/lib/render/processRegistry";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await ensureBootCleanup();  // 모든 API 진입점 공통

  const parsed = z.string().uuid().safeParse(params.id);
  if (!parsed.success) return Response.json({ error: "invalid id" }, { status: 400 });
  const exportId = parsed.data;
  const supabase = supabaseServer;

  // STEP 0 (v3.5 신규): 진행 중인 렌더 차단
  const { data: activeJobs } = await supabase
    .from("render_jobs")
    .select("id, status")
    .eq("project_id", exportId)
    .in("status", ["queued", "running"]);
  if (activeJobs && activeJobs.length > 0) {
    return Response.json(
      { error: "cannot delete project while render is running" },
      { status: 409 }
    );
  }
  // in-memory child process registry 이중 체크
  const hasActiveProcess = Array.from(activeProcesses.keys())
    .some(jobId => activeJobs?.some(j => j.id === jobId));
  if (hasActiveProcess) {
    return Response.json(
      { error: "render process still active" },
      { status: 409 }
    );
  }

  // STEP 1: DB 레코드 존재 확인
  const { data: record } = await supabase
    .from("projects").select("export_folder").eq("id", exportId).single();
  if (!record) return Response.json({ error: "not found" }, { status: 404 });

  // STEP 2: export folder
  const exportPrefix = `export/${exportId}/`;
  const exportList = await listAllStorageFiles(exportPrefix);
  if (exportList.length > 0) {
    const { error } = await supabase.storage.from("g-ytp-v1").remove(exportList);
    if (error) return Response.json({ error: "export remove failed" }, { status: 500 });
  }
  const exportLeft = await listAllStorageFiles(exportPrefix);
  if (exportLeft.length > 0)
    return Response.json({ error: "export not empty after remove" }, { status: 500 });

  // STEP 3: import folder
  const importPrefix = `import/${exportId}/`;
  const importList = await listAllStorageFiles(importPrefix);
  if (importList.length > 0) {
    const { error } = await supabase.storage.from("g-ytp-v1").remove(importList);
    if (error) return Response.json({ error: "import remove failed" }, { status: 500 });
  }
  const importLeft = await listAllStorageFiles(importPrefix);
  if (importLeft.length > 0)
    return Response.json({ error: "import not empty after remove" }, { status: 500 });

  // STEP 4: latest_job_id NULL 해제 (FK deferred지만 명시적 권장)
  await supabase.from("projects")
    .update({ latest_job_id: null })
    .eq("id", exportId);

  // STEP 5: render_jobs delete
  const { error: rjError } = await supabase
    .from("render_jobs").delete().eq("project_id", exportId);
  if (rjError) return Response.json({ error: "render_jobs delete failed" }, { status: 500 });

  // STEP 6: projects delete
  const { error: pError } = await supabase.from("projects").delete().eq("id", exportId);
  if (pError) return Response.json({ error: "projects delete failed" }, { status: 500 });
  const { data: check } = await supabase
    .from("projects").select("id").eq("id", exportId).maybeSingle();
  if (check) return Response.json({ error: "projects still exists" }, { status: 500 });

  return Response.json({ ok: true });
}
```

> STEP 0에서 차단 + child process registry 이중 체크로 렌더 중인 프로젝트 삭제는 구조적으로 차단됨.

---

## 11. Render Execution Policy (v3.5 신설)

### 11.1 원칙

> v1에서는 별도 `npm run worker` 프로세스를 두지 않는다.
> 렌더는 Next.js API Route에서 job 생성 후 Node 백그라운드 작업으로 실행한다.
>
> 단, FFmpeg 실행 로직은 API Route 파일에 직접 작성하지 않고,
> `lib/render/startRenderJob.ts`와 `lib/render/runRenderPipeline.ts`로 분리한다.
>
> 이 구조는 로컬 단일 사용자 환경의 실행 편의성을 우선한다.
> 추후 다중 사용자, 원격 서버, 장시간 안정성이 필요해질 경우
> 동일한 `startRenderJob()` 또는 `runRenderPipeline()`을
> 별도 worker 프로세스에서 호출하는 방식으로 전환할 수 있어야 한다.
>
> DB의 `render_jobs`가 상태의 원천이며,
> in-memory jobQueue는 현재 프로세스 안에서 진행 중인 작업을 추적하는 보조 캐시로만 사용한다.
>
> 서버 재시작, Hot Reload, 프로세스 종료로 인해 in-memory 상태가 사라질 수 있으므로,
> 부팅 시 `queued/running` 상태의 미완료 job은 `error`로 보정한다.

### 11.2 6중 방어 설계

| Layer | 방어 항목 | 구현 |
|---|---|---|
| **A** | API Route와 렌더 로직 분리 | `lib/render/*` 모듈화. API는 검증/응답만 |
| **B** | DB가 상태의 원천 | try/catch/finally + status 항상 기록 |
| **C** | 부팅 시 좀비 정리 | `ensureBootCleanup()` — `queued` + `running` 모두 |
| **D** | DB 기반 동시성 체크 | render_jobs SELECT로 사전 차단 |
| **E** | FFmpeg child process registry | `activeProcesses Map<jobId, ChildProcess>` |
| **F** | Graceful shutdown | SIGINT 핸들러로 child kill + DB 보정 |

### 11.3 코드 구조

```
app/api/render/route.ts          # 진입점 (얇음)
├─ validate snapshot (zod)
├─ ensureBootCleanup()
├─ DB 동시성 체크 (Layer D)
├─ projects INSERT (status='rendering')
├─ render_jobs INSERT (status='queued')
├─ void startRenderJob(jobId)    # 비차단
└─ return { jobId, exportId }

lib/render/
├─ startRenderJob.ts             # 중복 방지 + activeProcesses 등록 + runRenderPipeline 호출
├─ runRenderPipeline.ts          # try/catch/finally + DB 상태 갱신
├─ processRegistry.ts            # activeProcesses Map (Layer E)
├─ bootCleanup.ts                # ensureBootCleanup 싱글톤 (Layer C)
└─ gracefulShutdown.ts           # SIGINT 핸들러 (Layer F)

lib/ffmpeg/                      # 순수 FFmpeg 유틸 (렌더 흐름 모름)
├─ concatAudio.ts
├─ normalizeAudio.ts             # v3.5 신규 (EBU R128)
├─ renderVideo.ts
├─ overlayCompiler.ts            # preset → drawtext/png_card 분기
├─ overlayDrawtextRenderer.ts    # v1 구현
├─ overlayPngRenderer.ts         # v1.5 구현 (스켈레톤만)
├─ thumbnail.ts
└─ parseProgress.ts
```

### 11.4 핵심 패턴

**Layer A — API Route 얇게 유지**:
```typescript
// app/api/render/route.ts (전체 — 매우 짧음)
export async function POST(req: Request) {
  await ensureBootCleanup();

  const body = await req.json();
  const parsed = z.object({
    snapshot: ProjectSnapshotSchema,
    exportId: z.string().uuid(),
  }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  // Layer D: DB 동시성
  const { data: active } = await supabaseServer
    .from("render_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .limit(1);
  if (active && active.length > 0) {
    return Response.json({ error: "another render is in progress" }, { status: 409 });
  }

  const jobId = crypto.randomUUID();
  const { exportId, snapshot } = parsed.data;

  // projects 즉시 INSERT
  await supabaseServer.from("projects").insert({
    id: exportId,
    title: snapshot.title,
    snapshot,
    status: "rendering",
    export_folder: `export/${exportId}/`,
    latest_job_id: jobId,
    exported_at: null,
  });

  // render_jobs INSERT
  await supabaseServer.from("render_jobs").insert({
    id: jobId,
    project_id: exportId,
    status: "queued",
    progress: 0,
  });

  // 비차단 실행
  void startRenderJob(jobId).catch(err => {
    console.error("[render] startRenderJob threw:", err);
  });

  return Response.json({ jobId, exportId });
}
```

**Layer B — try/catch/finally**:
```typescript
// lib/render/runRenderPipeline.ts
export async function runRenderPipeline(jobId: string) {
  const supabase = supabaseServer;
  let exportId: string | null = null;

  try {
    const { data: job } = await supabase
      .from("render_jobs").select("*").eq("id", jobId).single();
    if (!job) throw new Error(`job ${jobId} not found`);
    exportId = job.project_id;

    await supabase.from("render_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    // 파이프라인 실행
    await copyImportIfNeeded(jobId, exportId);
    await runConcatAudio(jobId);
    await runNormalizeAudio(jobId);      // v3.5
    await runRenderVideo(jobId);
    await runThumbnail(jobId, exportId);
    await uploadTracklist(jobId, exportId);

    await supabase.from("render_jobs")
      .update({
        status: "done",
        progress: 1,
        output_path: `workspace/tmp/${jobId}/final.${getExtension()}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await supabase.from("projects")
      .update({
        status: "done",
        thumbnail_path: `import/${exportId}/thumbnail.jpg`,
        exported_at: new Date().toISOString(),
      })
      .eq("id", exportId);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("render_jobs")
      .update({ status: "error", error_msg: msg, completed_at: new Date().toISOString() })
      .eq("id", jobId);
    if (exportId) {
      await supabase.from("projects")
        .update({ status: "error" })
        .eq("id", exportId);
    }
  } finally {
    activeProcesses.delete(jobId);
    // 중간 파일 정리 (final.{mp4|mov} 는 유지 — 현재 세션 다운로드용)
    await cleanupIntermediateFiles(jobId);
  }
}
```

**Layer C — `queued + running` 모두 정리**:
```typescript
// lib/render/bootCleanup.ts
let bootCleanupDone = false;

export async function ensureBootCleanup() {
  if (bootCleanupDone) return;
  bootCleanupDone = true;

  const { data: zombies } = await supabaseServer
    .from("render_jobs")
    .select("id, project_id")
    .in("status", ["queued", "running"]);

  if (!zombies || zombies.length === 0) return;

  const now = new Date().toISOString();
  await supabaseServer.from("render_jobs")
    .update({ status: "error", error_msg: "server restarted before completion", completed_at: now })
    .in("status", ["queued", "running"]);

  // projects 도 동시 보정
  const projectIds = zombies.map(z => z.project_id);
  await supabaseServer.from("projects")
    .update({ status: "error" })
    .in("id", projectIds)
    .eq("status", "rendering");

  console.log(`[startup] cleaned up ${zombies.length} zombie jobs`);
}
```

**Layer E — Process Registry**:
```typescript
// lib/render/processRegistry.ts
import type { ChildProcess } from "node:child_process";
export const activeProcesses = new Map<string, ChildProcess>();
```

**Layer F — Graceful shutdown**:
```typescript
// lib/render/gracefulShutdown.ts (서버 부팅 시 1회 등록)
import { activeProcesses } from "./processRegistry";

let registered = false;
export function registerShutdownHandler() {
  if (registered) return;
  registered = true;

  const handler = async () => {
    console.log("[shutdown] killing active FFmpeg processes...");
    for (const [jobId, proc] of activeProcesses) {
      try { proc.kill("SIGTERM"); } catch {}
      await supabaseServer.from("render_jobs")
        .update({ status: "error", error_msg: "server shutdown", completed_at: new Date().toISOString() })
        .eq("id", jobId);
    }
    process.exit(0);
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
```

> **주의**: Next.js dev 서버는 HMR로 인해 child process registry가 reset될 수 있음.
> 이 경우 좀비 잡 감지(§9.2)가 보조 안전망 역할.

---

## 12. FFmpeg 파이프라인 상세

### 12.1 Phase 1 — 오디오 concat + Loudness Normalize (v3.5 신규)

**Step 1-1: concat (silence 모드)**
```bash
ffmpeg -f concat -safe 0 -i list.txt \
  -c:a pcm_s16le \
  workspace/tmp/{jobId}/concat_raw.wav
```

**Step 1-1: concat (crossfade 모드, crossfadeSec=2 기준)**
```bash
ffmpeg -i t1.mp3 -i t2.mp3 -i t3.mp3 \
  -filter_complex "
    [0:a][1:a]acrossfade=d=2:c1=tri:c2=tri[a01];
    [a01][2:a]acrossfade=d=2:c1=tri:c2=tri[aout]
  " \
  -map "[aout]" -c:a pcm_s16le \
  workspace/tmp/{jobId}/concat_raw.wav
```

**Step 1-2: EBU R128 loudness normalize (v3.5 신규)**

2-pass 방식: 1차로 통계 측정 → 2차에서 정규화 적용. 결과 품질 우수.

```bash
# 1차: 측정
ffmpeg -i concat_raw.wav \
  -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json \
  -f null - 2> loudnorm_stats.txt

# 2차: 정규화 + AAC 인코딩
ffmpeg -i concat_raw.wav \
  -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=...:measured_TP=...:measured_LRA=...:measured_thresh=...:offset=...:linear=true" \
  -c:a aac -b:a 192k \
  workspace/tmp/{jobId}/concat.m4a
```

> `targetLufs=-14` (YouTube 표준), `truePeakDb=-1`. AudioConfig에서 조정 가능.
> normalize=`off`인 경우 1차/2차 건너뛰고 바로 concat.m4a 생성.

### 12.2 Phase 2 — 영상 합성 + 오버레이

`filter_complex_script` 파일 방식 사용 (트랙 수 무관).

**Step 2-1: 배경 처리 (BackgroundConfig 반영)**

```bash
# fit=cover (기본) + dim=0.25
-vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,eq=brightness=-0.25"
```

```bash
# fit=blurred_contain (어두운 가장자리 + 블러)
-filter_complex "
  [0:v]split[bg1][bg2];
  [bg1]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=20:1[blurred];
  [bg2]scale=1920:1080:force_original_aspect_ratio=decrease[fg];
  [blurred][fg]overlay=(W-w)/2:(H-h)/2[bg]
"
```

**Step 2-2: 오버레이 합성 (renderer 분기)**

```bash
# 출력 포맷 분기
# mp4: -movflags +faststart (YouTube 스트리밍 최적화)
# mov: 기본

ffmpeg -hwaccel videotoolbox \
  -loop 1 -i bg.jpg -i concat.m4a \
  -filter_complex_script filters.txt \
  -c:v h264_videotoolbox -q:v 60 \
  -pix_fmt yuv420p \
  -c:a copy -shortest \
  -progress pipe:1 -nostats \
  -movflags +faststart \
  workspace/tmp/{jobId}/final.mp4
```

비디오 배경: `-stream_loop -1 -i bg.mp4` 로 자동 루프.

### 12.3 타임코드 계산 (lib/timecode.ts) — v3.5 갱신

```typescript
import type { TransitionConfig } from "./schema";

export function computeTrackTimings(
  tracks: Track[],
  transition: TransitionConfig
): Array<{ trackId: string; startSec: number; endSec: number }> {
  const result: Array<{ trackId: string; startSec: number; endSec: number }> = [];
  let cursor = 0;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const startSec = cursor;
    const endSec = cursor + t.durationSec;
    result.push({ trackId: t.id, startSec, endSec });
    if (transition.type === "crossfade" && i < tracks.length - 1) {
      cursor += t.durationSec - transition.crossfadeSec;  // 다음 곡과 N초 겹침
    } else {
      cursor += t.durationSec;
    }
  }
  return result;
}
```

> **단위테스트 의무**: 트랙 3개/10개/30개 × silence/crossfade(1/2/4초) 케이스.

### 12.4 오버레이 타이밍 (lib/ffmpeg/overlayCompiler.ts)

```typescript
export function resolveOverlayTimings(
  trackStartSec: number,
  trackDurationSec: number,
  mode: "0" | "2" | "5" | "full"
): { skip: true } | { skip: false; tStart: number; tEnd: number; fadeOut: boolean } {
  if (mode === "0") return { skip: true };

  if (mode === "full") {
    const tStart = trackStartSec + 1;
    const tEnd = trackStartSec + trackDurationSec - 5;
    if (tEnd <= tStart + 1) {
      // 트랙이 7초 미만 → 5초 모드로 fallback
      return { skip: false, tStart, tEnd: tStart + 5, fadeOut: true };
    }
    return { skip: false, tStart, tEnd, fadeOut: true };
  }

  // mode === "2" || "5"
  const tStart = trackStartSec + 1;
  const tEnd = tStart + Number(mode);
  return { skip: false, tStart, tEnd, fadeOut: true };
}
```

### 12.5 진행률 파싱

```typescript
// lib/ffmpeg/parseProgress.ts
export function parseFFmpegProgress(
  chunk: string,
  totalDurationSec: number
): { progress: number; etaSec: number | null } | null {
  const kv: Record<string, string> = {};
  for (const line of chunk.split("\n")) {
    const [k, v] = line.split("=");
    if (k && v) kv[k.trim()] = v.trim();
  }
  const outTimeMicros = Number(kv["out_time_ms"]);  // 실제 μs
  if (!Number.isFinite(outTimeMicros) || outTimeMicros <= 0) return null;

  const processedSec = outTimeMicros / 1_000_000;
  const progress = Math.min(processedSec / totalDurationSec, 1);
  return { progress, etaSec: null };  // ETA는 wall-clock 기반 별도 계산
}

const PHASE_WEIGHT = { concatAudio: 0.15, renderVideo: 0.85 };

export function computeGlobalProgress(
  phase: "concatAudio" | "renderVideo",
  phaseProgress: number
): number {
  if (phase === "concatAudio") return phaseProgress * PHASE_WEIGHT.concatAudio;
  return PHASE_WEIGHT.concatAudio + phaseProgress * PHASE_WEIGHT.renderVideo;
}
```

ETA는 wall-clock 기반:
```typescript
// 렌더 시작 후 10초 이상 경과 + progress > 0.05일 때만 표시
const elapsedSec = (Date.now() - startTimeMs) / 1000;
const showEta = elapsedSec > 10 && progress > 0.05;
const etaSec = showEta ? Math.round(elapsedSec / progress - elapsedSec) : null;
```

---

## 13. Design Layer (v3.5 신설)

오버레이 디자인은 **렌더 엔진과 분리된 독립 모듈**로 운영. preset 데이터 변경이 FFmpeg 코드 변경으로 번지지 않도록 구조 격리.

### 13.1 설계 원칙

| 원칙 | 의미 |
|---|---|
| Editor는 preset을 선택만 한다 | OverlayConfig에 `presetId + presetVersion`만 저장 |
| Renderer는 preset의 정확한 스펙을 로드한다 | `resolveOverlayPreset(id, version)` 함수 |
| Export snapshot에 preset version을 박는다 | 미래에 preset이 수정되어도 과거 프로젝트 재현 가능 |
| renderer는 drawtext / png_card 두 갈래 | v1은 drawtext 구현, png_card는 v1.5 |

### 13.2 폴더 구조

```
src/
├── lib/
│   ├── design/
│   │   ├── presetRegistry.ts          # 모든 preset 등록 + 버전 관리
│   │   ├── resolveOverlayPreset.ts    # id + version → OverlayPreset
│   │   └── validatePreset.ts          # zod 검증
│   └── ffmpeg/
│       ├── overlayCompiler.ts         # preset → drawtext/png_card 분기
│       ├── overlayDrawtextRenderer.ts # v1 구현
│       └── overlayPngRenderer.ts      # v1.5 구현 (스켈레톤만)
│
├── design-presets/
│   └── overlay/
│       └── default.v1.json            # v1 유일한 preset
│           # v1.5+에서 minimal-left.v1.json, center-glass.v1.json 등 추가
│
└── design-lab/                        # 디자인 작업 공간 (v1.5+, gitignore 또는 별도 repo)
    └── overlay-presets/
        └── default/
            ├── reference.png          # Claude Code Design 산출물
            ├── preset.json            # 작업 중인 preset
            └── notes.md               # 디자인 의도/제약사항
```

### 13.3 v1 default preset (하드코딩)

```typescript
// lib/design/presetRegistry.ts
import type { OverlayPreset } from "../schema";

const DEFAULT_V1: OverlayPreset = {
  id: "default",
  version: 1,
  renderer: "drawtext",
  layout: {
    anchor: "bottom-left",
    x: 80, y: -160,
    safeMarginX: 96, safeMarginY: 72,
  },
  typography: {
    artistFontFamily: "AppleSDGothicNeo",
    titleFontFamily: "AppleSDGothicNeo",
    artistFontSize: 32, titleFontSize: 42,
    artistWeight: 500, titleWeight: 700,
    letterSpacing: 0, lineHeight: 1.15,
    maxLinesTitle: 2, textAlign: "left",
  },
  color: { artist: "#FFFFFF", title: "#FFFFFF" },
  card: { enabled: false, paddingX: 32, paddingY: 24, radius: 24, blur: 0, opacity: 1 },
  animation: { fadeInSec: 0.3, fadeOutSec: 0.5 },
};

const REGISTRY: Record<string, Record<number, OverlayPreset>> = {
  default: { 1: DEFAULT_V1 },
};

export function resolveOverlayPreset(id: string, version: number): OverlayPreset {
  const preset = REGISTRY[id]?.[version];
  if (!preset) {
    throw new Error(`Overlay preset not found: ${id} v${version}`);
  }
  return preset;
}
```

### 13.4 renderer 분기

```typescript
// lib/ffmpeg/overlayCompiler.ts
export function compileOverlay(
  preset: OverlayPreset,
  track: Track,
  timing: { tStart: number; tEnd: number }
): string {
  if (preset.renderer === "drawtext") {
    return compileDrawtextFilter(preset, track, timing);  // v1
  }
  if (preset.renderer === "png_card") {
    throw new Error("png_card renderer not implemented in v1");  // v1.5
  }
  throw new Error(`unknown renderer: ${preset.renderer}`);
}
```

### 13.5 v1.5+ 확장 시 작업 흐름

```
1. design-lab/overlay-presets/{name}/ 폴더에서 디자인 작업
   - reference.png (Claude Code Design 산출물)
   - notes.md (의도, 제약사항)
   - preset.json (실제 스펙)

2. design-presets/overlay/{name}.v{N}.json 으로 복사 + 등록

3. lib/design/presetRegistry.ts에 import + REGISTRY 추가

4. 필요 시 overlayPngRenderer.ts 구현

5. Editor UI에 preset 선택 드롭다운 노출
```

> 핵심: preset 수정 = **version 증가**. v1을 사용한 과거 프로젝트는 v1 데이터로 영구 재현 가능.

---

## 14. 폴링 / 동시성 정책

| 항목 | 정책 |
|---|---|
| 클라이언트 폴링 간격 | 5초 |
| DB 진행률 UPDATE 주기 | 5초 (fire-and-forget) |
| In-memory 진행률 갱신 | 매 FFmpeg progress chunk마다 |
| 동시 렌더 잡 수 | 1개 (DB 체크 + jobQueue 이중) |
| 새 Export 시도 (렌더 중) | HTTP 409 응답 |
| localStorage 키 | 단일 키 `gytpv1:active-render` |
| localStorage 저장 시점 | `/api/render` 응답 수신 후 (jobId 확정 후) |

---

## 15. 에러 처리 / 엣지 케이스

| 케이스 | 처리 |
|---|---|
| FFmpeg 미설치 | 부팅 시 `which ffmpeg` 체크, UI에 에러 표시 |
| 음원 메타데이터 추출 실패 | 파일명을 아티스트/곡명에 fallback, 사용자 인라인 편집 가능 |
| 트랙 길이 < 7초 + Full 모드 | 자동으로 5초 모드로 fallback + 경고 |
| Supabase 업로드 실패 | render_jobs.status='error', error_msg 기록, 사용자 안내 |
| 페이지 새로고침 중 진행 중인 렌더 | localStorage + DB로 복원 |
| 서버 재시작 | 좀비 잡 감지 → status='error'로 보정 |
| 한국어 폰트 경로 차이 | `FONT_PATH_KR` 환경변수 (Mac Studio/MacBook Pro 양쪽 가능) |
| 동시 렌더 시도 | 409 응답, UI에 안내 |
| Next.js 업로드 크기 제한 | `next.config.ts`에서 `serverActions.bodySizeLimit` 또는 raw multipart |
| 삭제 도중 일부 실패 | 각 STEP 검증으로 차단. UI 변경 없음. |

---

## 16. 알려진 제약사항

| 제약 | 영향 |
|---|---|
| 출력 파일(mp4/mov) 로컬에만 저장 | 서버 재시작/시간 경과 시 다운로드 불가, 재익스포트 필요 |
| 동시 1개 렌더만 가능 | 키비 단일 사용자 환경에 충분 |
| 재익스포트 시 import 복사 비용 | Storage 사용량 증가, 음원 수×용량만큼 시간 |
| 3시간 영상 + 비디오 배경 | 18~30분 렌더 (M1 Mac Studio) |
| FFmpeg VideoToolbox 의존 | 인텔 Mac에서는 `HWACCEL_DISABLED=1`로 libx264 fallback |
| 트랙 길이 ≥ 7초만 Full 모드 가능 | 짧은 트랙은 자동 fallback |
| Loudness 2-pass 처리 | 1-pass 대비 시간 약 2배. 정밀도 우선. |
| Next.js HMR이 child process registry 리셋 | Layer 2 좀비 감지가 보조 안전망 |

---

## 17. 결정사항 락인 요약

§0의 표가 마스터 레퍼런스. 본 섹션은 핵심 결정 7개에 대한 추가 설명만.

### 17.1 History 진입 시 다운로드 버튼 — **없음 (A안)**

mov/mp4는 로컬 workspace에만 휘발성으로 존재. History 진입 시점에 보장 못함. 대신 마지막 Export 시점의 모든 설정/음원/텍스트가 정확히 복원되어 즉시 재익스포트 가능 (§3.2 참조).

### 17.2 재익스포트 시 import 파일 처리 — **복사 방식**

snapshot 안의 storagePath들이 가리키는 모든 파일을 새 exportId 폴더로 복사. 각 프로젝트가 독립적 자산 보유 → 이전 프로젝트 삭제해도 새 프로젝트 무영향. 음원 N곡 × 평균 5MB ≈ 150MB. Supabase Storage 내부 복사이므로 통상 수~수십 초.

### 17.3 좀비 잡 정리 — **이중 방어**

| 시점 | 방어 |
|---|---|
| **부팅 시 (Layer 1)** | `queued + running` 전체를 `error`로 일괄 보정 (싱글톤 가드, 모든 API 진입점에서 `await ensureBootCleanup()`) |
| **폴링 시 (Layer 2)** | `/api/render-status/[id]` 진입 시점에 in-memory 부재 + DB='running' 패턴 감지 → 즉시 보정 |

### 17.4 Render Execution Policy — **6중 방어** (§11)

Layer A 분리 / B DB원천 / C 부팅정리 / D 동시성 / E ProcessRegistry / F Graceful Shutdown.

### 17.5 출력 포맷 — **mp4 기본**

YouTube 업로드 일반성. mov 옵션은 라디오에서 선택 가능. AudioConfig는 둘 다 AAC 192kbps.

### 17.6 Loudness Normalize — **v1부터 ON**

EBU R128 2-pass. `targetLufs=-14` (YouTube 표준), `truePeakDb=-1`. AudioConfig에서 off 전환 가능.

### 17.7 Design Layer 분리 — **v1부터 구조 확보**

OverlayPreset 스키마 풀버전 + presetVersion 의무. v1 구현은 `drawtext` renderer + `default v1` preset 1종만. v1.5+ 작업이 스키마 변경 없이 가능.

---

## 18. 환경 변수 (.env.local)

```env
NEXT_PUBLIC_APP_NAME=g-ytp-v1
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/bin/ffprobe
WORKSPACE_DIR=./workspace
FONT_PATH_KR=/System/Library/Fonts/AppleSDGothicNeo.ttc
HWACCEL_DISABLED=0    # 1로 설정 시 libx264 fallback

NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx          # 서버 전용, 클라이언트 노출 금지
SUPABASE_STORAGE_BUCKET=g-ytp-v1
```

> `.env.local` gitignore. Mac Studio ↔ MacBook Pro 수동 복사.

---

## 19. Sprint 작업 순서 (v3.5)

### Sprint 1 — Foundation (4~5일)
1. `npx create-next-app@latest g-ytp-v1 --typescript --tailwind --app`
2. tsconfig strict + ESLint `no-explicit-any: error`
3. `lib/schema.ts` 전체 (§4) — OverlayPreset 풀스키마 포함
4. Supabase 프로젝트 생성, 마이그레이션 **0001 + 0002 + 0003** 실행
5. Storage bucket `g-ytp-v1` 생성
6. `lib/supabase/client.ts` + `server.ts` + `storage.ts`
7. `lib/ffmpeg/probe.ts` + `lib/timecode.ts` (단위테스트 포함, transition 1/2/4초 케이스)
8. **Render Execution Policy 코어 (§11)** — `lib/render/{processRegistry,bootCleanup,gracefulShutdown}.ts`
9. `lib/design/{presetRegistry,resolveOverlayPreset}.ts` + `default v1` preset 등록
10. `workspace/` + `.gitignore`
7. `lib/ffmpeg/probe.ts` + `lib/timecode.ts` (단위테스트 포함)
8. **`ensureBootCleanup()` 싱글톤 구현 (§15.3) — 모든 API Route 진입점에 가드 호출**
9. `workspace/` + `.gitignore`

### Sprint 2 — Ingest (2~3일)
11. `/api/upload` — editorSessionId 수신, music-metadata, Storage 업로드
12. `/api/upload-bg` — mime 판별, Storage 업로드
13. `components/editor/TitleInput.tsx`
14. `components/editor/TrackList.tsx` + `TrackItem.tsx` — dnd-kit reorder
15. `components/editor/AudioPlayer.tsx` — WaveSurfer

### Sprint 3 — Background (1~2일)
16. `components/editor/BackgroundPicker.tsx` + 미리보기 Canvas
17. BackgroundConfig 기본값 처리 (cover + dim 0.25)

### Sprint 4a — FFmpeg 유틸 모듈 (3~4일)

목표: 순수 FFmpeg 유틸 함수 완성 + 단위테스트. 외부 의존(DB/API) 없이 입출력만 다룸.

18. `lib/timecode.ts` 정밀화 — `computeTrackTimings` 단위테스트 (3/10/30곡 × silence/crossfade 1/2/4초)
19. `lib/ffmpeg/concatAudio.ts` — silence / crossfade (crossfadeSec 파라미터화)
20. **`lib/ffmpeg/normalizeAudio.ts` — EBU R128 2-pass (v3.5 신규)**
21. `lib/ffmpeg/overlayCompiler.ts` + `overlayDrawtextRenderer.ts` (4-mode, preset 기반, 단위테스트)
22. `lib/ffmpeg/overlayPngRenderer.ts` — **스켈레톤만** (v1.5에서 구현, throw "not implemented")
23. `lib/ffmpeg/parseProgress.ts` — μs 단위 파싱 + phase 가중치 (concat 10% + normalize 5% + video 85%)
24. `lib/ffmpeg/renderVideo.ts` — 파이프라인 오케스트레이션 (mp4/mov 분기, h264_videotoolbox)
25. `lib/ffmpeg/thumbnail.ts` — 640×360 첫 프레임 추출

> **Sprint 4a 완료 조건**: 단위테스트 전부 통과 + 샘플 음원 3곡으로 dry-run (DB 없이 로컬 파일만으로) 성공.

### Sprint 4b — Render 코어 + API (3~4일)

목표: §11 Render Execution Policy 코어 + API Route 얇은 진입점.

26. **`lib/render/startRenderJob.ts`** — 중복 방지 + activeProcesses 등록 + runRenderPipeline 호출
27. **`lib/render/runRenderPipeline.ts`** — try/catch/finally + DB 상태 갱신 (§11.4 그대로)
28. `lib/render/cleanupIntermediateFiles.ts` — finally 절 cleanup 헬퍼
29. `/api/render` — **얇은 진입점**: ensureBootCleanup + 검증 + DB 동시성 체크 + projects+render_jobs INSERT + `void startRenderJob()` + 응답
30. `/api/render-status/[id]` — in-mem + DB fallback + Layer 2 좀비 감지 (§9.2)
31. `/api/download/[jobId]` — 로컬 mp4/mov 스트리밍
32. 통합 dry-run: Editor 없이 직접 API 호출로 1곡 짜리 영상 생성 → 다운로드 확인

> **Sprint 4b 완료 조건**: curl 또는 Postman으로 API → FFmpeg → DB 상태 갱신 → 다운로드 전체 흐름 검증. 서버 강제종료 시 좀비 잡 자동 보정 확인.

### Sprint 5 — UI 통합 (2~3일)
33. `/api/description` — 타임코드 텍스트 생성
34. `components/editor/RenderPanel.tsx` — 폴링, 진행률, 다운로드 버튼, 출력 포맷 라디오
35. `components/editor/TracklistExport.tsx` — 복사 버튼
36. localStorage A안 적용 — jobId 수신 후에만 저장

### Sprint 6 — History + Cascade + 복원 (4~5일)
37. `GET /api/project` — `status='done'` 만 반환
38. `GET /api/project/[id]` — 단건 (ProjectSnapshotSchema 검증 포함)
39. `DELETE /api/project/[id]` — cascade (§10, **STEP 0 포함**)
40. `components/history/HistoryGrid.tsx` + `HistoryCard.tsx`
41. **Editor hydrate (`/editor?from={exportId}`) — §3.2 복원 보장 표 8개 항목 전부 검증**
42. 재익스포트 시 import 파일 복사 로직 (Supabase Storage `copy` API)

### Sprint 7 — Polish + 통합 테스트 (3~4일)
43. 에러 핸들링 통합, FFmpeg 미설치 안내
44. **페이지 이탈/복귀 시나리오 통합 테스트 (§9.1 매트릭스 6케이스 전부)**
45. **History 복원 정확성 통합 테스트 — 복원 보장 표 8개 항목 전부 케이스별 검증**
46. **Render Execution Policy 6중 방어 통합 테스트** (서버 강제종료, 동시 요청, 좀비 잡 등)
47. README 실행 가이드 + 알려진 한계 명시

**총 예상: 22~29 작업일** (Sprint 4 분할로 디버깅 시간 단축 기대)

---

## 20. 본 매뉴얼 우선순위

충돌 발생 시:
1. 키비의 명시적 지시 (대화 중)
2. **본 PROJECT_SPEC.md (v3.5, 최신)**
3. CLAUDE.md / AGENTS.md (프로젝트 표준값)
4. 일반 모범 사례

---

## 부록 A — 트랙 카드 용어 정리

| 용어 | 의미 |
|---|---|
| **TrackItem** | Editor UI의 DnD 리스트 행 (영상과 무관) |
| **Overlay Card** | 영상 위에 합성되는 텍스트 (drawtext 결과물). v1.5+에서 png_card도 가능 |

코드 파일명: `TrackItem.tsx`, `overlayCompiler.ts`로 분리되어 일관성 확보됨.

---

## 부록 B — v3.5 변경 요약 (v3.1 대비)

| 영역 | 변경 |
|---|---|
| API | `/api/export` 제거, `/api/render`가 후처리까지 책임 |
| DB | `projects.status` 추가, `latest_job_id` 추가, `exported_at` nullable화. 마이그레이션 0003 신설 |
| 렌더 실행 | §11 Render Execution Policy 신설 (6중 방어) |
| Design Layer | §13 신설 — OverlayPreset 풀스키마 + presetVersion + renderer 분기 |
| 스키마 확장 | Background fit/dim/blur, Audio normalize, Transition crossfadeSec 숫자화, Thumbnail config, outputFormat mp4|mov |
| 동시성 | DB 기반 사전 차단 + activeProcesses registry + graceful shutdown |
| Cascade | STEP 0 (running 잡 차단) + STEP 4 (latest_job_id 해제) 추가 |
| 좀비 정리 | `queued + running` 모두 정리 (기존: running만) |
| localStorage | jobId 수신 후에만 저장 (A안) |
| Sprint | 18~26일 → **22~29일** (Render Policy + Design Layer + Normalize) |
