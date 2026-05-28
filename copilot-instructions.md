# Copilot Instructions

## Operational Style: Auto-Proceed for Routine Work

### ✅ Auto-proceed (default "Yes")
- File edits, refactoring, formatting
- Build, test, lint operations
- Bug fixes (when root cause is confirmed)
- Deployment to staging/dev environments
- Documentation updates
- Dependency updates (within constraints)
- Local development setup

### ❓ Always ask (require explicit confirmation)
- Scope changes or feature expansions
- New feature implementations
- Production deployments
- Breaking API/schema changes
- Architecture decisions
- Major refactoring or restructuring
- Decisions affecting multiple systems

---

## Context: g-ytp-v1
- **Tech**: Next.js + TypeScript + Supabase + Vitest
- **Workspace**: monorepo (pnpm workspace)
- **Owner**: Kebee (musician/producer/A&R/founder)

### Decision Framework
Default to execution for anything routine or "yes-obvious". For anything requiring judgment, surface options clearly with tradeoffs before proceeding.
