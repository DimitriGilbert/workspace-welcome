# Plan: AGENTS.md generation integrated in the project-creation flow

Date: 2026-08-31
Status: approved (user request — see conversation)
Orchestration: subagent-orchestration skill (implementer → validator → fix loop, max 3 attempts)

## Goal

better-t-stack scaffolds do not ship an AGENTS.md. The user's rules are consistent across
projects. We want:

1. A synthesis document of the directives the user enforces everywhere (mined from existing
   AGENTS.md / CLAUDE.md files across `~/workspace/*`).
2. A programmatic generator in this repo that produces a bare, minimal AGENTS.md from a bts
   config + the common directives, following the `agents-md` skill principles.
3. The generator wired into the scaffold job so every project created through this app gets
   an AGENTS.md automatically.
4. Backfill: one agent per existing bts-made project lacking AGENTS.md (only that case),
   tailoring the generator boilerplate with the project's PRD/docs/code.

## Inputs

- Repo: `/home/didi/workspace/workspace-welcome` (bts monorepo: `apps/web` TanStack Start,
  `packages/api` tRPC, `packages/ui`). No DB; no tests; gatekeeping = `pnpm check-types` +
  `pnpm build` at repo root.
- New-project flow: `apps/web/src/components/create-project-sheet.tsx` → tRPC
  `scaffold.start` (`packages/api/src/routers/scaffold.ts`) →
  `packages/api/src/lib/scaffold.ts` `runJob` calls `create()` from `create-better-t-stack`
  in-process; bts writes `bts.jsonc` into the scaffolded project.
- Config options + compatibility rules: `packages/api/src/lib/scaffold-options.ts`.
- agents-md skill: `/home/didi/.agents/skills/agents-md/SKILL.md` (+ its references/).
- Project roots: registered roots in the store; currently `/home/didi/workspace`.

## Phase 1 — Common directives document

**Implementer** reads every `AGENTS.md` at the root of each immediate subdirectory of
`/home/didi/workspace` (where a project has no AGENTS.md but has a CLAUDE.md, read the
CLAUDE.md as supplementary evidence, flagged as such). Produces:

- `docs/research/common-agent-directives.md` containing:
  - Recurring directives grouped by theme (e.g. package-manager discipline, commands,
    repo/workdir boundaries, monorepo shape, bts.jsonc as stack reference, dev-server
    guards, type-safety/quality bar, progressive disclosure).
  - Per directive: distilled imperative wording, prevalence (which projects), variations.
  - Contradictions flagged with a resolution (pick dominant/safest, note the alternative).
  - A final "generator-ready distillation": the minimal rule set that belongs in EVERY
    generated AGENTS.md (root-level only, per agents-md minimalism).

**Validator** verifies: every root AGENTS.md/CLAUDE.md in ~/workspace/* was actually read;
each directive in the distillation traces back to ≥2 project files; no invented rules;
contradictions surfaced; doc lives in docs/research/ and is well-structured.

## Phase 2 — Generator (depends on Phase 1)

**Implementer** builds a generator in `packages/api/src/lib/agents-md/`:

- Pure exported function (e.g. `generateAgentsMd(config, options)` → string). Input config
  covers the bts options captured by `packages/api/src/lib/scaffold-options.ts` (frontend,
  backend, runtime, api, auth, payments, database, orm, dbSetup, packageManager, git,
  install, webDeploy, serverDeploy, addons, examples, native, projectName) — prefer reusing
  types from `create-better-t-stack` / `scaffold-options.ts` over redefining.
- Output follows the agents-md skill: one-sentence project description, package-manager
  discipline, monorepo navigation/commands derived from config (frontend/backend/db/orm/
  addons drive which sections and warnings appear — e.g. turborepo → turbo commands,
  biome → format/lint commands, backend "self" vs split changes the package layout
  description), common directives from Phase 1 distilled, dev-server guard. Minimal root
  file (target ≤ ~60 lines), capabilities not file paths, conversational tone, no
  placeholder content for options that are "none".
- Also usable standalone: a CLI entry (script in `packages/api/package.json`) that reads a
  path to a `bts.jsonc` and prints/writes the AGENTS.md — this is how Phase 4 backfill
  agents consume it. Choose the least-intrusive runner available in the repo.
- Distilled directives live in the generator as structured data (the Phase 1 doc remains
  the human-readable source).

**Validator** reads every new file line-by-line: verifies config→section mapping for all
option values (including "none"/dependent combos), NO-SLOP policy, skill compliance
(minimality, no path soup), that generated output for the repo's own `bts.jsonc` is
accurate against its actual package.json scripts, and runs `pnpm check-types` + `pnpm build`.

## Phase 3 — Integration into scaffold job (depends on Phase 2)

**Implementer** wires generation into `runJob` (`packages/api/src/lib/scaffold.ts`):

- After a successful `create()` (and install phase, when it runs), call the generator with
  the job's config and write `<target>/AGENTS.md`. Never overwrite an existing AGENTS.md.
- Add it as a job step visible to the polling `scaffold.job` query (fit the existing
  job/phase shape; follow conventions in `docs/plans/better-t-stack-integration.md`).
- Generation failure is non-fatal: record a warning on the job; the scaffold result stands.
- Do not change the wizard UI beyond what the existing job display needs (none expected).

**Validator** = integration validator: reads Phase 2 + Phase 3 code together, checks error
paths (create fails → no AGENTS.md write; write fails → job warns, not crashes; concurrent
jobs unaffected), NO-SLOP, `pnpm check-types` + `pnpm build`.

## Phase 4 — Backfill (depends on Phase 2; parallel, one agent per project)

Targets (bts-made, no AGENTS.md — only these two):
1. `/home/didi/workspace/fck-chat-control`
2. `/home/didi/workspace/workspace-welcome`

**Per-project implementer**: read the project's `bts.jsonc`, README/PRD/docs, and key code;
run the Phase 2 CLI against its `bts.jsonc` to get the boilerplate; then tailor it into a
final root `AGENTS.md` per the agents-md skill — verify every command against the project's
actual package.json scripts, describe real packages (monorepo table), add project-specific
capabilities/progressive-disclosure pointers, keep it minimal (≤ ~60 lines). Write ONLY that
project's AGENTS.md; touch nothing else.

**Validator per project**: file exists; commands match actual scripts; stack description
matches `bts.jsonc`; follows skill checklist (minimal, no stale-path soup, no
contradictions); no other files modified in the project.

## Rules applied to every dispatch

NO-SLOP policy (verbatim in each implementer/fixer dispatch): no `any`/`as any`, no
placeholder TODO/FIXME, no unused imports/variables, `import type` for type-only imports,
external imports first then local, no dev servers, gatekeeping commands before reporting
done. Validators must read the code, not only run commands. Max 3 fix attempts per phase.

## Out of scope

- No commits (user reviews the working tree).
- No changes to other projects beyond the two backfill targets.
- No CLAUDE.md symlinks, no UI toggle for the AGENTS.md step.
