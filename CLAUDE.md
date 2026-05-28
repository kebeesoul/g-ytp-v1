# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes.
Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## File Structure

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project-wide rules — highest priority |
| `AGENTS.md` | Implementation-phase constraints — subordinate to CLAUDE.md |
| `DESIGN.md` | UI reference only — ignore for non-UI tasks |
| `PROJECT_SPEC.md` | Generated after architecture is finalized. Records immutable decisions: tech choices, data models, API design. When present, supersedes AGENTS.md as the SPEC source of truth. |

---

## Project Context

- **Framework:** Next.js 16 App Router
- **UI:** shadcn/ui + Tailwind CSS
- **Database:** Supabase
- **Package manager:** pnpm
- **Language:** TypeScript (strict)

## Local Server

- Start the local app with `pnpm start`.
- Do not use `npm run dev` or `pnpm dev` for this repo unless explicitly requested.
- If the app has not been built yet, run `pnpm run build` first, then `pnpm start`.

---

## Hard Prohibitions

- Do not modify the `pages/` directory — App Router migration in progress.
- Do not use `any` type.
- Do not modify `components/ui/` — managed by shadcn.
- Do not commit `console.log`.

---

## Path Conventions

| Type | Path |
|---|---|
| API routes | `src/app/api/` |
| Custom components | `src/components/` |
| shadcn components | `src/components/ui/` |
| Custom hooks | `src/hooks/` |
| Type definitions | `src/types/` |
| Utilities | `src/lib/` |

---

## UI / Styling

- Always check shadcn/ui before building a custom component.
- Always use the `cn()` helper for Tailwind class merging (`src/lib/utils.ts`).

---

## TypeScript

- Enforce `strict` mode throughout.
- Prefer `type` over `interface`.
- Validate all external API responses with Zod at runtime.

---

## Supabase

- Server components: use `createServerClient`.
- Client components: use `createBrowserClient`.
- All DB access must be server-side only — prevents RLS bypass.
- Sensitive queries must go through a Server Action or Route Handler.

---

## Testing

- Every new feature requires a test file (`*.test.ts` / `*.spec.ts`).
- Test files live in the same directory as the file under test.
- Unit tests: Vitest / E2E: Playwright.
- Write tests before final delivery.

---

## Folder Structure

```
src/
├── app/              # Next.js App Router pages
│   └── api/          # API routes
├── components/
│   ├── ui/           # shadcn components — do not modify
│   └── [feature]/    # custom components
├── hooks/
├── lib/              # utilities, client initialization
└── types/
```

---

## Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Apply this decision tree in order before every implementation:

**Step 1 — Ambiguity check.**
Does the request have multiple valid interpretations?
- Yes → Present the interpretations. Ask one focused question. Do not pick silently.
- If a simpler approach exists, say so and push back before writing a line.

**Step 2 — No ambiguity: implement immediately.**
- Do not ask for clarification on clear tasks.
- Do not explain your approach unless requested.
- Code first. Explain only if asked.

**Step 3 — Ambiguity discovered mid-implementation: stop.**
- Name what's confusing. Ask the single most important question.
- Do not guess forward.

> **Priority rule:** Clarity before speed. But don't manufacture uncertainty where none exists.

---

## Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
  - **Exception:** Project-level conventions (`cn()`, Zod for external boundaries, Route Handler patterns) are required regardless of use count. These are architectural decisions, not over-engineering.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
  - **Exception:** External boundaries (API responses, user input, Supabase results) always require defensive handling via Zod or explicit error types. "Impossible" applies only to internal type flows already guaranteed by TypeScript.
- If you write 200 lines and it could be 50, rewrite it.

> Ask yourself: "Would a senior engineer call this overcomplicated?" If yes, simplify.

---

## Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports, variables, and functions that **your changes** made unused.
- Do not remove pre-existing dead code unless asked.
  - **Exception:** If pre-existing dead code causes a TypeScript compilation error or a failing test that directly blocks your current task, remove it and note it explicitly in the commit message.

> The test: every changed line must trace directly to the user's request.

---

## Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform vague tasks into verifiable goals:

| Vague | Verifiable |
|---|---|
| "Add validation" | Write tests for invalid inputs, then make them pass |
| "Fix the bug" | Write a test that reproduces it, then make it pass |
| "Refactor X" | Ensure tests pass before and after, with no behavior change |

For multi-step tasks, state a brief plan upfront:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you iterate independently.
Weak criteria ("make it work") require constant back-and-forth.

---

## Zod Usage Boundary

Resolves the tension between "no defensive over-engineering" and "Zod is mandatory":

| Context | Zod required? | Reason |
|---|---|---|
| External API responses | ✅ Yes | TypeScript guarantees end at runtime boundaries |
| Supabase query results | ✅ Yes | Schema drift is a real runtime risk |
| User input (forms, params) | ✅ Yes | Never trust external input |
| Internal function calls | ❌ No | TypeScript types are sufficient |
| Inter-component props | ❌ No | TypeScript types are sufficient |

> Rule of thumb: Zod guards every boundary where TypeScript's compile-time guarantees end.

---

## Technical Specs

- **Response format:** Code first. Explain only if requested.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, etc.), English, single line only.
- **Function size:** Keep functions under 100 lines with a single responsibility.
- **Comments:** English only. Focus on **why**, not what.

---

**These guidelines are working if:**
fewer unnecessary changes appear in diffs,
fewer rewrites happen due to overcomplication,
and clarifying questions come before implementation — not after mistakes.
