# PRD — Ideation panel

Status: implemented (2026-09-02)

## 1. Summary & motivation

workspace-welcome today ends at the scaffold: `Create project` gives you a
better-t-stack skeleton and an AGENTS.md, then hands you a blinking cursor.
The Ideation panel closes that gap. It is a chat section on the project
detail page where an AI grills the user — one question at a time,
skeptical, relentless — until the idea is resolved, then generates a PRD
and a vertical-slice implementation plan into `docs/PRD.md` and
`docs/PLAN.md` inside the project. Each pipeline step can fan out over
multiple models; a reconciler merges the candidates and grades them, and
every candidate is kept on disk with a front-matter "matter" string for
traceability. The pipeline is a port of owned code from the private
`ideadump` repo — prompts, decision schema, state machine — rebuilt
natively on TanStack AI with provider-direct calls (no OpenRouter, no
linking to the ideadump packages).

## 2. Goals / Non-goals

**Goals**

- Grilling → PRD → plan → done, on the project page, for new and existing
  projects (writes confined by `requireKnownProject` and `resolveInside`).
- Multi-model fan-out per step (questions / PRD / plan each with its own
  model set), reconciler merge + per-candidate grading, everything
  persisted.
- Provider-direct calls via the OpenAI-compatible adapter; model catalog
  from the models.dev dump, cached locally.
- Sessions survive dev-server restarts (disk-backed under the project),
  and the app's first SSE route arrives via TanStack AI's documented
  Start pattern.

**Non-goals (v1)**

- Side-chat (ideadump's `chat` prompt and `chatHistory`).
- Artifact versioning in a database — the candidate backlog on disk is the
  version record; there is no DB.
- "Repass with a second reconciler" — one reconcile pass, then the merged
  output stands.
- BYOK UI — keys come from the environment only.
- Benchmark dashboards over the grades log (the data is the seed, not the
  feature).
- OpenRouter gateway.
- Publishing or depending on `@ideadump/*` packages; the port is copy-adapt.

## 3. User experience

**Panel.** A new section in the vertical stack on
`apps/web/src/routes/projects.$.tsx`, placed between the Note section and
the full-bleed Files section (docs before code). It follows the Note
section's container recipe — `max-w-[1480px]` with a
`border border-foreground/10` body (`projects.$.tsx:612-631`) — with a
bounded-height chat body; the FileBrowser stays the full-bleed *component*
precedent (`projects.$.tsx:634-637`, alongside the vitals band). Kiln
aesthetic: `rounded-none` borders, lowercase mono micro-labels, lucide
`size-3.5` icons.

**Model picker — simple first.** One obvious single-select picker in the
panel header, defaulting to the Settings value, with two advanced toggles:
**choose multiple models** (multi-select for the current step) and
**choose step models** (per-step pickers — questions / PRD / plan — with a
reconciler picker appearing only when a step has >1 model).

**Conversation flow.**

1. **Idea field** — a textarea ("What are you building?") plus, for
   freshly scaffolded projects, the seeded context summary. Starting
   writes `session.json` and enters grilling.
2. **Grilling** — one question at a time as an assistant `Message`/
   `Bubble`; up to 4 suggested answers render as a questionnaire-style
   chip row (pick to fill the composer, edit, or ignore). The persona is
   ported in spirit: "direct, skeptical, and relentless".
3. **PRD generation** — when the model decides the idea is resolved, the
   panel offers "Create PRD"; the artifact streams in as markdown
   (streamdown) inside the chat. Same shape for the plan, fed by the PRD.
4. **Save flow** — "Save to project" writes `docs/PRD.md` / `docs/PLAN.md`
   with write-once semantics: an existing file blocks the save until the
   user explicitly confirms regeneration — never silently overwritten,
   same rule as the AGENTS.md scaffold step. On first save in a git repo
   whose `.gitignore` lacks `.ideadump/`, the dialog offers to append it.

**Candidates drawer.** A "candidates" action opens a Sheet listing, per
step, every model that ran, its score, one-line rationale, and a link to
the persisted candidate file. The chat only ever shows the merged output.

**Post-create deep link.** The create-success toast in `handleCreateSuccess`
(`apps/web/src/routes/index.tsx:130-143`) gains a "Start ideation"
affordance navigating to `/projects/<path>?ideation=new`. sonner's action
slot is single (`action?: Action | React.ReactNode`, sonner 2.0.7
`dist/index.d.ts:62`), so the slot renders a small two-button node —
"open project" (existing behavior) and "start ideation" — rather than a
literal second `action` field. The splat route gains a `validateSearch`
param; `ideation=new` scrolls to and opens the panel with a blank session
seeded by the wizard's `ScaffoldInput` (client-safe type at
`packages/api/src/lib/scaffold-options.ts:440`, handed off via
`sessionStorage` keyed by project path — the scaffold job snapshot is
garbage-collected after 15 min, `scaffold.ts:81`, so the seed is
persisted into `session.json` at `session.start` time, not fetched from
the transient registry later).

## 4. Architecture

### 4.1 Modules — `packages/api/src/lib/ideation/`

All server logic lives here; only `shared.ts` is client-importable.

| Module | Responsibility |
| --- | --- |
| `shared.ts` | Client-safe types + zod schemas: phase enum, message shape, model-set shape, candidate/grade records, session snapshot. Zero Node imports — the discipline of `scaffold-options.ts` (`packages/api/src/lib/scaffold-options.ts:1-9`), because `apps/web` consumes api sources client-side. |
| `prompts.ts` | Ported from `ideadump/packages/ideadump-lib/src/prompts.ts`: the grill persona ("Ask exactly one question at a time", "direct, skeptical, and relentless", 0–4 `suggestedAnswers`, two structured-output shapes — `prompts.ts:2-21`), the PRD template (Summary / Problem / Goals / Non-Goals / Users / Functional + Non-Functional Requirements / User Flow / Scope / Success Metrics / Risks / Open Questions — `prompts.ts:38-93`), and the vertical-slices plan template (Overview / Assumptions / Dependencies / Slices with Outcome-Tasks-Validation-Risks / Cross-Cutting / Final Validation — `prompts.ts:94-151`). Adaptations: de-brand, inject gathered project context, extend the plan prompt with the real stack. Side-chat (`prompts.ts:22-37`) not ported. |
| `catalog.ts` | models.dev catalog: `GET https://models.dev/api.json`, zod-validated passthrough (only consumed fields: provider slug keys, display name, OpenAI-compatible base URL when present, model ids/names), cached to `join(cacheDir(), "models-dev.json")` (`xdg.ts:13-17`) with tmp+rename writes like `persistRaw` (`store.ts:137-153`) and a 24 h TTL copied from ideadump's models.json (`ideadump/packages/local-api/src/model-catalog.ts:5`). Owns the provider→`envVar` table (`zai → ZAI_API_KEY`, `openai → OPENAI_API_KEY`, `anthropic → ANTHROPIC_API_KEY`, …); never trusts env-var names from the dump. |
| `context.ts` | Context gatherer: `bts.jsonc` via the existing `agents-md/bts-jsonc.ts` (`parseBtsJsonc`, `:42`); depth-limited file-tree summary honoring the scanner denylist (`scan.ts:25-51`); README if present; git state via `gitInspect` (`lib/git.ts:125`); plus the user-typed idea. Frozen into `context.json` at session start. |
| `runner.ts` | Model-runner boundary over `@tanstack/ai` `chat()`: `generate` / `generateJson` / `stream` / `streamJson` against `openaiCompatible({ baseURL })` adapters (`@tanstack/ai-openai/compatible`) built per provider from catalog + env key. The only file touching the SDK — the ported `ModelRunner` boundary (`ideadump-lib/src/types.ts:78-83`) without the package. Keeps the run/stream twins: `AsyncIterable<StreamChunk> & { final: Promise<Result> }` (`types.ts:72-74`) so the SSE layer pumps deltas while the server awaits `final` before persisting; abort forwarding via `AbortController`. |
| `fanout.ts` | Fan-out/reconcile engine (§6): `Promise.all` over the step's model set on identical inputs, per-candidate error capture, then one reconciler `generateJson` call. |
| `session.ts` | Session persistence: create/read/update `session.json`, append `transcript.jsonl` / `grades.jsonl`, write candidates, save artifacts — every path through `resolveInside` behind `requireKnownProject`. Write-once guard for `docs/PRD.md` / `docs/PLAN.md` mirroring the AGENTS.md step (`scaffold.ts:228-249`). Sessions never depend on process lifetime — the scaffold registry's in-memory `Map` with 15-min GC (`scaffold.ts:77-81`) is the anti-pattern this module avoids. |

### 4.2 Grill decision schema (ported verbatim)

From `ideadump-lib/src/runners.ts:24-31`:

```ts
const grillDecisionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("question"),
    question: z.string().min(1),
    suggestedAnswers: z.array(z.string()).default([]),
  }),
  z.object({ status: z.literal("complete"), reason: z.string().optional() }),
]);
```

The state shape ports `IdeaDumpState` minus side-chat and virtual-FS
(`ideadump-lib/src/state.ts:3-18`, `types.ts:31-37`):
`{ idea, questionHistory[], context: { project: <gathered snapshot>,
prd?, plan? }, phase }`. Phases `grilling → prd → planning → done`
(`types.ts:17`); `refining` is not ported. Recording an answer is the
ported `recordGrillAnswer` (`runners.ts:80-86`).

### 4.3 SSE route — the first in the app

`apps/web/src/routes/api/ideation/chat.ts`, a TanStack Start file route
with a POST server handler (non-tRPC precedent:
`apps/web/src/routes/api/files/download.ts:13-51`) in the documented
TanStack AI quick-start shape: `chatParamsFromRequest(request)` in,
`toServerSentEventsResponse(stream)` out (AG-UI events on the wire —
`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `RUN_FINISHED`, `RUN_ERROR`).
Session identity rides as query params (`?session=<id>&project=<encoded
path>`); the handler loads `session.json`, treats the incoming final user
message as either a grilling answer or a sentinel command
(`‹generate-prd›`, `‹generate-plan›` — emitted by the panel's action
buttons, filtered out of the visible transcript client-side), runs the
phase machine, and streams the result:

- grilling turns: the question step runs as `generateJson`
  (`GrillDecision`); the merged question arrives as one assistant message
  with `suggestedAnswers` as metadata.
- PRD/plan steps: the artifact streams as `TEXT_MESSAGE_CONTENT` deltas —
  the single model's output in solo mode, the reconciler's merged markdown
  in fan-out (forwarding the `merged` field of a `streamJson` call).
  Per-candidate completion rides AG-UI custom events for per-model
  progress chips.

The client consumes it with `useChat({ connection:
fetchServerSentEvents("/api/ideation/chat") })` from `@tanstack/ai-react`.

### 4.4 tRPC ideation router

`packages/api/src/routers/ideation.ts`, registered beside the others in
`packages/api/src/routers/index.ts:11-23` (job-handle style per
`routers/reports.ts` — kick-off mutation plus a polling query):

| Procedure | Kind | Input | Output |
| --- | --- | --- | --- |
| `models.list` | query | — | `{ providers: Array<{ id, label, envVar, keyPresent, baseUrl?, models: Array<{ id, label }> }> }` — every catalog provider with OpenAI-compatible reach; UI shows models only for `keyPresent`, and lists absent env vars for the missing-key state. |
| `context.preview` | query | `{ path }` | `{ contextSummary }` — read-only pre-start preview of the gatherer's one-line summary for the idea form (criterion 1); containment-checked via `requireKnownProject`, nothing persisted. |
| `session.start` | mutation | `{ path, idea, scaffoldInput?, models? }` | `{ sessionId, phase, contextSummary }` — gathers + freezes context, writes `session.json`, persists the `ScaffoldInput` seed immediately. |
| `session.get` | query | `{ path, sessionId }` | Session snapshot (transcript, phase, model sets, artifact status) or null. Doubles as the status/poll op. |
| `sessions.list` | query | `{ path }` | Session summaries for the panel's resume picker. |
| `candidates.list` | query | `{ path, sessionId, step? }` | `Array<{ step, model, score?, rationale?, error?, file }>` for the drawer. |
| `artifacts.save` | mutation | `{ path, sessionId, artifacts: Array<"prd" \| "plan">, overwrite? }` | `{ written: string[], collisions: string[], gitignoreAppended: boolean }` — collisions returned unless `overwrite: true`. |

### 4.5 Env and settings

- **Env** (`packages/env/src/server.ts`, currently `CORS_ORIGIN` /
  `NODE_ENV` only — `:5-13`): optional-but-typed server vars for the
  launch provider set — `ZAI_API_KEY`, `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY` —
  each `z.string().optional()`. Server-only: key values never cross tRPC
  or SSE; `models.list` reports presence booleans only.
- **Settings** (`store.ts:18-23` defaults, `:30-73` hand-rolled
  migration):

  ```ts
  ideation: {
    models: { questions: string[]; prd: string[]; plan: string[] };
    // each array defaults to ["<zai glm-5.3-flash catalog id>"]
    reconciler: string; // defaults to the z.ai flagship glm-5.3 id
  }
  ```

  `reconciler` is dormant while every step is solo. **Caution:**
  `settings.update` replaces the whole settings object — its input schema
  and the `draft.settings = { … }` assignment (`routers/settings.ts:13-31`)
  must gain the nested block (with `.default()` so pre-ideation callers
  stay valid), plus a branch in `migrate()`, or any settings save wipes
  the ideation defaults. Per-session model choices are copied into
  `session.json` at start, so later settings changes never rewrite a
  session's provenance.

### 4.6 Containment

Every ideation write — session files, candidates, grades, artifacts —
goes through `requireKnownProject` (`known-project.ts:16-27`) then
`resolveInside` (`file-ops.ts:53-82`), the same gate the download route
uses (`api/files/download.ts:26-29`). Relative targets only:
`docs/PRD.md`, `docs/PLAN.md`, `.ideadump/ideation/<sessionId>/…`.

## 5. Data on disk

```text
<project>/
├── docs/
│   ├── PRD.md                    # final merged artifact (write-once)
│   └── PLAN.md                   # final merged artifact (write-once)
└── .ideadump/                    # suggested for .gitignore (§8)
    └── ideation/
        └── <sessionId>/
            ├── session.json      # state machine snapshot (resume source)
            ├── context.json      # frozen gatherer output
            ├── transcript.jsonl  # append-only chat turns
            ├── grades.jsonl      # one line per reconcile decision
            └── candidates/<step>/<provider>/<model>.md   # step: questions|prd|plan
```

The `<provider>` path segment disambiguates model ids that collide across
providers. `session.json` shape:

```jsonc
{
  "id": "…", "projectPath": "/abs", "createdAt": "…", "updatedAt": "…",
  "phase": "grilling", "idea": "…",
  "scaffoldInput": { /* frozen seed, or null */ },
  "questionHistory": [{ "role": "…", "content": "…", "createdAt": "…" }],
  "models": { "questions": ["…"], "prd": ["…"], "plan": ["…"], "reconciler": "…" },
  "artifacts": { "prd": { "path": "docs/PRD.md", "savedAt": "…" } }
}
```

**Matter string** (the owner's name for it): a front-matter block on top of
every candidate file —

```yaml
---
step: prd                        # questions | prd | plan
model: zai/glm-5.3-flash         # catalog provider/model id
timestamp: 2026-09-01T12:00:00.000Z
score: 8                         # 0–10, reconciler-assigned; omitted in solo mode
rationale: kept the slice structure, dropped the invented metrics
error: …                         # present only when this candidate failed
---
```

Final artifacts carry matter too, with provenance instead of grades:
`step`, `session`, `generated-at`, `models: [<candidate ids>]`, and
`reconciler: <id>` (omitted in solo mode).

## 6. Model & fan-out semantics

- **Per-step model sets.** Three independent steps — questions, PRD
  creation, plan creation — each with its own model set, default
  `glm-5.3-flash` solo on all three: **no reconciler, no grades by
  default**. Solo mode (N=1) runs one call, streams it, persists one
  candidate without a score.
- **Fan-out (N>1).** All N models run in parallel (`Promise.all`) on the
  same state, producing N candidates; a single reconciler then makes one
  structured-output call that both merges and grades:

  ```ts
  const gradesSchema = z.array(z.object({
    model: z.string(),
    score: z.number().int().min(0).max(10),
    rationale: z.string(), // one line
  }));
  const reconcileQuestionsSchema = z.object({ merged: grillDecisionSchema, grades: gradesSchema });
  const reconcileArtifactSchema = z.object({ merged: z.string().min(1), grades: gradesSchema });
  ```

  The user sees only the merged question/artifact in-chat; all candidates
  plus grades land in the backlog (traceability / benchmark seed). In
  fan-out mode it is the reconciler's merged markdown that streams (§4.3).
- **Defaults & GLM lineup.** `glm-5.3-flash` (1M ctx, promo-priced) is the
  workhorse; the free classmates `glm-4.7-flash` / `glm-4.5-flash` are the
  natural fan-out fillers; flagship `glm-5.3` is the default reconciler,
  engaging the moment a step has >1 model. All live behind the one z.ai
  OpenAI-compatible base URL (`https://api.z.ai/api/paas/v4`) and one
  `ZAI_API_KEY`.
- **Mid-fan-out failure** is best-effort: a failed candidate is persisted
  with an `error` matter field and excluded from grading; the step
  proceeds if any candidate succeeded, and fails loudly only if all N (or
  the reconciler) failed.

## 7. Error handling & edge cases

- **Missing keys** — `models.list` returns every provider with
  `keyPresent`; the picker shows only present ones and the empty state
  names the absent vars ("Set `ZAI_API_KEY` to use GLM models"). Starting
  a session whose models' keys are missing fails with the same list.
- **Model call failure mid-fan-out** — per-candidate error records in the
  backlog (§6); the chat surfaces a non-fatal note ("2 of 3 models
  responded").
- **Dev-server restart mid-session** — the client refetches
  `session.get`, which replays transcript and phase from `session.json`;
  a step interrupted mid-generation is re-run on resume (state
  transitions only on success, so re-runs are safe).
- **Write-once collisions** — `artifacts.save` returns `collisions`
  instead of writing; the confirm dialog is the only path to
  `overwrite: true` (AGENTS.md-step semantics, `scaffold.ts:228-249`).
- **Containment violations** — a path escaping the project, or a project
  outside a registered root, throws from
  `resolveInside`/`requireKnownProject`; nothing is written.
- **SSE disconnects** — request abort forwards to the model calls via
  `AbortController`; the pending step is marked interrupted in
  `session.json`; no orphaned generation spends tokens. The client never
  reconstructs state from the stream — disk is the source of truth.
- **Catalog failures** — an invalid models.dev dump (zod failure) serves
  the stale cache with a warning; missing cache plus failed fetch leaves
  the z.ai-only fallback set baked into `catalog.ts`.

## 8. Security & privacy

- API keys live in the environment, validated by `@workspace-welcome/env`
  server-side, and are read only by `runner.ts`. They never appear in
  tRPC outputs, SSE events, client bundles, or persisted files.
- Prompts embed local project context (stack, tree, README, git state).
  That context stays local except for the direct provider calls the
  user's model choices imply — no gateway, no telemetry, no intermediary.
- **`.ideadump/` in `.gitignore` — yes, by offer.** The backlog is
  machine-generated working material — diff noise at hundreds of KB per
  session, and idea-stage content the user may not want pushed — while
  the final `docs/` artifacts are meant to be committed. The save flow
  offers to append `.ideadump/` to `.gitignore` once (never silently;
  skipped for non-repos).
- Session directories sit inside the project subtree, inheriting the
  app's threat model: a local, no-auth dashboard for the user's own
  machine (same posture as the file browser, ADR-0002).

## 9. Acceptance criteria

1. Every known project's detail page renders the Ideation panel; an
   un-seeded project shows the idea field plus a summary of its real
   `bts.jsonc`/tree/README/git context.
2. The create-success toast offers "Start ideation"; it lands on
   `/projects/<path>?ideation=new` with the panel open, a fresh session,
   and the wizard's `ScaffoldInput` frozen into `session.json` at
   `session.start` — no dependency on the transient scaffold job registry
   (snapshots are GC'd after 15 min, `scaffold.ts:81`).
3. `session.start` creates `.ideadump/ideation/<sessionId>/session.json`
   plus `context.json`; reloading after a dev-server restart restores
   transcript and phase exactly.
4. Grilling asks exactly one question per turn with ≤4 suggested answers
   as selectable chips; turns append to `transcript.jsonl` and
   `session.json`.
5. With default settings (solo on all three steps), each step makes one
   model call, writes one candidate without `score`/`rationale`, and
   makes no reconciler call.
6. With N≥2 models on a step: N candidate files exist under
   `candidates/<step>/<provider>/`, `grades.jsonl` gains one record with
   N grades, and the chat shows only the merged output.
7. Every candidate's matter block parses (YAML front matter) and carries
   `step`, `model`, `timestamp`, plus `score`+`rationale` when reconciled
   or `error` when failed.
8. Saving writes `docs/PRD.md` and `docs/PLAN.md` with provenance matter;
   pre-existing files produce a `collisions` result, and only an explicit
   confirm overwrites.
9. A path-traversal attempt (`../`, absolute, symlink escape) against any
   ideation procedure or the SSE route is rejected, nothing written.
10. `models.list` omits models of providers whose env var is unset and
    names the missing vars; setting a var surfaces those models.
11. The catalog caches to the XDG cache dir via tmp+rename, refreshes
    after 24 h, and serves the stale cache with a warning when a fresh
    dump fails zod validation.
12. PRD/plan generation streams visibly into the chat; a mid-stream
    disconnect leaves a resumable session with the step re-runnable and
    no orphaned provider calls.
13. Saving settings through the existing `settings.update` preserves the
    ideation defaults, and a pre-ideation caller still succeeds.
14. No API key value is reachable from the client: absent in tRPC
    outputs, SSE events, and the built bundle.
15. `pnpm run check-types` and `pnpm run build` pass with the feature in.

## 10. Open risks

- **`@tanstack/ai` 0.x churn** — exact-pins in the catalog (`@tanstack/ai`
  0.52.1, `@tanstack/ai-react` 0.22.4, `@tanstack/ai-openai`); every SDK
  touch confined to `runner.ts`. ideadump's `as never` casts across a
  20-minor gap (0.32.0 → 0.52.1) are the cautionary tale (research
  doc §1).
- **models.dev dump shape drift** — passthrough-zod validating only
  consumed fields plus the stale-cache fallback; the provider→env-var
  table is ours, not the dump's.
- **First SSE route in the app** — `serve-prod.mjs` already pumps
  `Response` bodies (`serve-prod.mjs:83-96`, per the download route's
  notes), but a long-lived POST stream through Vite dev middleware is
  unproven; needs a spike.
- **Settings whole-object replace** — the known pitfall in
  `routers/settings.ts:13-31`; acceptance criterion 13 guards it.
- **Sentinel commands on the chat wire (flagged tension)** — control ops
  ride the SSE message stream as `‹generate-prd›`-style sentinels because
  `useChat` owns the transport; the filter is string-matching in two
  places (emit + render). If 0.x offers AG-UI metadata/custom client
  events for this, switch; the tRPC router stays the escape hatch for
  anything that misbehaves.
- **Fan-out vs streaming (flagged tension)** — in fan-out mode nothing
  can stream until the slowest candidate and then the reconciler complete,
  and the reconciler's output is structured (merged + grades), so
  streaming means forwarding one field of a `streamJson` call.
  Mitigations: per-model progress chips; render-on-final fallback if 0.x
  field-delta forwarding proves brittle.
- **Multi-provider posture vs single adapter (flagged tension)** — v1
  reaches providers only through the OpenAI-compatible adapter; those
  without a compatible endpoint are filtered from the picker, so
  "multi-provider" is best-effort beyond z.ai in practice.
- **Static env schema vs dynamic catalog (flagged tension)** — the env
  schema is a fixed, curated list while the catalog is open-ended; a new
  provider needs both. Accepted to keep keys typed and server-only.
- **Ported prompts licensing** — same owner, private repo, copy-adapt; no
  constraint.
- **glm-5.3-flash promo pricing ends 2026-09-09** — the free 4.x-flash
  classmates keep fan-out cheap; solo default cost doubles at worst.

## 11. Appendix

### Suggested CONTEXT.md glossary entry

```md
## Ideation

- **Ideation panel** — the per-Project AI interview on the project page:
  grills the idea one question at a time, then generates a PRD and an
  implementation plan into the Project's `docs/`. Each step can fan out
  over several models; a reconciler merges and grades the candidates.
- **Ideation session** — one grilling→PRD→plan run, persisted under
  `.ideadump/ideation/<sessionId>/` in the Project so it survives
  dev-server restarts.
- **Matter string** — the front-matter block atop every generated
  candidate and artifact: model, step, timestamp, grade, rationale.
- **Candidate backlog** — the per-model outputs plus grades kept on disk
  under the session directory, for traceability and benchmarking.
- **Reconciler** — merges fan-out candidates into the one user-visible
  output and scores each candidate; active only when a step has more than
  one model.
```

### File map

| Status | Path | Purpose |
| --- | --- | --- |
| new | `packages/api/src/lib/ideation/shared.ts` | Client-safe types + zod schemas |
| new | `packages/api/src/lib/ideation/prompts.ts` | Ported grill/PRD/plan prompts |
| new | `packages/api/src/lib/ideation/catalog.ts` | models.dev dump: fetch, zod, XDG cache, TTL |
| new | `packages/api/src/lib/ideation/context.ts` | Project context gatherer |
| new | `packages/api/src/lib/ideation/runner.ts` | TanStack AI model-runner boundary |
| new | `packages/api/src/lib/ideation/fanout.ts` | Fan-out + reconcile engine |
| new | `packages/api/src/lib/ideation/session.ts` | Disk-backed sessions, candidates, artifacts |
| new | `packages/api/src/lib/ideation/sse.ts` | Server-side re-export of the `@tanstack/ai` SSE transport (`chatParamsFromRequest` / `toServerSentEventsResponse` / `EventType`) — keeps SDK imports inside packages/api |
| new | `packages/api/src/routers/ideation.ts` | tRPC control router (incl. the `context.preview` pre-start summary, criterion 1) |
| new | `apps/web/src/routes/api/ideation/chat.ts` | SSE chat route |
| new | `apps/web/src/lib/ideation-wire.ts` | Client-safe wire contract: chat endpoint, sentinel commands, AG-UI CUSTOM event vocabulary |
| new | `apps/web/src/lib/ideation-seed.ts` | Scaffold-seed handoff: sessionStorage key + schema-validated read |
| new | `apps/web/src/components/ideation/` | Panel, model picker, candidates drawer, chat view, model listbox |
| mod | `packages/api/src/routers/index.ts` | Register `ideation` router |
| mod | `packages/api/src/lib/store.ts` | Settings defaults + migration for the ideation block |
| mod | `packages/api/src/routers/settings.ts` | Extend the update schema (or it wipes the block) |
| mod | `packages/env/src/server.ts` | Optional provider key vars |
| mod | `apps/web/src/routes/projects.$.tsx` | Panel section + `validateSearch` (`?ideation=new`) |
| mod | `apps/web/src/routes/index.tsx` | "Start ideation" toast action + seed handoff |
| skipped | `packages/ui` | `questionnaire` shadcn component — suggested-answer chips are plain kiln buttons instead (deviation a) |
| mod | `apps/web` + `pnpm-workspace.yaml` | `streamdown` dep; exact-pin `@tanstack/ai*` |
| mod | `apps/web/serve-prod.mjs` | Client-disconnect propagation: aborts `request.signal` and cancels the response body (deviation d) |

Suggested (appended to CONTEXT.md during implementation): the CONTEXT.md
glossary entry above.

### Implementation deviations (validated)

Where the implementation landed off the PRD's letter, with the reason each
deviation stands:

- **(a) Questionnaire shadcn component skipped** — the ≤4 suggested answers
  render as a chip row of plain kiln `Button`s under the question
  (`ideation-chat-view.tsx`); no `questionnaire` component was added to
  packages/ui.
- **(b) Model picker placement** — the picker lives in the fresh-session
  idea form, its value frozen into `session.json` at start, rather than in
  the panel header; a live session does not re-show its frozen model set.
- **(c) `sse.ts` re-export** — apps/web cannot import `@tanstack/ai` under
  pnpm's isolated node_modules, so the server-side SSE transport slice is
  re-exported from `packages/api/src/lib/ideation/sse.ts`, keeping every
  SDK import inside packages/api (the runner.ts discipline).
- **(d) `serve-prod.mjs` disconnect propagation** — the prod launcher now
  aborts `request.signal` and cancels the response body when the client
  disconnects mid-stream; this is what made the first SSE route work in
  prod (the §10 first-SSE risk).
- **(e) Solo-mode artifact display** — PRD/plan markdown renders as an
  in-flight streamdown overlay in the chat and is not re-rendered after a
  reload; disk (the candidates/ files, then `docs/` on save) is the durable
  home for artifact text.
