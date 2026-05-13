# g-ytp-v1

YouTube 플레이리스트 영상 자동화 — 음원 + 배경 이미지/영상을 받아 타임코드 오버레이가 포함된 장편 영상을 FFmpeg로 렌더링합니다.

## 요구 사항

- **Node.js** 20+
- **FFmpeg** / **FFprobe** (Homebrew: `brew install ffmpeg`)
- **Mac Studio M1** 권장 (VideoToolbox 하드웨어 가속 사용)
- **Supabase** 프로젝트 (PostgreSQL + Storage)

## 초기 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 프로젝트 루트에 생성하세요. (`.gitignore` 포함됨 — 절대 커밋하지 말 것)

```env
NEXT_PUBLIC_APP_NAME=g-ytp-v1

FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/bin/ffprobe

WORKSPACE_DIR=./workspace

FONT_PATH_KR=/System/Library/Fonts/AppleSDGothicNeo.ttc
HWACCEL_DISABLED=0

NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=g-ytp-v1
```

### 3. Supabase DB 마이그레이션

`supabase/migrations/` 의 SQL 파일을 순서대로 실행하세요:
1. `0001_create_projects.sql`
2. `0002_create_render_jobs.sql`
3. `0003_add_project_render_link.sql`

### 4. Storage 버킷 생성

Supabase Dashboard → Storage에서 `g-ytp-v1` 버킷을 **Public** 으로 생성하세요.

### 5. 워크스페이스 디렉터리 생성

```bash
mkdir -p workspace
```

## 실행

```bash
npm run dev
```

`http://localhost:3000` 접속 → `/editor` 로 리다이렉트됩니다.  
Editor 첫 로드 시 FFmpeg 미설치 여부를 자동 감지하여 상단에 경고를 표시합니다.

## 사용 흐름

### 신규 프로젝트

1. Editor에서 음원 파일 드래그/업로드
2. 배경 이미지/영상 업로드
3. 아티스트명/곡명 인라인 편집, 트랙 순서 드래그 조정
4. Transition / Overlay 모드 선택, 해시태그 입력
5. **▶ Export** → 진행률 확인 → 완료 후 **⬇ 다운로드**
6. Tracklist 복사 → YouTube 영상 설명란 붙여넣기

### History에서 재익스포트

1. History 탭 → 과거 프로젝트 카드
2. **편집** → Editor 이동, 마지막 Export 상태 완전 복원 (8개 항목)
3. 수정 후 **▶ Export** → 새 카드 추가 (이전 카드 유지)

복원 보장 항목: 제목, 트랙 순서/아티스트/곡명, 음원 파일, 배경, Transition, Overlay 모드, 해시태그.

### 페이지 이탈/복귀

렌더 중 페이지를 이탈해도 FFmpeg는 서버에서 계속 실행됩니다.
복귀 시 `localStorage['gytpv1:active-render']` 키로 진행 중인 잡을 자동 재연결합니다.

## 테스트

```bash
npx vitest run
```

89개 테스트 통과 (타임코드, 오버레이, FFmpeg 진행률, §9.1 6케이스, §3.2 8항목, §11 6중 방어).

## 타입 체크

```bash
npx tsc --noEmit
```

## 알려진 제약사항

| 제약 | 설명 |
|---|---|
| 출력 파일은 로컬에만 저장 | 서버 재시작 시 다운로드 불가, 재익스포트 필요 |
| 동시 렌더 1개 제한 | 동시 시도 시 409 응답 |
| 재익스포트 시 Storage 복사 | 음원 수 × 용량만큼 시간 소요 |
| 3시간 영상 + 비디오 배경 | Mac Studio M1 기준 약 18~30분 |
| FFmpeg VideoToolbox 의존 | 인텔 Mac: `HWACCEL_DISABLED=1` |
| 트랙 길이 ≥ 7초만 Full 오버레이 | 짧은 트랙은 자동 5초 fallback |
| Next.js HMR 재시작 시 | in-memory 잡 소실 → 좀비 감지로 자동 보정 |

## 환경변수 보안

- `SUPABASE_SERVICE_ROLE_KEY` — 서버 전용. 절대 `NEXT_PUBLIC_` 접두사 금지
- `.env.local` — `.gitignore` 포함됨. Mac 간 수동 복사
- Supabase 스키마 변경 — 마이그레이션 파일로만. Dashboard 직접 편집 금지
