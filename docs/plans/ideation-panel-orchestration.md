# Ideation Panel — Subagent Orchestration Plan

Executed per the `subagent-orchestration` skill: user approves this plan once,
then the orchestrator dispatches implementer → validator → (fixer) subagents
per phase with no mid-flight stops.

Canonical specs every dispatch reads:

- **PRD**: `docs/prd/ideation-panel.md` — requirements, architecture, data on
  disk, acceptance criteria (§9), open risks (§10), file map (§11).
- **Research**: `docs/research/ideation-tanstack-ai-options.md` — TanStack AI
  API names, versions, SSE pattern, shadcn component story.

## Ground rules for EVERY dispatch (paste into each implementer/fixer prompt)

**NO-SLOP policy (verbatim, mandatory):**

- NO `any`, `as any`, `: any` ANYWHERE
- NO placeholder code, NO `// TODO`, NO `// FIXME`
- NO unused imports, NO unused variables — if a variable is not used, it must not exist
- NO console.log hacks to suppress errors. NO void hacks.
- Use `import type` for type-only imports (`verbatimModuleSyntax: true`)
- External imports first, blank line, then local imports
- Do NOT start the dev server

**Repo adaptations (override generic rules where they conflict):**

- pnpm only, from the repo root; new deps go in the right `package.json` with
  `catalog:` references — add exact-pinned entries to `pnpm-workspace.yaml`
  catalog first (`@tanstack/ai@0.52.1`, `@tanstack/ai-react@0.22.4`,
  `@tanstack/ai-openai`, `streamdown`).
- tRPC routers bundle related procedures in one router file (existing
  convention: `packages/api/src/routers/reports.ts`) — the "one
  query/mutation per file" rule does not apply to routers.
- Never hand-edit `routeTree.gen.ts` — new route files are picked up by the
  Vite plugin during build/check-types.
- Files in `packages/api` imported by `apps/web` client code must stay
  Node-free (source-level consumption); server-only logic stays out of them.
- Match the kiln aesthetic in UI work: `rounded-none` borders, lowercase mono
  micro-labels (`text-[0.65rem]`), lucide icons at `size-3.5`, dark-only.

**Gatekeeping commands (implementers and fixers run these BEFORE reporting
done, fix everything they surface):**

```
pnpm run check-types
pnpm --filter web check-types   # strictest gate — type-checks ui sources
pnpm run build
```

**Skills implementers load themselves** (dispatch says "load skill X via the
Skill tool", the prompt does not restate the skill):

- Phases touching shadcn components: `shadcn`
- Phases touching `@tanstack/ai` APIs: `context7-mcp` (docs lookup)

## Phase 1 — Foundation: deps, env, settings, shared types
**Type**: Sequential

**Requirements** (PRD §4.1 shared.ts, §4.5 env/settings):

- Add catalog entries (exact-pinned) for `@tanstack/ai`, `@tanstack/ai-react`,
  `@tanstack/ai-openai`, `streamdown`; add the deps to `packages/api`
  (`@tanstack/ai`, `@tanstack/ai-openai`) and `apps/web`
  (`@tanstack/ai-react`, `streamdown`) via `catalog:`.
- `packages/env/src/server.ts`: add optional typed server vars
  `ZAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`,
  `GROQ_API_KEY`, `XAI_API_KEY` (all `z.string().optional()`).
- `packages/api/src/lib/store.ts`: add the `ideation` settings block
  (`models: { questions, prd, plan }`, `reconciler`) to defaults + a
  `migrate()` branch for pre-ideation stores.
- `packages/api/src/routers/settings.ts`: extend the update zod schema with
  the nested ideation block (with `.default()`s) so whole-object replaces
  cannot wipe it — pre-ideation callers must stay valid (acceptance
  criterion 13).
- `packages/api/src/lib/ideation/shared.ts`: client-safe (Node-free) types +
  zod schemas: phase enum, message shape, model-set shape, candidate/grade
  records, session snapshot, `grillDecisionSchema` (PRD §4.2).

**Inputs**: Read PRD §4-5; `packages/api/src/lib/store.ts`,
`packages/api/src/routers/settings.ts`, `packages/env/src/server.ts`,
`packages/api/src/lib/scaffold-options.ts` (client-safety pattern),
`pnpm-workspace.yaml`.

**Outputs**: Modify `pnpm-workspace.yaml`, `packages/env/src/server.ts`,
`packages/api/src/lib/store.ts`, `packages/api/src/routers/settings.ts`,
`packages/api/package.json`, `apps/web/package.json`; Create
`packages/api/src/lib/ideation/shared.ts`.

**Validation**: gatekeeping commands pass; reviewer verifies the settings
schema extension covers the replace path and migration branch exists;
`shared.ts` has zero Node imports.

**Dependencies**: None (first phase).

## Phase 2 — Catalog + context gatherer
**Type**: Parallel (2 sub-phases)

### 2.1 models.dev catalog
**Requirements** (PRD §4.1 catalog.ts):

- `packages/api/src/lib/ideation/catalog.ts`: fetch
  `https://models.dev/api.json`, zod passthrough validating only consumed
  fields (provider slug keys, display name, OpenAI-compatible base URL when
  present, model ids/names), cache to `join(cacheDir(), "models-dev.json")`
  with tmp+rename atomic writes and 24 h TTL; stale-cache-with-warning on
  validation failure; baked-in z.ai-only fallback set when no cache + failed
  fetch.
- Own provider→envVar table (`zai → ZAI_API_KEY`, …) — never trust env-var
  names from the dump; filter to OpenAI-compatible providers.

**Outputs**: Create `packages/api/src/lib/ideation/catalog.ts`.

**Validation**: gatekeeping commands; reviewer checks TTL/atomic-write/error
paths against PRD §7 (catalog failures).

### 2.2 Context gatherer
**Requirements** (PRD §4.1 context.ts):

- `packages/api/src/lib/ideation/context.ts`: gather `bts.jsonc` (via
  `agents-md/bts-jsonc.ts` `parseBtsJsonc`), depth-limited file-tree summary
  honoring the scanner denylist (`scan.ts`), README if present, git state via
  `gitInspect`; plus the user-typed idea; output shaped to freeze into
  `context.json`.

**Outputs**: Create `packages/api/src/lib/ideation/context.ts`.

**Validation**: gatekeeping commands; reviewer checks denylist reuse and
depth limit.

**Phase-level validation**: both modules integrate (catalog types flow into
later phases), imports/exports coherent.

**Dependencies**: Phase 1.

## Phase 3 — Prompts, runner, session state machine
**Type**: Parallel (3 sub-phases)

### 3.1 Ported prompts
**Requirements** (PRD §4.1 prompts.ts):

- `packages/api/src/lib/ideation/prompts.ts`: port-adapt from
  `/home/didi/workspace/ideadump/packages/ideadump-lib/src/prompts.ts` —
  grill persona (`:2-21`), PRD template (`:38-93`), vertical-slices plan
  template (`:94-151`). De-brand, add project-context injection, extend plan
  prompt with the real stack. Side-chat prompt NOT ported.

**Outputs**: Create `packages/api/src/lib/ideation/prompts.ts`.

**Validation**: reviewer diffs the port against the ideadump source; no
side-chat remnants.

### 3.2 Model runner boundary
**Requirements** (PRD §4.1 runner.ts): load skill `context7-mcp`.

- `packages/api/src/lib/ideation/runner.ts`: the ONLY file importing
  `@tanstack/ai` / `@tanstack/ai-openai`. `generate` / `generateJson` /
  `stream` / `streamJson` over `openaiCompatible({ baseURL })` adapters built
  per provider from catalog + env key. Run/stream twins return
  `AsyncIterable<StreamChunk> & { final: Promise<Result> }`. Abort forwarding
  via `AbortController`.

**Outputs**: Create `packages/api/src/lib/ideation/runner.ts`.

**Validation**: gatekeeping commands; reviewer verifies SDK confinement to
this file and the twins' shape.

### 3.3 Session state machine + persistence
**Requirements** (PRD §4.1 session.ts, §4.2, §5):

- `packages/api/src/lib/ideation/session.ts`: phase machine
  `grilling → prd → planning → done` with `recordGrillAnswer`; create/read/
  update `session.json`, append `transcript.jsonl` / `grades.jsonl`, write
  candidates with the matter front-matter block, save artifacts with the
  write-once guard. Every write through `requireKnownProject` +
  `resolveInside`; relative targets only. Session identity/state never
  depends on process lifetime.

**Outputs**: Create `packages/api/src/lib/ideation/session.ts`.

**Validation**: gatekeeping commands; reviewer walks PRD §5 file tree and
matter-block spec against the code, and §9 criteria 3, 7, 8, 9.

**Phase-level validation**: prompts + runner + session integrate (session
drives runner through a turn; schemas from `shared.ts` used consistently).

**Dependencies**: Phases 1-2.

## Phase 4 — Fan-out engine + tRPC router
**Type**: Parallel (2 sub-phases)

### 4.1 Fan-out/reconcile engine
**Requirements** (PRD §6):

- `packages/api/src/lib/ideation/fanout.ts`: `Promise.all` over the step's
  model set on identical inputs; per-candidate error capture (failed
  candidate persisted with `error` matter, excluded from grading; step
  proceeds if any succeeded, fails loudly only if all N or the reconciler
  failed); one reconciler `generateJson` call merging + grading
  (`reconcileQuestionsSchema` / `reconcileArtifactSchema` from PRD §6). Solo
  mode (N=1): one call, no reconciler, no grades.

**Outputs**: Create `packages/api/src/lib/ideation/fanout.ts`.

**Validation**: reviewer checks solo vs fan-out paths and mid-fan-out
failure semantics (§9 criteria 5, 6).

### 4.2 tRPC ideation router
**Requirements** (PRD §4.4):

- `packages/api/src/routers/ideation.ts` with `models.list`, `session.start`,
  `session.get`, `sessions.list`, `candidates.list`, `artifacts.save` —
  inputs/outputs exactly per the PRD table; register in
  `packages/api/src/routers/index.ts`. `models.list` reports key presence
  booleans only — never key values.

**Outputs**: Create `packages/api/src/routers/ideation.ts`; Modify
`packages/api/src/routers/index.ts`.

**Validation**: gatekeeping commands; reviewer checks every procedure against
the PRD table + containment on all writes.

**Phase-level validation**: router ↔ engine ↔ session integration; §9
criteria 10, 13.

**Dependencies**: Phase 3.

## Phase 5 — SSE chat route (first in the app)
**Type**: Sequential

**Requirements** (PRD §4.3, §10 SSE risk): load skill `context7-mcp`.

- Spike first: prove a long-lived POST SSE stream through Vite dev
  middleware AND the prod server (`serve-prod.mjs` pumps `Response` bodies)
  with a minimal echo route; if provably broken in dev, implement the
  documented fallback and halt for a plan decision.
- `apps/web/src/routes/api/ideation/chat.ts`: `chatParamsFromRequest` →
  phase machine → `toServerSentEventsResponse`; session identity via query
  params; incoming final user message = grilling answer or sentinel command
  (`‹generate-prd›` / `‹generate-plan›`); grilling turns via `generateJson`,
  artifacts stream as `TEXT_MESSAGE_CONTENT` (solo: the model; fan-out: the
  reconciler's merged field via `streamJson`); per-candidate completion as
  AG-UI custom events; abort forwarding; disk is the source of truth — the
  client never reconstructs state from the stream.

**Inputs**: Read PRD §4.3 + research doc SSE section;
`apps/web/src/routes/api/files/download.ts` (non-tRPC route precedent).

**Outputs**: Create `apps/web/src/routes/api/ideation/chat.ts` (+ throwaway
spike findings reported, not committed).

**Validation**: gatekeeping commands; reviewer verifies sentinel handling,
abort path, and restart-resume semantics (§9 criteria 2, 12).

**Dependencies**: Phase 4.

## Phase 6 — UI: panel, picker, deep link
**Type**: Parallel (3 sub-phases). Load skill `shadcn` in each.

### 6.1 Ideation panel + conversation
**Requirements** (PRD §3):

- `apps/web/src/components/ideation/` panel section on
  `projects.$.tsx` (between Note and Files, Note-section container recipe,
  bounded-height chat body). Idea field → grilling (one question per turn,
  ≤4 suggested-answer chips, questionnaire-style) → streaming PRD/plan
  (streamdown) → save flow (write-once collision dialog, `.gitignore` offer)
  → candidates drawer (Sheet: per step, model, score, rationale, file link).
- Chat chrome from existing `packages/ui` primitives: `message.tsx`,
  `bubble.tsx`, `message-scroller.tsx`; `useChat` +
  `fetchServerSentEvents("/api/ideation/chat")`; sentinel messages filtered
  from the visible transcript.

**Outputs**: Create `apps/web/src/components/ideation/` (panel + drawer);
Modify `apps/web/src/routes/projects.$.tsx`.

**Validation**: gatekeeping commands; reviewer checks kiln aesthetic, chip
UX, sentinel filtering, collision dialog.

### 6.2 Model picker (simple first)
**Requirements** (PRD §3):

- One single-select picker defaulting to Settings; advanced toggles "choose
  multiple models" (multi-select current step) and "choose step models"
  (per-step pickers + reconciler picker only when a step has >1 model).
  Options from `models.list` (present keys only); empty state names absent
  env vars.

**Outputs**: Create picker components under
`apps/web/src/components/ideation/`.

**Validation**: gatekeeping commands; reviewer checks the simple-default
path needs zero clicks.

### 6.3 Post-create deep link + questionnaire add
**Requirements** (PRD §3):

- `shadcn` CLI: add `questionnaire` (Base UI variant) to `packages/ui`.
- `handleCreateSuccess` toast action slot renders a two-button node ("open
  project" + "start ideation"); `validateSearch` on the splat route
  (`?ideation=new`); `ScaffoldInput` handoff via `sessionStorage` keyed by
  project path, persisted into `session.json` at `session.start`.

**Outputs**: Modify `apps/web/src/routes/index.tsx`,
`apps/web/src/routes/projects.$.tsx`, `packages/ui` (shadcn add).

**Validation**: gatekeeping commands; reviewer checks seed persistence timing
(§9 criterion 2).

**Phase-level validation**: panel + picker + deep link integrate on the
project page; shared types from `ideation/shared.ts` used client-side; §9
criteria 1, 2, 4.

**Dependencies**: Phases 4-5 (procedures + SSE route exist).

## Phase 7 — Docs + end-to-end validation
**Type**: Sequential

**Requirements**:

- Append the Ideation glossary entry (PRD §11) to `CONTEXT.md`.
- Walk ALL 15 acceptance criteria (PRD §9) against the implementation;
  fix-loop anything failing. Full `pnpm run check-types`, `pnpm --filter web
  check-types`, `pnpm run build`.
- Update `docs/prd/ideation-panel.md` status from draft → implemented if all
  criteria pass.

**Outputs**: Modify `CONTEXT.md`, possibly fix-loop files across the tree.

**Validation**: all 15 criteria verified by a fresh validator that has not
implemented anything; all gates green.

**Dependencies**: All previous phases.

## Success criteria

- All 7 phases pass individual + phase-wide validation.
- `pnpm run check-types`, `pnpm --filter web check-types`, `pnpm run build`
  all green at the end.
- Every PRD §9 acceptance criterion verified against real code by a
  validator subagent.
- No file outside the PRD §11 file map modified (plus `CONTEXT.md` and this
  plan).
