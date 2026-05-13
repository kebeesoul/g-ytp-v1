## 파일 구조
- CLAUDE.md: 프로젝트 전반 규칙 (최우선)
- AGENTS.md: 구현 단계 제약 (CLAUDE.md 종속)
- DESIGN.md: UI 작업 시 참조 (UI 범위에서만 적용, 비UI 작업에서는 무시.)
- PROJECT_SPEC.md: 레포 아키텍처 확정 후 생성. 기술 결정, 데이터 모델, API 설계 등 변경 불가 사항을 기록. 존재하면 AGENTS.md의 SPEC 기준으로 사용.

## 프로젝트 컨텍스트
- Framework: Next.js 14 App Router
- UI: shadcn/ui + Tailwind CSS
- Database: Supabase
- Package manager: pnpm
- Language: TypeScript (strict)

## 금지
- `pages/` 디렉토리 수정 금지 (App Router 마이그레이션 중)
- `any` 타입 사용 금지
- `components/ui/` 직접 수정 금지 (shadcn 관리 파일)
- `console.log` 커밋 금지

## 경로 규칙
- API 라우트: `src/server/routes/` (`app/api/` 아님)
- 커스텀 컴포넌트: `src/components/`
- shadcn 컴포넌트: `src/components/ui/`
- 커스텀 훅: `src/hooks/`
- 타입 정의: `src/types/`
- 유틸리티: `src/lib/`

## UI / 스타일
- UI 컴포넌트는 shadcn/ui에서 먼저 확인 후 사용
- Tailwind 클래스 병합은 반드시 `cn()` 헬퍼 사용 (`src/lib/utils.ts`)

## TypeScript
- `strict` 모드 준수
- `interface`보다 `type` 우선
- 외부 API 응답은 Zod로 런타임 검증

## Supabase
- 서버 컴포넌트: `createServerClient` 사용
- 클라이언트 컴포넌트: `createBrowserClient` 사용
- DB 접근은 서버 사이드에서만 (RLS 우회 방지)
- 민감한 쿼리는 서버 액션 또는 Route Handler로

## 테스트
- 새 기능에는 테스트 파일 필수 (`*.test.ts` / `*.spec.ts`)
- 테스트 파일은 대상 파일과 같은 디렉토리에 위치
- 단위 테스트: Vitest / E2E: Playwright

## 폴더 구조
src/
├── app/              # Next.js App Router 페이지
├── components/
│   ├── ui/           # shadcn 컴포넌트 (수정 금지)
│   └── [feature]/    # 커스텀 컴포넌트
├── hooks/
├── lib/              # 유틸리티, 클라이언트 초기화
├── server/
│   └── routes/       # API 라우트
└── types/
