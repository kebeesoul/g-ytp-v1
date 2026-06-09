# g-ytp-v1 Full Report

Generated: 2026-06-10 07:52 KST

## Executive Conclusion

`g-ytp-v1`은 음원, 배경 이미지 또는 영상, 오버레이, 웨이브폼을 조합해 YouTube용 장편 플레이리스트 영상을 생성하는 단일 사용자 중심의 로컬 제작 도구다. Next.js가 편집 UI와 API를 함께 제공하고, FFmpeg가 오디오 연결, 마스터링, 오버레이 합성, 하드웨어 인코딩을 담당한다. Supabase는 프로젝트와 렌더 잡 메타데이터를 관리하며, 대용량 오디오와 영상은 로컬 `workspace/`에 보존한다.

현재 코드는 TypeScript 검사, 130개 Vitest, 프로덕션 빌드를 통과한다. 최근 작업으로 정적 배경, 짧은 오버레이 구간, 웨이브폼, 반복 재생의 렌더 비용을 크게 줄이는 fast-copy 구조가 정착됐다. 반면 린트 오류 2건, 원격보다 5커밋 앞선 로컬 브랜치, 미커밋 변경 1건, `overlay_presets` 테이블의 마이그레이션 파일 부재 가능성은 즉시 정리해야 한다.

제품 방향은 명확하다. 편집, 제목·해시태그 AI 추천, 썸네일, 오버레이 디자인, 음원 마스터링, 렌더 및 History 복원을 하나의 제작 워크플로우로 통합하고 있다. 다만 현재 보안 및 저장 구조는 Mac Studio 기반 단일 사용자 운영에 적합하며, 다중 사용자 SaaS로 확장하려면 인증, RLS, 작업 실행기, 공유 스토리지 구조를 별도로 설계해야 한다.

## Repository State

- Root: `/Users/issacbae/Desktop/vc/g-ytp-v1`
- Branch: `main`
- Remote: `https://github.com/kebeesoul/g-ytp-v1.git`
- Remote tracking: `main...origin/main [ahead 5]`
- Latest commit: `0e7bd1b238da6e6c71b2318127607da1ed60b8fd`
- Latest subject: `feat: add overlay quick editor, fix hashtag recommend, fix thumbnail bg`
- Latest commit date: 2026-06-10 00:59:31 KST
- Latest author: Kebee
- Commit count: 141
- Tracked files: 190
- Latest tag: 없음
- CI workflow: 없음

### Working Tree

현재 working tree는 clean 상태가 아니다.

```text
## main...origin/main [ahead 5]
 M src/components/settings/PresetEditor.tsx
```

미커밋 변경은 Settings의 오버레이 미리보기가 `top-left`, `bottom-center` 등의 anchor를 실제 편집기와 동일하게 해석하도록 만드는 수정이다. 현재 보고서는 이 변경이 존재하는 상태를 기준으로 작성했으며, 해당 파일은 수정하지 않았다.

### Release And Maintenance State

- 태그나 GitHub Release 기반 배포 체계는 없다.
- `main`이 원격보다 5커밋 앞서 있어 최신 성능 및 UI 변경이 GitHub 원격에는 아직 반영되지 않았다.
- `.github/workflows/` 기반 CI가 없어 타입, 테스트, 린트, 빌드 통과 여부가 로컬 실행에 의존한다.
- `package.json` 버전은 계속 `0.1.0`이며 기능 성숙도와 릴리스 상태를 표현하지 않는다.

## Design Purpose

### Problem Being Solved

수동으로 수행하던 플레이리스트 영상 제작 과정을 하나의 작업 흐름으로 자동화한다.

1. 여러 음원을 ingest하고 메타데이터와 길이를 분석한다.
2. 트랙 순서, 제목, 아티스트 정보를 편집한다.
3. 배경 이미지 또는 영상을 선택한다.
4. 트랙 오버레이, 웨이브폼, 전환, 반복 횟수를 설정한다.
5. 필요하면 각 트랙을 고정 설정으로 마스터링한다.
6. FFmpeg로 장편 영상을 렌더한다.
7. 썸네일과 YouTube용 tracklist를 생성한다.
8. History에서 프로젝트를 복원하고 재익스포트한다.

근거: `README.md`, `PROJECT_SPEC.md`, `src/app/editor/page.tsx`, `src/lib/render/runRenderPipeline.ts`.

### Intended Users And Use Cases

- 1차 사용자: Kebee의 로컬 Mac Studio 제작 환경.
- 핵심 사용 사례: 1시간 이상 플레이리스트 영상의 반복 제작.
- 보조 사용 사례: AI 기반 제목·해시태그 생성, 썸네일 제작, 오버레이 프리셋 관리, 과거 프로젝트 재편집.
- 현재 구조상 팀 협업이나 외부 고객용 SaaS보다 단일 제작자의 반복 작업 자동화에 최적화되어 있다.

### Product And Engineering Direction

최근 변경 흐름은 다음 세 축으로 수렴한다.

- 제작 기능 통합: Editor, Thumbnail, Settings, History를 하나의 제작 도구로 연결.
- 표현력 확장: PNG card 오버레이, 웨이브폼, 폰트, anchor, 색상, 제목·해시태그 추천.
- 장편 렌더 최적화: 정적 구간 stream copy, keyframe 정렬, 단일 렌더 후 반복 concat, 마스터링 캐시 및 병렬 준비.

이는 단순 FFmpeg 래퍼가 아니라 채널 고유의 디자인과 제목 문법을 재사용 가능한 제작 자산으로 축적하는 방향이다.

### Verified Versus Inferred Intent

**Verified**

- 로컬 서버는 `pnpm start`로 실행한다: `CLAUDE.md`.
- 대용량 오디오·배경·최종 영상은 로컬 workspace를 사용한다: `src/lib/workspace.ts`, `PROJECT_SPEC.md`.
- Supabase는 `projects`, `render_jobs`, 프리셋 데이터와 tracklist 저장에 사용된다.
- 동시에 하나의 렌더만 허용한다: `0004_enforce_single_active_render_job.sql`, `src/app/api/render/route.ts`.

**Inferred**

- 장기 경쟁력은 렌더 엔진 자체보다 채널별 제목 예시, 디자인 프리셋, 썸네일 포맷, 마스터링 정책을 반복 활용하는 제작 시스템에 있다.
- 다중 사용자 서비스 전환은 현재의 로컬 파일 의존성을 제거하는 별도 제품 단계다.

## Architecture

### System Boundaries

```text
Browser
  ├─ Editor / Settings / Thumbnail / History
  └─ Next.js Route Handlers
       ├─ Supabase PostgreSQL
       │    ├─ projects
       │    ├─ render_jobs
       │    ├─ overlay_presets
       │    └─ thumbnail_presets
       ├─ Supabase Storage
       │    └─ export/{exportId}/tracklist.txt
       ├─ Local workspace
       │    ├─ import/{exportId}/
       │    ├─ export/{exportId}/
       │    ├─ tmp/{jobId}/
       │    ├─ mastered-cache/
       │    └─ thumbnail/
       ├─ FFmpeg / FFprobe
       └─ Gemini API
```

### Components And Responsibilities

| Component | Responsibility |
|---|---|
| `src/app/editor/page.tsx` | 프로젝트 편집 상태, 업로드, 추천, 렌더 시작 및 진행 상태 통합 |
| `src/app/settings/page.tsx` | 오버레이 프리셋 편집 및 저장 |
| `src/app/thumbnail/page.tsx` | 썸네일 이미지와 텍스트 디자인 |
| `src/app/history/page.tsx` | 완료 프로젝트 조회, 복원, 삭제 |
| `src/app/api/*` | 파일 ingest, 프로젝트 CRUD, 렌더 제어, AI 추천 |
| `src/lib/render/*` | 잡 큐, 프로세스 추적, cleanup, 전체 렌더 orchestration |
| `src/lib/ffmpeg/*` | 오디오 concat, 배경 준비, 오버레이·웨이브폼 합성, 인코딩 |
| `src/lib/mastering/*` | Python mastering worker 호출, 캐시, 동시 처리 |
| `audio_mastering/*` | crest-aware drive와 limiter 기반 오디오 엔진 |
| `src/lib/workspace.ts` | 로컬 파일 경로의 단일 진입점 및 traversal 방어 |
| `src/lib/schema.ts` | 프로젝트 snapshot과 렌더 설정의 Zod 계약 |
| `supabase/migrations/*` | DB 변경 이력 |

### Entry Points

- UI: `/editor`, `/settings`, `/thumbnail`, `/history`
- Upload: `POST /api/upload`, `POST /api/upload-bg`
- Render: `POST /api/render`
- Status/cancel/download: `/api/render-status/[id]`, `/api/render-cancel/[jobId]`, `/api/download/[jobId]`
- Project: `/api/project`, `/api/project/[id]`
- Local media stream: `/api/workspace-file/[...path]`
- AI: `/api/title-recommend`, `/api/hashtags-recommend`
- Presets: `/api/overlay-presets`, `/api/thumbnail/presets`

### Data And Control Flow

#### Ingest

1. 브라우저가 파일과 `editorSessionId`를 multipart로 전송한다.
2. Route Handler가 확장자, 길이, metadata를 검증한다.
3. 파일은 `workspace/import/{editorSessionId}/`에 저장된다.
4. snapshot에는 절대 경로가 아닌 `import/{id}/{filename}` 상대 경로가 저장된다.
5. 브라우저 재생은 `/api/workspace-file/...` 스트리밍을 사용한다.

#### Render

1. `/api/render`가 snapshot을 Zod로 검증한다.
2. 모든 로컬 입력 파일의 존재 여부를 렌더 시작 전에 확인한다.
3. `projects`와 `render_jobs`를 생성하거나 갱신한다.
4. `runRenderPipeline()`이 프리셋, 입력 파일, 배경을 resolve한다.
5. 마스터링이 켜져 있으면 트랙을 처리하고 `mastered-cache/`를 활용한다.
6. 오디오 concat과 영상 자산 준비를 병렬 실행한다.
7. 단일 플레이리스트 길이만 영상으로 렌더한다.
8. 반복 횟수가 2~5이면 완성된 1회 영상을 stream copy로 연결한다.
9. 썸네일 추출과 tracklist 업로드를 병렬 실행한다.
10. DB 상태를 `done`으로 갱신하고 임시 파일을 정리한다.

#### Overlay And Waveform Fast Path

- 오버레이가 필요한 짧은 구간만 재인코딩하고 나머지는 stream copy한다.
- 구간 경계는 keyframe grid에 맞추고, 실제 표시 시점은 확장된 segment 내부 offset으로 유지한다.
- 정적 배경과 웨이브폼 자산은 미리 준비해 장편 영상 전체에서 반복 계산을 줄인다.
- 반복 렌더는 동일 영상을 다시 합성하지 않고 concat copy한다.

### External Services And Dependencies

| Dependency | Purpose | Operational requirement |
|---|---|---|
| Supabase PostgreSQL | 프로젝트, 잡, 프리셋 상태 | URL과 service role key 필요 |
| Supabase Storage | tracklist 텍스트 보존 | bucket 필요 |
| Gemini API | 제목·해시태그 추천 | API key 없을 때 fallback 확인 필요 |
| FFmpeg / FFprobe | 미디어 분석과 렌더 | 로컬 바이너리 경로 필요 |
| Python + audio libs | 마스터링 | `requirements-mastering.txt`, libsndfile 필요 |
| macOS VideoToolbox | 하드웨어 H.264 인코딩 | 비지원 환경은 software fallback 필요 |

### Runtime And Deployment

- Next.js 16 프로덕션 서버와 FFmpeg worker가 같은 머신과 파일시스템을 공유한다.
- 기본 workspace는 `./workspace`이며 `WORKSPACE_DIR`로 변경할 수 있다.
- `CLAUDE.md` 기준 실행 순서는 `pnpm run build` 후 `pnpm start`다.
- 서버리스나 다중 인스턴스 배포에는 부적합하다. 인메모리 잡 레지스트리와 로컬 파일이 인스턴스 간 공유되지 않기 때문이다.

## Technical Implementation

### Languages And Frameworks

- TypeScript strict mode
- Next.js 16.2.6 App Router
- React 19.2.4
- Tailwind CSS 4
- Zod 4
- Vitest 4
- Supabase JS 2
- FFmpeg / FFprobe
- Python mastering modules

패키지 매니저 선언은 `pnpm@11.1.2`다. `package-lock.json`과 `pnpm-lock.yaml`이 함께 존재해 의존성 설치 기준이 혼재할 가능성이 있다.

### Storage And Data Model

#### Local workspace

| Path | Lifetime | Contents |
|---|---|---|
| `workspace/import/{exportId}/` | 프로젝트 삭제 전 | 원본 음원, 배경, 추출 썸네일 |
| `workspace/export/{exportId}/` | 프로젝트 삭제 전 | `final.mp4` |
| `workspace/tmp/{jobId}/` | 렌더 중 | concat, 필터, segment, 임시 출력 |
| `workspace/mastered-cache/` | 캐시 정책까지 | mastered WAV |
| `workspace/thumbnail/` | 사용자 작업까지 | 업로드 사진, 선택 이미지 |

`assertInsideWorkspace()`는 `path.relative()`로 workspace 밖의 경로를 거부한다. `/api/workspace-file`도 `import/`, `export/`, thumbnail 하위 경로만 허용한다.

#### Supabase

- `projects`: snapshot, 상태, output 연결, thumbnail, export 시점.
- `render_jobs`: queued/running/done/error 상태, 진행률, ETA, output path.
- `thumbnail_presets`: 6개 슬롯과 텍스트 스타일.
- `overlay_presets`: 코드에서 사용하지만 현재 `supabase/migrations/`에 생성 SQL이 없다.

### API And Integration Contracts

- 주요 request body는 `src/lib/schema.ts`와 각 Route Handler의 Zod 스키마로 검증된다.
- Snapshot은 트랙, 배경, overlay, waveform, mastering, repeat count를 한 계약으로 저장한다.
- 로컬 미디어 URL은 DB의 절대 경로를 노출하지 않고 상대 `storagePath`를 API URL로 변환한다.
- 렌더 동시성은 API 사전 조회와 DB unique partial index로 이중 보호한다.

### Security And Permissions

**현재 강점**

- Supabase service role key는 서버 모듈에서만 사용한다.
- workspace 경로는 중앙 모듈과 traversal 검사로 보호한다.
- 다운로드 job ID, 프로젝트 ID, snapshot 등 외부 입력은 Zod 또는 UUID 검사 대상이다.
- 파일 스트리밍 허용 root를 제한한다.

**현재 한계**

- 주요 migration은 RLS를 비활성화한다. 인증 없는 로컬 단일 사용자 도구에는 단순하지만 SaaS에는 부적합하다.
- 앱 자체 인증과 프로젝트 소유권 개념이 없다.
- `/api/workspace-file`은 허용된 상대 경로를 아는 사용자가 해당 로컬 파일을 읽을 수 있다.
- service role 권한이 모든 API Route에 집중되어 있어 외부 노출 시 blast radius가 크다.

### Performance And Reliability

**확인된 최적화**

- 오디오와 영상 준비 병렬화.
- 마스터링 결과 캐시.
- 정적 배경 전처리.
- overlay window 부분 재인코딩.
- waveform 자산 사전 생성.
- keyframe 정렬을 통한 concat 안정화.
- playlist repeat stream copy.
- 썸네일 추출과 tracklist 업로드 병렬화.

**신뢰성 장치**

- DB unique index 기반 단일 active render.
- child process registry와 cancel 처리.
- boot cleanup 및 orphan tmp 정리.
- 렌더 전 로컬 입력 존재 검증.
- 진행률 DB 주기 flush와 in-memory 우선 조회.

**남은 제약**

- 렌더 worker가 Next.js 서버 프로세스 내부에서 실행된다.
- 프로세스 강제 종료 시 in-memory 상태는 소실된다.
- 로컬 디스크 부족과 장기 캐시 증가에 대한 용량 quota가 없다.
- VideoToolbox 결과와 FFmpeg 버전에 따른 차이를 자동 검증하지 않는다.

### Testing And CI

2026-06-10 현재 검증 결과:

| Check | Result | Detail |
|---|---|---|
| TypeScript | PASS | `./node_modules/.bin/tsc --noEmit` |
| Unit tests | PASS | 13 files, 130 tests |
| Production build | PASS | `./node_modules/.bin/next build`, sandbox 밖에서 재검증 |
| ESLint | FAIL | 2 errors, 1 warning |
| E2E | NOT RUN | Playwright 설정과 자동 E2E suite가 확인되지 않음 |
| Real FFmpeg media render | NOT RUN | 이번 보고서 생성 과정에서는 실제 미디어 샘플 렌더 미실행 |
| CI | ABSENT | GitHub Actions workflow 없음 |

린트 실패:

1. `src/app/settings/page.tsx:44` - effect 내부 동기 `setSelectedIndex`.
2. `src/components/editor/OverlayQuickEditor.tsx:31` - effect 내부 동기 `setDraft`.
3. `src/app/editor/page.tsx:186` - 사용하지 않는 `router` 경고.

빌드는 성공했지만 `src/app/api/download/[jobId]/route.ts`까지 이어지는 whole-project file tracing 관련 NFT 경고가 발생했다. 동적 로컬 파일 경로를 사용하는 서버 번들의 추적 범위가 커질 수 있으므로 배포 산출물 크기를 점검해야 한다.

현재 Vitest 환경은 `node`다. 렌더 정책과 순수 함수 검증에는 적합하지만 실제 브라우저 interaction, drag-and-drop, Canvas, media preview, FFmpeg 바이너리 호환성을 보장하지 않는다.

## Repository Structure

| Path | Responsibility | Notes |
|---|---|---|
| `src/app/` | App Router 페이지와 API | UI와 backend orchestration 동거 |
| `src/app/editor/` | 핵심 제작 화면 | 가장 높은 제품 변경 빈도 |
| `src/app/settings/` | 오버레이 프리셋 편집 | 현재 미커밋 anchor 변경 존재 |
| `src/app/thumbnail/` | 썸네일 제작 | preset DB와 workspace 이미지 사용 |
| `src/app/history/` | 완료 프로젝트 관리 | 로컬 파일 존재 여부가 편집 가능성 결정 |
| `src/components/editor/` | 편집기 UI | 추천, 배경, 트랙, monitor, overlay quick edit |
| `src/components/settings/` | 프리셋 UI | 렌더 프리셋과 preview 계약 중요 |
| `src/components/thumbnail/` | Canvas 썸네일 UI | 폰트와 렌더 결과 일치 필요 |
| `src/lib/schema.ts` | 핵심 snapshot 계약 | 사실상 도메인 모델 |
| `src/lib/render/` | 렌더 job orchestration | 상태 및 cleanup 책임 |
| `src/lib/ffmpeg/` | 미디어 처리 | 성능과 호환성의 핵심 |
| `src/lib/mastering/` | mastering orchestration | Python 엔진과 캐시 연결 |
| `audio_mastering/` | Python mastering engine | NumPy, SciPy, soundfile 사용 |
| `src/lib/workspace.ts` | 로컬 경로 정책 | 모든 파일 접근의 보안 경계 |
| `src/lib/supabase/` | DB 및 Storage client | service role 서버 전용 |
| `src/__tests__/` | Vitest suite | 13개 파일, 130개 테스트 |
| `supabase/migrations/` | DB schema history | 0001~0006 존재 |
| `public/` | 폰트 및 정적 자산 | FFmpeg와 UI 양쪽에서 참조 가능 |
| `PROJECT_SPEC.md` | 설계 기준 | 일부 구현 변화와 동기화 필요 |
| `README.md` | 설치 및 사용 안내 | 현재 구조와 상당한 드리프트 존재 |
| `mastering.md` | 마스터링 이식 기준 | 코드가 충돌 시 source of truth |

## Latest Commit Analysis

### Commit

- Hash: `0e7bd1b238da6e6c71b2318127607da1ed60b8fd`
- Author: Kebee
- Date: 2026-06-10 00:59:31 KST
- Subject: `feat: add overlay quick editor, fix hashtag recommend, fix thumbnail bg`
- Diff: 429 insertions, 20 deletions

### Changed Behavior

- Editor에 오버레이 위치, 폰트, 크기, 굵기, 기울임, 밑줄, 색상을 즉시 조절하는 quick editor 추가.
- Visual Source 미리보기에 오버레이 결과를 실시간 반영.
- 해시태그 Gemini 응답의 JSON 추출과 thinking text 처리 강화.
- Thumbnail에서 선택한 이미지를 Editor 배경으로 전달할 때 합성 결과가 아닌 원본 이미지를 사용하도록 수정.

### Changed Paths

- `src/app/api/hashtags-recommend/route.ts`
- `src/app/editor/page.tsx`
- `src/components/editor/BackgroundPicker.tsx`
- `src/components/editor/OverlayQuickEditor.tsx`
- `src/components/thumbnail/ThumbnailMaker.tsx`

### Regression And Migration Risk

- UI와 최종 FFmpeg 결과가 같은 anchor와 typography 규칙을 사용해야 한다. 현재 `PresetEditor.tsx`에 이를 맞추는 미커밋 수정이 존재한다.
- 새 quick editor는 effect 기반 state 동기화 때문에 현재 lint error를 만든다.
- 해시태그 응답 parser는 실제 Gemini 응답 변형에 대한 fixture test가 필요하다.

## Recent Development Direction

최근 15개 커밋은 다음 흐름으로 묶인다.

1. **렌더 시간 단축**
   - 배경 자산 전처리.
   - 비디오 준비 병렬화.
   - 마스터링 캐시와 병렬 처리.
   - overlay/waveform 부분 인코딩.
   - 반복 영상 stream copy.

2. **출력 안정성**
   - overlay segment를 keyframe에 정렬.
   - 최종 파일 크기 축소.
   - 비디오 배경 첫 프레임 preview.

3. **편집 경험**
   - 전체 길이와 반복 횟수 표시.
   - 트랙리스트와 waveform 배치 조정.
   - clear UI 수정.
   - overlay quick editor와 thumbnail 연결.

개발 우선순위가 기능 추가 중심에서 “장편 렌더 비용을 유지하면서 편집 정밀도를 높이는 단계”로 이동했다.

## GitHub Issues And Pull Requests

GitHub connector로 확인된 Pull Request:

| Priority | Number | Status | Updated | Summary | Architectural relevance |
|---|---:|---|---|---|---|
| Medium | #4 | Merged | 2026-05-17 | png_card renderer와 libx264 fast preset | 현재 오버레이 렌더 및 성능 전략의 기반 |
| Low | #3 | Closed, unmerged | 2026-05-15 | editor runtime fixes 병합 시도 | main에 동등 변경이 있어 충돌 후 종료 |
| Medium | #2 | Merged | 2026-05-15 | client bundle secret leak 방지, env template | 서버·클라이언트 경계와 로컬 실행 안정성 |
| Medium | #1 | Merged | 2026-05-14 | upload 계약, FK 순서, process tracking, cleanup | 렌더 파이프라인의 데이터 무결성과 복구성 |

GitHub Issue 목록은 이번 환경의 connector가 issue listing을 제공하지 않았고 collector의 GitHub API 네트워크 조회도 실패해 확인하지 못했다. Issue가 없다고 판단하지 않는다.

## Current Risks And Debt

### Confirmed Defects

#### P0 - `overlay_presets` migration source 부재

코드는 `overlay_presets`를 조회하고 upsert하지만 `supabase/migrations/`에는 해당 테이블 생성 migration이 없다. 설계 문서 `docs/superpowers/specs/2026-05-17-overlay-preset-settings-design.md`에는 SQL이 있으나 실행 가능한 migration source가 아니다.

영향:

- 새 Supabase 환경을 migration만으로 재구축하면 Settings 저장과 custom overlay 렌더가 실패할 수 있다.
- 운영 DB에 수동 생성된 테이블이 있다면 schema drift가 이미 발생한 상태다.

#### P1 - ESLint 실패

프로덕션 빌드와 테스트가 통과해도 정적 품질 gate는 실패한다. effect state 동기화는 UI 흔들림이나 불필요한 render를 만들 수 있으며, 이전 Session Title 스크롤 문제와 같은 유형의 회귀를 다시 만들 가능성이 있다.

#### P1 - Local/remote divergence

`main`이 `origin/main`보다 5커밋 앞서 있다. 최신 keyframe 보완, editor fix, overlay quick editor가 원격 백업과 협업 기준에 반영되지 않았다.

#### P1 - Uncommitted implementation

`PresetEditor.tsx`의 anchor-aware preview 변경이 커밋되지 않았다. 다른 작업과 섞이거나 유실될 수 있다.

### Design Risks

#### Render worker coupled to web process

Next.js 서버가 FFmpeg 장기 작업을 직접 관리한다. 서버 재시작, HMR, 프로세스 crash가 job lifecycle에 영향을 준다. 단일 사용자 로컬 도구에는 실용적이지만 운영형 서비스에는 별도 worker가 필요하다.

#### Local-only media persistence

History 데이터가 DB에 남아도 local import 파일이 없으면 복원할 수 없다. Mac 교체, workspace 삭제, 디스크 장애 시 미디어 자산이 사라진다.

#### Disabled RLS and no ownership model

현재 Supabase schema는 단일 관리자 도구를 전제로 한다. 외부 네트워크에 노출하거나 사용자 계정을 추가하면 즉시 보안 모델을 재설계해야 한다.

#### Disk growth policy

프로젝트 삭제와 tmp cleanup은 있으나 `mastered-cache`, thumbnail photo, 장기 export에 대한 size/age quota가 없다.

#### Package manager ambiguity

`pnpm-lock.yaml`과 `package-lock.json`이 동시에 존재한다. `CLAUDE.md`는 pnpm을 명시하지만 자동화나 신규 개발자가 npm을 사용할 여지가 있다.

### Missing Verification

- 실제 1시간 미디어의 end-to-end 렌더 시간과 A/V sync.
- overlay 2초/5초/full 경계의 frame-level 검증.
- waveform 4종의 최종 영상 차이.
- VideoToolbox와 software encoder 결과 비교.
- 브라우저 drag-and-drop, Session Title 입력, thumbnail-to-editor flow.
- 디스크 부족, FFmpeg kill, Supabase 일시 장애 후 recovery.

### Documentation Drift

`README.md`는 현재 구현과 다음 부분에서 충돌한다.

- 실행 명령을 `pnpm dev`로 안내하지만 `CLAUDE.md`는 `pnpm start`를 요구한다.
- 오디오와 배경이 Supabase Storage에 있는 구조처럼 설명한다.
- 재익스포트가 Storage copy를 사용한다고 설명한다.
- migration 목록이 0004에서 끝나며 0005, 0006을 누락한다.
- Public Storage bucket을 전체 미디어 저장의 필수 조건처럼 안내한다.

`PROJECT_SPEC.md`도 일부 과거 구현 설명과 최신 png_card, local workspace, overlay 동작을 재대조할 필요가 있다.

## Decision Points

### Overlay Preset Schema Recovery

**A안 - 기존 운영 DB schema를 introspect해 동일 migration 작성**

- 장점: 현재 데이터와 API 계약을 보존하고 재현 가능한 환경을 만든다.
- 리스크: 운영 DB가 문서와 다르면 실제 schema 확인이 필요하다.

**B안 - 설계 문서 SQL을 그대로 migration으로 승격**

- 장점: 빠르고 구현 계획과 일치할 가능성이 높다.
- 리스크: 운영 DB의 실제 column, constraint, default와 불일치할 수 있다.

**추천: A안.** 운영 DB를 source로 읽고 기존 문서와 비교한 후 다음 순번 migration으로 고정해야 한다.

### Render Execution Architecture

**A안 - 현재 Next.js 내부 worker 유지**

- 장점: 단일 Mac 제작 환경에서 단순하고 운영 비용이 낮다.
- 리스크: 서버 lifecycle과 장기 FFmpeg 작업이 결합된다.

**B안 - 별도 persistent worker process 분리**

- 장점: 재시작 복구, 로그, retry, 자원 제한이 명확해진다.
- 리스크: IPC와 배포 관리가 추가된다.

**추천: 현재는 A안 유지.** 다중 사용자 또는 원격 서버 운영이 실제 요구가 되는 시점에 B안으로 전환한다.

### Media Durability

**A안 - local workspace 유지 + 정기 백업**

- 장점: 대용량 파일 전송이 없고 렌더가 빠르다.
- 리스크: 단일 장비 장애에 취약하다.

**B안 - object storage 원본 보존 + local cache**

- 장점: 복원성과 장비 이동성이 높다.
- 리스크: 업로드 비용과 재익스포트 대기 시간이 증가한다.

**추천: A안에 자동 백업만 추가.** 현재 단일 제작 환경의 렌더 성능을 유지하면서 프로젝트 자산만 외장 디스크나 NAS에 증분 백업하는 방식이 적절하다.

## Next Actions

### Immediate

1. `overlay_presets` 운영 schema를 확인하고 migration 파일로 고정한다.
2. ESLint 오류 2건과 경고 1건을 수정한 뒤 typecheck, test, lint, build를 다시 실행한다.
3. `PresetEditor.tsx` 미커밋 변경의 동작을 브라우저와 최종 렌더 기준으로 확인하고 별도 커밋한다.
4. 로컬 5커밋과 검증된 미커밋 변경을 원격 `main`에 반영한다.
5. `README.md`의 실행, Storage, migration, 재익스포트 설명을 현재 구조로 수정한다.

### Next Iteration

1. GitHub Actions에 typecheck, test, lint, build gate를 추가한다.
2. 30~60초 fixture로 overlay 2초/5초/full, waveform, repeat 2회를 검증하는 FFmpeg smoke test를 만든다.
3. Playwright로 Editor upload, title input, background replace, render setting, thumbnail select flow를 자동화한다.
4. workspace 사용량과 `mastered-cache` 정리 정책을 UI 또는 health endpoint에 노출한다.
5. package manager를 pnpm으로 단일화하고 npm lockfile 정책을 결정한다.

### Long-Term Asset

1. 채널별 title examples, 선호 제목, hashtag taxonomy를 버전 관리 가능한 데이터 자산으로 분리한다.
2. overlay/thumbnail preset에 preview snapshot과 schema version을 추가해 디자인 자산의 호환성을 보장한다.
3. 실제 영상별 렌더 시간, cache hit, encoder, 파일 크기, 실패 원인을 기록해 성능 회귀 데이터를 축적한다.
4. 장비 확장 요구가 생기면 web process와 render worker를 분리하되 현재 snapshot 계약과 local fast path는 유지한다.

## Evidence

### Files Inspected

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `PROJECT_SPEC.md`
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `next.config.ts`
- `src/lib/schema.ts`
- `src/lib/workspace.ts`
- `src/lib/render/runRenderPipeline.ts`
- `src/lib/ffmpeg/renderVideo.ts`
- `src/lib/mastering/*`
- `src/lib/supabase/*`
- `src/app/api/render/route.ts`
- `src/app/api/download/[jobId]/route.ts`
- `src/app/api/workspace-file/[...path]/route.ts`
- `src/app/api/overlay-presets/*`
- `supabase/migrations/0001_create_projects.sql`
- `supabase/migrations/0002_create_render_jobs.sql`
- `supabase/migrations/0003_add_project_render_link.sql`
- `supabase/migrations/0004_enforce_single_active_render_job.sql`
- `supabase/migrations/0005_create_thumbnail_presets.sql`
- `supabase/migrations/0006_add_thumbnail_text_case_spacing.sql`
- 최근 commit log와 latest commit diff

### Commands And Tests Run

```text
git status --short --branch
git log -1
git log --oneline --decorate -15
git diff -- src/components/settings/PresetEditor.tsx
find src/app/api -name route.ts
find supabase/migrations
rg overlay_presets / workspace-file / Supabase Storage usage
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/eslint .
./node_modules/.bin/next build
```

### Unavailable Or Unverified Sources

- GitHub Issue 목록: connector 기능 및 네트워크 제한으로 확인 불가.
- 실제 Supabase 운영 DB schema: migration 파일과 코드만 확인했으며 DB introspection 미실행.
- 실제 장편 FFmpeg 렌더: 이번 보고서 작성 중 미실행.
- 외부 장비나 software encoder 성능: 미검증.
