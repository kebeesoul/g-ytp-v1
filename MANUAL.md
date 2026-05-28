# g-ytp-v1 Manual

`g-ytp-v1`은 음원 파일과 배경 이미지/영상을 받아 YouTube용 장편 플레이리스트 영상을 생성하는 로컬/서버형 제작 도구다. Next.js UI에서 프로젝트를 구성하고, Supabase Storage와 PostgreSQL에 프로젝트 상태를 저장한 뒤, FFmpeg와 Python mastering worker로 최종 영상을 렌더한다.

## 1. 핵심 목적

- 여러 오디오 트랙을 업로드하고 순서를 편집한다.
- 배경 이미지 또는 영상을 미리보기 창에 직접 넣는다.
- 트랙별 오버레이 프리셋을 선택하고 영상에 타임코드/곡 정보를 표시한다.
- 필요 시 `Target Loudness`를 켜서 각 트랙을 먼저 마스터링한다.
- 최종 플레이리스트 영상을 로컬 workspace에 렌더하고 History에서 재편집/재렌더한다.

## 2. 주요 화면

### Editor

작업의 중심 화면이다.

- `Session Title`: 프로젝트/영상 제목.
- `Source Tracks`: 오디오 업로드, 정렬, 재생, 편집, 삭제.
- `Tracklist`: 왼쪽 rail의 Audio Files 아래에 표시되며, 영상 제목과 타임코드 목록을 보여준다.
- `Monitor`: 선택한 오디오 트랙을 waveform으로 확인하고 모니터 볼륨을 조절한다.
- `Visual Source`: `NO PREVIEW` 미리보기 창 자체가 배경 이미지/영상 업로드 영역이다.
- `Overlay Design`: 렌더 시 표시할 오버레이 프리셋 선택.
- `Render Settings`: transition, overlay window, hashtags 설정.
- `Target Loudness`: 켜면 렌더 전 각 트랙을 고정 mastering chain으로 처리한다.
- `Rendering`: 렌더 job 생성 버튼.

### History

완료된 프로젝트를 조회하고 재편집한다. 저장된 snapshot을 기반으로 Editor 상태를 복원한다.

### Settings

오버레이 프리셋을 슬롯 단위로 편집한다. 현재 기본 renderer는 `png_card` 중심이다.

## 3. 데이터 모델

기준 파일: `src/lib/schema.ts`

### Track

```ts
{
  id: string;
  filename: string;
  storagePath: string;
  artist: string;
  title: string;
  durationSec: number;
  order: number;
}
```

업로드 시 `music-metadata`로 artist/title/duration을 읽는다. 메타데이터가 없으면 파일명에서 `Artist - Title`, `Artist – Title`, `Artist — Title` 패턴을 파싱한다.

### Background

```ts
{
  kind: "image" | "video";
  storagePath: string;
  durationSec?: number;
  fit: "cover" | "contain" | "blurred_contain";
  dim: number;
  blur: number;
  cropX: number;
  cropY: number;
  cropW: number;
}
```

현재 기본값은 원본 밝기를 유지하기 위해 `dim: 0`, `blur: 0`이다.

### RenderConfig

```ts
{
  transition: { type: "silence" | "crossfade"; crossfadeSec: number };
  overlay: { displayMode: "0" | "2" | "5" | "full"; presetId: string; presetVersion: number };
  audio: { normalize: "off" | "ebu_r128" | "ebu_r128_fast"; targetLufs: number; truePeakDb: number };
  thumbnail: { mode: "extract" | "designed"; presetId: string; presetVersion: number };
  mastering: boolean;
  audioBitrateKbps: 384;
  resolution: [1920, 1080];
  hwaccel: "videotoolbox" | "none";
}
```

### ProjectSnapshot

렌더와 History 복원의 source of truth다.

```ts
{
  title: string;
  tracks: Track[];
  background: Background | null;
  renderConfig: RenderConfig;
  hashtags: string[];
}
```

## 4. Storage 구조

기준 파일: `src/lib/supabase/storage.ts`

기본 bucket은 `SUPABASE_STORAGE_BUCKET` 또는 `g-ytp-v1`이다.

```text
import/{exportId}/track_001_{trackId}.{ext}
import/{exportId}/bg.{ext}
import/{exportId}/thumbnail.jpg
export/{exportId}/tracklist.txt
mastered/{exportId}/001_{trackId}.m4a
mastered/{exportId}/001_{trackId}.json
```

주의:

- 최종 렌더용 mastered WAV는 로컬 workspace에서 사용한다.
- Supabase에는 size-limit 회피를 위해 mastered proxy `.m4a`와 JSON report를 올린다.
- proxy upload가 object size 제한을 넘으면 해당 artifact upload만 건너뛰고 렌더는 계속 진행한다.

## 5. API 개요

### `POST /api/upload`

오디오 파일을 업로드한다.

- 입력: `editorSessionId`, `files[]` 또는 `file`
- 허용 확장자: `mp3`, `wav`, `m4a`, `aac`, `flac`, `ogg`
- 처리:
  - 파일 정렬
  - metadata 파싱
  - duration 검증
  - Supabase `import/{sessionId}/...` 업로드
  - `Track[]` 반환

### `POST /api/upload-bg`

배경 이미지/영상을 업로드한다.

- 입력: `editorSessionId`, `file`
- 이미지: `jpeg`, `png`, `webp`, `gif`
- 영상: `mp4`, `quicktime`, `matroska`, `webm`
- 영상은 임시 파일로 저장 후 `ffprobe`로 duration을 측정한다.

### `POST /api/render`

렌더 job을 생성한다.

- 입력: `{ snapshot, exportId }`
- 전처리:
  - snapshot schema 검증
  - renderable 조건 검증
  - active render job 동시성 차단
  - `projects`, `render_jobs` row 생성
- 응답: `{ jobId, exportId }`

### `GET /api/render-status/[id]`

메모리 jobQueue 또는 DB에서 렌더 상태를 조회한다.

### `POST /api/render-cancel/[jobId]`

실행 중인 FFmpeg/Python process를 종료하고 job/storage/workspace 정리를 수행한다.

### `GET /api/download/[jobId]`

로컬 workspace의 최종 렌더 파일을 다운로드한다.

## 6. Render Pipeline

기준 파일: `src/lib/render/runRenderPipeline.ts`

렌더 흐름:

```text
render_jobs 조회
  ↓
projects.snapshot 조회
  ↓
overlay preset DB 로드 및 registry 등록
  ↓
job status running
  ↓
import/{exportId}/ prefix로 파일 복사 필요 여부 확인
  ↓
tracks/background 다운로드 + PNG overlay card 준비
  ↓
Target Loudness ON이면 track별 mastering
  ↓
concatAndNormalize로 audio concat / normalize
  ↓
renderVideo로 최종 mp4 생성
  ↓
thumbnail 추출 + tracklist.txt 업로드
  ↓
projects/render_jobs done 업데이트
  ↓
workspace cleanup
```

실패 시:

- cancel된 job이면 error update를 건너뛴다.
- 일반 오류는 `render_jobs.status = "error"`와 `projects.status = "error"`로 기록한다.
- finally에서 active process와 임시 workspace를 정리한다.

## 7. Mastering

기준 파일:

- `src/lib/mastering/constants.ts`
- `src/lib/mastering/renderMastering.ts`
- `workers/master_audio.py`
- `audio_mastering/*`

고정 mastering 설정:

```ts
TARGET_LOUDNESS = -9.0;
OUTPUT_CEILING = -0.1;
LRA_TARGET = 9.0;
STEREO_WIDTH = 1.0;
TONE = "balanced";
GLUE = "light";
LOUDNESS_MODE = "natural";
EXPORT_FORMAT = "wav";
BIT_DEPTH = 24;
SAMPLE_RATE = "keep";
DITHER = "off";
```

동작:

- `Target Loudness` OFF: 기존 오디오 파일을 concat/normalize로 처리한다.
- `Target Loudness` ON:
  - 각 트랙을 Python worker로 mastering한다.
  - final render는 로컬 mastered WAV를 사용한다.
  - Supabase에는 mastered proxy `.m4a`와 report `.json`을 저장한다.

Python 의존성:

```bash
pip install -r requirements-mastering.txt
```

FFmpeg/FFprobe도 시스템에 설치되어 있어야 한다.

## 8. Overlay

오버레이 프리셋은 `OverlayPresetSchema`를 따른다.

주요 설정:

- layout: anchor, x/y, safe margin
- typography: artist/title font family, size, weight, line-height, max lines
- color: artist/title/background/shadow
- card: padding, radius, blur, opacity
- animation: fade in/out

렌더 시 `preparePngCardSpecs()`가 snapshot과 프리셋 정보를 기준으로 PNG overlay card를 준비하고, `renderVideo()`가 FFmpeg filter graph에 반영한다.

## 9. Tracklist

기준 파일: `src/lib/tracklist.ts`

Tracklist는 클라이언트에서 즉시 계산한다.

```text
00:00 Artist - Title
03:12 Artist - Title

#hashtags
```

시간 계산은 `computeTrackTimings()`와 transition 설정을 따른다. Editor에서는 영상 제목도 함께 표시한다.

## 10. 동시성/복구 정책

- active render는 한 번에 하나만 허용한다.
- API 레벨에서 `queued`, `running` job을 차단한다.
- DB partial unique index `idx_render_jobs_single_active`로 한 번 더 강제한다.
- 앱 부팅 시 `ensureBootCleanup()`이 stale queued/running job을 정리한다.
- `activeProcesses` Map으로 FFmpeg/Python child process를 job별로 추적한다.
- localStorage key `gytpv1:active-render`로 페이지 이탈 후 진행 중 job에 재연결한다.

## 11. 로컬 실행

필수:

- Node.js 20+
- pnpm
- FFmpeg / FFprobe
- Supabase project + public Storage bucket
- Python mastering dependencies

설치:

```bash
pnpm install
pip install -r requirements-mastering.txt
```

실행:

```bash
pnpm dev
```

접속:

```text
http://localhost:3000/editor
```

## 12. 환경 변수

`.env.local` 예시:

```env
NEXT_PUBLIC_APP_NAME=g-ytp-v1

FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/bin/ffprobe
PYTHON_BIN=python3

WORKSPACE_DIR=./workspace
FONT_PATH_KR=/System/Library/Fonts/AppleSDGothicNeo.ttc
HWACCEL_DISABLED=0

NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=g-ytp-v1
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=g-ytp-v1
```

보안:

- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다.
- 절대 `NEXT_PUBLIC_` prefix를 붙이지 않는다.
- `.env.local`은 커밋하지 않는다.

## 13. 검증 명령

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm exec next build --webpack
PYTHONPYCACHEPREFIX=/tmp/g-ytp-v1-pycache python3 -m py_compile workers/master_audio.py audio_mastering/audio.py audio_mastering/drive.py audio_mastering/limiter.py audio_mastering/mastering.py audio_mastering/report.py
```

현재 테스트 범위:

- timecode 계산
- overlay/renderer 정책
- history restore
- render policy
- active render concurrency
- snapshot precondition
- mastering storage path

## 14. 주요 제약

- 최종 영상 파일은 로컬 workspace에 저장된다. 서버 재시작/cleanup 후에는 재렌더가 필요할 수 있다.
- Supabase Storage object size 제한 때문에 mastered WAV 원본은 업로드하지 않는다.
- 동시에 한 개 render job만 허용한다.
- mastering worker는 Python/NumPy/SciPy/soundfile/pyloudnorm에 의존한다.
- macOS VideoToolbox 기준으로 설계되어 있으며, 환경에 따라 `HWACCEL_DISABLED=1`이 필요할 수 있다.
- 배경은 렌더 전 반드시 필요하다.
- 트랙은 최소 1개 이상 필요하다.

## 15. 핵심 파일 지도

```text
src/app/editor/page.tsx                 # Editor layout/state assembly
src/components/editor/TrackList.tsx     # Audio files ingest UI
src/components/editor/TrackItem.tsx     # Track row/play/edit/delete
src/components/editor/BackgroundPicker.tsx
src/components/editor/AudioPlayer.tsx
src/components/editor/RenderPanel.tsx
src/components/editor/TracklistExport.tsx

src/app/api/upload/route.ts             # Audio upload
src/app/api/upload-bg/route.ts          # Background upload
src/app/api/render/route.ts             # Render job create
src/app/api/render-status/[id]/route.ts # Render status
src/app/api/render-cancel/[jobId]/route.ts
src/app/api/download/[jobId]/route.ts

src/lib/render/runRenderPipeline.ts     # Main render pipeline
src/lib/ffmpeg/concatAndNormalize.ts    # Audio concat/normalize
src/lib/ffmpeg/renderVideo.ts           # Final video render
src/lib/mastering/renderMastering.ts    # Mastering integration
workers/master_audio.py                 # Python mastering worker
audio_mastering/                        # Ported mastering DSP engine

supabase/migrations/                    # DB schema
workspace/                              # Local render workspace
```

## 16. 운영 원칙

- Snapshot이 렌더의 source of truth다.
- UI 값은 가능한 schema/default/constants와 맞춘다.
- 렌더 안정성은 API guard, DB constraint, process registry, cleanup layer로 중복 방어한다.
- Storage에는 원본 import asset과 lightweight output artifact를 저장하고, 무거운 final render는 로컬 workspace에 둔다.
- mastering은 final mux 직전 오디오 준비 단계에서만 적용한다.
