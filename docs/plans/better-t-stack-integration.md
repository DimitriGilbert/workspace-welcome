# Better-T-Stack Integration — "Create new project" from the welcome page

## Overview

Add a **Create new project** flow to the workspace-welcome app: a dynamic, schema-driven form (built with **formedible**, zero per-field JSX) on the welcome page, whose options invoke the **better-t-stack programmatic API** (`create()` from the `create-better-t-stack` npm package) on the server, scaffold a new project under a registered root, and make it appear in the project list.

This is a **programmatic in-process integration** — the CLI is never spawned for scaffolding and no interactive prompts are used. Dependency installation IS run by us as a managed child process (see Phase 1) so the UI gets a live log.

## Required reading (pre-existing research docs)

Every implementer and validator MUST read the relevant docs before touching code. They are verified against package source (including an empirical dry-run test matrix) and are the source of truth for API facts:

- `docs/research/better-t-stack-programmatic-api.md` — exact `create()` signature, `CreateInput` fields, enum spellings, compatibility rules, error types, **and the "Native frontends (follow-up)" section**. Where this plan and that doc disagree on an enum value, **the research doc wins**.
- `docs/research/formedible.md` — installed formedible API (`useFormedible`, field config type, `conditional`, function-valued `options`, `pages`, quirks like "hidden field values persist").
- `docs/research/workspace-welcome-architecture.md` — app map: routes, tRPC wiring, snitch.ts job pattern, scan cache, validation commands, clone-script-sheet pattern.

## Approved defaults & compatibility decisions

Requested defaults mapped to `CreateInput`, with **two mandatory corrections** discovered during research (better-t-stack rejects the literal combination "backend self + runtime node" and "backend self + serverDeploy docker"):

| Form field | Default | Control / values |
|---|---|---|
| projectName | — (required) | text; validated as a safe directory name |
| root | first registered root | select of roots from the store |
| packageManager | `pnpm` | select: pnpm, npm, bun, yarn |
| frontend (web) | `tanstack-start` | select: tanstack-start, tanstack-router, next, nuxt, svelte, solid, astro — always exactly one (form guarantees a web frontend is present) |
| native | `none` | select: none, native-bare, native-uniwind, native-unistyles — **selectable, none by default** |
| backend | `self` (fullstack) | select: self, hono, express, fastify, elysia |
| runtime | `none` **(forced when backend=self)**; `node` default when a separate backend is chosen | select, conditional — hidden when backend=self; values node, bun |
| api | `trpc` | select: trpc, none |
| auth | `better-auth` | select: better-auth, none |
| payments | `none` | select: none, polar |
| database | `sqlite` | select: per research doc |
| orm | `drizzle` | select: drizzle, prisma |
| dbSetup | `none` | select: **dynamic list computed from database choice** (formedible function-valued `options`) |
| git | `true` | switch (handled by `create()`) |
| install | `true` | switch — controls OUR install phase (create() always called with `install: false`) |
| webDeploy | `docker` | select: none, docker, vercel, cloudflare, prisma |
| serverDeploy | `none` when backend=self; `docker` when separate backend | select, conditional — hidden when backend=self |
| addons | `["turborepo"]` | multiSelect: per research doc |
| examples | `none` | select: none, todo, ai |

**Conflict resolutions & composition rules (enforced both client and server):**

1. `backend === "self"` ⇒ `runtime === "none"` (upstream hard requirement). "nodejs default" is honored as the default runtime whenever a separate backend is selected.
2. `backend === "self"` ⇒ `serverDeploy === "none"` and `webDeploy: "docker"` — **exactly one docker** for the fullstack default (user-confirmed). "docker deploy (web+server)" is honored on split stacks (webDeploy docker + serverDeploy docker).
3. `frontend` is an **array** upstream: the form composes `[webFrontend, native?].filter(Boolean)` — max 1 web + max 1 native is guaranteed by the form's controls. Native is fully legal with `backend: "self"` and has no runtime impact (verified empirically; see research doc).
4. Additional upstream compatibility rules from the research doc (e.g. `dbSetup: "docker"` incompatible with sqlite; turso/neon tied to specific databases) are mirrored as zod refinements server-side and as **dependent option lists client-side using formedible's built-in function-valued `options`** — do NOT hand-roll conditional machinery that formedible already provides (`options: (values) => ...`, `conditional`, `disabled` + `description` entries).
5. Native-specific Node requirement (`^22.13.0 || ^24.3.0 || >=26` when packageManager ≠ bun) is satisfied by this box (v24.19.0, verified); no extra server check needed, but the implementer must note it in a code comment where the native option is listed.

**UX rule:** because formedible hidden fields keep their values, the client MUST normalize values in `onSubmit` (force `runtime: "none"`, `serverDeploy: "none"` when backend=self) before calling tRPC; the server schema enforces the same rules regardless.

## Resolved decisions (from grill session — do not re-litigate)

1. Docker: one docker for fullstack (`webDeploy: docker`, `serverDeploy: "none"`); both-docker only on split stacks.
2. Addons default `["turborepo"]` (confirmed).
3. Native: none by default, selectable in the form (confirmed).
4. Install UX: **live install log** — create() with `install: false`, then we spawn `<packageManager> install` as an attached child (snitch.ts pattern) with stderr tail streamed to the sheet.
5. **Live CLI command preview** in the sheet (client-side builder over the same option lists; on success the API's `reproducibleCommand` is shown in the toast).
6. Form layout: **multi-step wizard** via formedible `pages` (Basics / Stack / Database / Deploy & extras) with per-page validation.
7. **Single-flight**: one scaffold at a time; the start mutation rejects while a job is running.
8. Zero registered roots: sheet opens with the form disabled + a hint linking to the existing add-directory flow.
9. Directory conflict: **hard error** ("directory already exists"), user edits the name.
10. On success: sonner toast with an **"Open project"** action navigating to that project's page; scan query invalidated; sheet closes.

## Prerequisites

- Node **>= 22** — **verified on this box: v24.19.0** (also satisfies the native Node range). Phase 1 implementer still asserts at runtime of implementation; if the environment changed below 22, HALT + report.
- `pnpm` resolvable on PATH — verified (10.33.4). The chosen package manager must be on PATH when `install: true` (upstream/our child process invokes it).
- formedible vendored in `packages/ui` (already present, uncommitted) and its peer deps already in `packages/ui/package.json`.
- No DB, no external services.

## Phase 1: `packages/api` — scaffold library (options schema + two-phase job manager)

**Type**: Sequential

**Requirements**:

- Add dependency `create-better-t-stack` (caret-pinned, `^3.40.3`) to `packages/api/package.json` via workspace-aware pnpm install.
- Create `packages/api/src/lib/scaffold.ts` exporting (exact names):
  - `scaffoldOptionLists` — const object: allowed values per select/multiSelect option + which options are dependent on which (single source of truth consumed by the UI form and its dynamic option functions).
  - `scaffoldDefaults` — const matching the defaults table above exactly.
  - `scaffoldInputSchema` — zod v4 schema of the form payload: projectName (safe dir name: non-empty, no `/` `..` path chars, reasonable length), root (absolute path of a registered root, validated against the store's roots), web frontend enum, native enum, plus every other option with exact enum spellings from the research doc; refinements for conflict rules 1, 2 and 4.
  - `ScaffoldInput` — inferred type (form-facing shape: separate `frontend` web select + `native` select; NOT the upstream array — composition happens server-side).
  - `ScaffoldJobSnapshot` type: `{ id, status: "running" | "success" | "error", startedAt, phase: "scaffolding" | "installing" (running only), logTail: string[] (bounded stderr tail, last ~40 lines), result?: { projectDirectory, reproducibleCommand, elapsedTimeMs }, error?: string }`.
  - `startScaffoldJob(input: ScaffoldInput): { jobId: string }` — **single-flight**: rejects with a typed "already running" error while any job is running; registers the job in an in-memory Map and kicks off (does not await) the async work:
    1. Resolve target dir `join(root, projectName)`, pre-check it does not exist (friendly error; `directoryConflict: "error"` also passed upstream as backstop).
    2. Call `create()` with `install: false` and the composed `frontend` array per research doc invocation (phase: "scaffolding").
    3. On success, if `input.install`, spawn `<packageManager> install` in `projectDirectory` as an **attached child process** following `snitch.ts` conventions: capture stderr into the bounded `logTail`, `phase: "installing"` (skip when install=false).
    4. On success call `invalidateScanCache()` (from `packages/api/src/lib/scan-cache.ts`); snapshot stores `projectDirectory`, `reproducibleCommand`, `elapsedTimeMs`.
  - `getScaffoldJob(jobId: string): ScaffoldJobSnapshot | null`.
- Process hygiene: 10-minute overall job timeout → mark job error (with tail excerpt) and kill the install child using the SIGTERM→SIGKILL ladder as in snitch.ts; register the child with the repo's exit-cleanup mechanism if that is the established pattern; terminal jobs are GC'd from the Map ~15 minutes after settling. A failed/partial scaffold leaves files on disk — the error message must state the directory was kept.
- Error mapping: `DirectoryConflictError` → friendly "directory already exists"; `CLIError` → its message (these carry compatibility-rule errors); other `CreateError` variants → generic message with variant name. Errors land in the snapshot or typed start-errors; never thrown as unstructured exceptions across the tRPC boundary.

**Inputs**:
- Read: `docs/research/better-t-stack-programmatic-api.md` (incl. native section), `docs/research/workspace-welcome-architecture.md`, `packages/api/src/lib/snitch.ts`, `packages/api/src/lib/scan-cache.ts`, `packages/api/src/lib/store.ts`, `packages/api/package.json`.
- Reference: snitch.ts job + child-process pattern.

**Outputs**:
- Create: `packages/api/src/lib/scaffold.ts`
- Modify: `packages/api/package.json` (+ lockfile via install)

**Validation Criteria**:
- `pnpm --filter <api-package> check-types` (exact package name per architecture doc) and root `pnpm check-types`: zero errors.
- Defaults table implemented exactly; enum spellings match research doc; native values `native-bare|native-uniwind|native-unistyles`.
- Conflict refinements present; single-flight guard present; two-phase job with logTail; timeout + kill ladder; scan-cache invalidation on success.

**Dependencies**: None (first phase).

---

## Phase 2: `packages/api` — tRPC router

**Type**: Sequential

**Requirements**:

- Create `packages/api/src/routers/scaffold.ts` with:
  - `start` — mutation, input `scaffoldInputSchema`, returns `{ jobId }` from `startScaffoldJob`; maps the single-flight start-error to a tRPC `BAD_REQUEST` with a clear user-facing message.
  - `job` — query, input `z.object({ jobId: z.string() })`, returns `getScaffoldJob` result (nullable — the client treats null-after-running as "job lost, server probably restarted").
- Register the router in the merged root router following existing router registration conventions.
- Reuse (not duplicate) the Phase 1 schema and types — single source of truth.

**Inputs**:
- Read: `packages/api/src/lib/scaffold.ts`, `packages/api/src/routers/*` (for registration pattern), architecture doc.

**Outputs**:
- Create: `packages/api/src/routers/scaffold.ts`
- Modify: root router file (per architecture doc)

**Validation Criteria**:
- Root `pnpm check-types`: zero errors.
- Procedures match the repo's tRPC v11 conventions (zod input, typed outputs).

**Dependencies**: Phase 1 must complete.

---

## Phase 3: `apps/web` — formedible wizard + welcome-page wiring

**Type**: Sequential sub-phases, then phase-wide validation.

### 3.1: Create-project sheet (formedible-driven wizard)

**Requirements**:

- Create `apps/web/src/components/create-project-sheet.tsx` following the Sheet shell/UX of `apps/web/src/components/clone-script-sheet.tsx`.
- The form MUST be schema-driven via `useFormedible` — **no per-field JSX** (that is the point of formedible). Field configs are generated from `scaffoldOptionLists` / `scaffoldDefaults` imported from the api package (use the repo's existing alias/import convention).
- **Multi-step wizard** via formedible `pages` (built-in — do not hand-roll step state):
  - Basics: projectName, root, packageManager
  - Stack: frontend (web), native, backend, runtime (conditional), api, auth
  - Database: database, orm, dbSetup (dynamic options)
  - Deploy & extras: webDeploy, serverDeploy (conditional), payments, addons (multiSelect), examples, git, install
- **Dependent option lists use formedible's built-in function-valued `options`** (e.g. dbSetup options computed from the current database; use `{ value, label, disabled, description }` entries where a value exists but is discouraged). Conditional visibility uses `conditional`. Do not recreate these mechanisms.
- Form-level zod v4 schema (Standard Schema) mirroring the server rules (dir-name validation + conflict refinements 1, 2, 4).
- defaultValues: `scaffoldDefaults` + dynamic `root` fetched via the existing tRPC roots/projects query; render the form only after roots resolve (default root = first registered). **Zero roots ⇒ form disabled with a hint linking to the add-directory flow** (existing sheet).
- **Live CLI command preview**: a client-side `buildEquivalentCommand(values)` producing the `pnpm create better-t-stack@latest ...` string (mirroring the user's reference command shape) rendered monospace in the sheet, updating as values change.
- `onSubmit`: normalize hidden-field values (force `runtime`/`serverDeploy` to `"none"` when backend=self), call `trpc.scaffold.start`, then hand the returned `jobId` to the polling view.
- Sheet progress view while the job runs: status, current phase (scaffolding/installing), elapsed time, live `logTail`, and the single-flight error surfaced clearly if start is rejected.

**Inputs**:
- Read: `docs/research/formedible.md`, clone-script-sheet.tsx, `packages/api/src/lib/scaffold.ts`, formedible source under `packages/ui/src/components/formedible/` as needed.

**Outputs**:
- Create: `apps/web/src/components/create-project-sheet.tsx`

**Validation**:
- `pnpm --filter web check-types`: zero errors.
- No hand-written per-field JSX; all option lists sourced from `scaffoldOptionLists`; dynamic lists via formedible's function-valued `options`; wizard via formedible `pages`.

### 3.2: Welcome-page wiring + polling

**Requirements**:

- Modify `apps/web/src/routes/index.tsx`: add a **Create project** button to the existing header button row (Refresh / Clone script / Add directory) and mount the sheet alongside the other sheets.
- Polling: mirror `apps/web/src/lib/use-report.ts` / `routes/reports/$key.tsx` — `refetchInterval` functional, 1000 ms while `status === "running"`, disabled on terminal status; a `null` job response after having observed `running` is shown as an error ("job lost — server restarted?").
- On success: sonner toast (project name + elapsed + `reproducibleCommand`) with an **"Open project" action** that navigates to that project's page (route per architecture doc); invalidate the projects scan query so the new project appears immediately; close the sheet; stay in control (no auto-navigation).
- On error: error toast with the mapped server message (including directory-kept note on partial failures).

**Inputs**:
- Read: `apps/web/src/routes/index.tsx`, `apps/web/src/lib/use-report.ts`, `apps/web/src/routes/reports/$key.tsx`, architecture doc (for the project route).

**Outputs**:
- Modify: `apps/web/src/routes/index.tsx`
- Create or extend a small hook/file for polling only if it keeps the sheet component clean (implementer's judgment, max 1 extra file under `apps/web/src/lib/`)

**Validation**:
- `pnpm --filter web check-types`: zero errors.
- Polling stops on terminal status; scan invalidation present; toast action navigates correctly.

### Phase-level Validation (mandatory):

- Phase-wide validator reads ALL Phase 3 files together (plus Phase 1/2 exports they consume): import aliases correct, types flow `api → web`, no duplicated option lists, sheet lifecycle sound (open → wizard → submit → poll → toast/navigate → close), conditional + dynamic options behave per conflict rules, command preview consistent with option lists.

**Dependencies**: Phases 1 and 2 must complete.

---

## Phase 4: End-to-end validation

**Type**: Sequential (validator only)

**Requirements**:

- Validator reads every created/modified file across Phases 1–3 as one system and verifies: defaults table exact match; conflict rules enforced on client AND server; frontend-array composition correct (web + optional native); single-flight, timeout/kill, logTail, and GC implemented per Phase 1; `invalidateScanCache()` called on success; tRPC procedures wired and registered; formedible used schema-driven with built-ins (`pages`, function-valued `options`, `conditional`) rather than hand-rolled equivalents; NO-SLOP compliance everywhere.
- Root `pnpm check-types`: zero errors.
- No dev server is started during validation.

**Outputs**: None (read-only).

**Dependencies**: Phases 1–3 must complete.

---

## Success Criteria

- All phases pass implementer → validator loops (≤ 3 fix attempts each).
- Root `pnpm check-types` zero errors.
- From the welcome page a user can: open the wizard → defaults pre-filled exactly per the table (native none, single docker for fullstack) → step through with per-page validation watching the live command preview → submit → watch scaffolding then live install log → success toast with "Open project" → new project visible in the list.
- Option compatibility rules surface as form-level errors before submission, and as tRPC errors if bypassed.

## Execution notes (orchestration)

- Workflow per the subagent-orchestration skill: 1 implementer → 1 validator per (sub-)phase → fixer loops fixing ALL validator errors at once (max 3 attempts) → phase-wide validator for Phase 3 → final Phase 4 validation.
- **NO-SLOP policy** is pasted verbatim into every implementer/fixer dispatch and enforced by every validator (no `any`, no TODO/FIXME, no unused imports/vars, `import type` for type-only imports, external-before-local import order, no dev server).
- Gatekeeping before any implementer reports done: the check-types commands listed in their phase.
- **No git commits** — the working tree already holds the user's uncommitted formedible work on branch `creator`; commits happen only on explicit user request.
- If `create-better-t-stack` cannot be installed or `node --version` < 22 at execution time, HALT and report instead of working around.
- Research docs are mandatory reading; discrepancies between plan and research docs on better-t-stack facts are resolved in favor of the research doc and reported back.
