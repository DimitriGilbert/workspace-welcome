# Widget System Normalization — Master Plan (rev 2)

**Goal:** dissolve the parallel `apps/web/src/widgets/` tree (103 files, ~22.8k lines) into the
app's conventional React + shadcn layout — `components/`, `lib/`, `components/themes/` — with
**zero functional loss**, and kill the leftover `/app` route namespace and committed strays.

**NOT in scope:** extracting a package / shadcn distribution. That end-goal is noted under
"Future direction" only. This effort reorganizes the app, nothing else.

**Method:** subagent-orchestration (implementer → validator → fixer per phase, ≤3 fix attempts,
NO-SLOP policy, gates after every phase). This document is the dispatch source of truth.
**Status: awaiting owner review — no execution started.**

**Origin of the mess (archaeology summary):** the parallel tree was a deliberate master-plan
decision (§2 ruling 1) — quarantine so parallel theme agents never touch shared files, one grep
prefix for invariants, legacy app kept as rollback. The `/app kill` (b99d346) made `/` the widget
system; the quarantine rationale died; this plan folds the tree back without losing anything it
built.

---

## Hard constraints (violating any = phase fails)

1. **No behavior change** (sole exception: the owner-ordered `/app` route kill in P0.2). Every
   route, theme, scheme, interaction, and setting works identically after every phase. Themes are
   complete designs and move **intact** — no consolidation.
2. **DOM/probe contracts preserved:** `data-ww-theme`, `data-ww-scheme`, `data-theme-scope`,
   `data-widget/x/y/cols/rows/size`, `data-ready`, `data-providers`, `data-part`,
   `data-part-min-w/h`, `data-drag-handle`, `data-resize-handle`, `[data-widget-board]`,
   `[data-console-view]`, `[data-console-filter]`, `data-sort-key/direction`,
   `[data-slot="widget-tabs"]`. Runtime classnames/DOM structure do not change (theme `custom.css`
   skins key on them — e.g. meadow/bento `display:none` the runtime page header).
3. **Glob-discovery convention preserved:** adding a theme stays "add files under
   `components/themes/<slug>/` (preset.ts, tokens.css, custom.css, scheme-*.css, widgets/index.ts),
   edit nothing else".
4. **CSS mechanics preserved:** `tokens.css` = side-effect import in each preset (always bundled);
   `custom.css`/`scheme-*.css` = globbed as URL, `<link>`ed with current precedence attributes;
   `data-ww-scheme` flip switches schemes. Glob evaluation order must not change (cascade).
5. **Storage keys unchanged:** `ww.prefs.v1` (theme prefs), `ww.theme.v1` (next-themes).
6. **Token laws unchanged:** 38 required tokens (`required-tokens.json`), zero color literals in
   the widget namespace, closed grandfather allowlist untouched.
7. **Layer purity unchanged:** themes never import recharts/@tanstack/react-table/tRPC/queries;
   `lib/queries/` stays the only queryOptions site; `packages/ui` stays props-in/tokens-only.
8. **Nothing destroyed except the approved list:** `/app` routes (P0.2, owner order), strays
   *relocated* not deleted (PC.1 — scripts are kept). The four unreachable legacy components are
   **pending owner confirmation** (PC.2) and stay unless approved. All three themes, all 49 widget
   kinds, `/designs/*` (owner-restored), `/projects/$`, the lab, parts-preview, and settings
   survive.
9. **AGENTS.md working agreements** throughout: pnpm, `import type`, import ordering, no `any`,
   no placeholders, `routeTree.gen.ts` never hand-edited (regenerates via the router plugin on
   next dev/build), no dev servers started by agents.

## Target layout (final state of this effort)

```
apps/web/src/
  components/
    themes/                     # THE themes — complete designs, intact
      index.ts                  # theme preset registry (relative globs unchanged)
      shared/                   # reserved for genuinely cross-theme helpers (empty for now;
        ...                     #   per-theme atoms are theme-private and stay in-theme)
      bento/                    # preset.ts, tokens.css, scheme-*.css, custom.css, bits.tsx,
        ...                     #   dialogs.tsx, data-carousel.tsx, metrics.ts, surface-tabs.ts
        widgets/                # + widgets/* (12 files, intact)
      meadow/                   # same shape (4 + 12 files, intact)
      mission-control/          # same shape (4 + 17 files, intact)
    parts/                      # parts barrel stays the ONLY import surface for themes
      index.ts  registry.ts     # definePart wrappers + barrel
      attention-list.tsx  report-gate.tsx  led-project.tsx  note-editor.tsx  project-pulse.tsx
      form/   git/   list/      # unchanged structure
    widgets/                    # widget-system engine components + app glue
      registry.ts               # widget-kind registry (core kinds + themes glob)
      project-tile.tsx          # the theme-independent core kind
      grid-canvas.tsx  widget-shell.tsx  render-layout.tsx  theme-picker.tsx
      use-grid-drag.ts  use-console-keys.ts
    settings/                   # commands, exclude-globs, general, ideation, snitch + barrel
    lab/                        # lab-page, lab-preset, self-test, lab-tokens.css
  lib/
    widget/                     # pure-TS engine modules (no React)
      layout-types.ts  size-class.ts  part.ts  flows.ts  grid-session.ts  validate-layout.ts
    contexts/                   # data substrates + prefs
      workspace-context.tsx  project-context.tsx  report-context.tsx
      settings-context.tsx  theme-prefs.tsx
  routes/
    -theme-shell.tsx            # relocated here from routes/app/ (leading dash = not a route)
    ...                         # unchanged files; only imports updated; routes/app/ GONE
```

Import-needle map (old → new), used by code, harness, and docs:

| Old | New |
|---|---|
| `@/widgets/themes` | `@/components/themes` |
| `@/widgets/parts` | `@/components/parts` |
| `@/widgets/runtime/widget-shell` (components/hooks) | `@/components/widgets/widget-shell` |
| `@/widgets/runtime/{layout-types,size-class,part,flows,grid-session,validate-layout}` | `@/lib/widget/...` |
| `@/widgets/contexts/*` | `@/lib/contexts/*` |
| `@/widgets/settings` | `@/components/settings` |
| `@/widgets/lab/lab-page` | `@/components/lab/lab-page` |
| `@/widgets/theme-prefs` | `@/lib/contexts/theme-prefs` |
| `@/widgets/registry` | `@/components/widgets/registry` |
| `routes/app/-theme-shell` (relative imports) | `routes/-theme-shell` |

---

## Stage 0 — baseline, the /app kill, and trustworthy gates

### P0.1 Pre-flight & baseline  *(no code changes)*
- **Owner-approved:** commit the 59 uncommitted WIP files as one `wip:` baseline commit so every
  phase diffs cleanly and rollback is trivial.
- Run the full verification matrix (below) on the untouched tree; save results +
  per-theme/per-page screenshots to `.plans/widget-normalization/baseline/` as the golden record.
- Confirm dev server on 37420 (owner-managed; agents never start one).

### P0.2 KILL the `/app` namespace  *(owner order: "no more app/ shit — MUST BE KILLED")*
- Delete `routes/app/index.tsx`, `routes/app/$theme/index.tsx`, `routes/app/$theme/project.$.tsx`
  (currently 307 redirects to `/?preset=` — dead since the `/` cutover).
- Relocate `routes/app/-theme-shell.tsx` → `routes/-theme-shell.tsx` (leading dash keeps it out
  of the route tree); update its 2 importers (`routes/index.tsx`, `routes/project.$.tsx`).
- `routeTree.gen.ts` regenerates via the TanStack plugin on next build/dev — never hand-edited;
  verify the built route tree contains no `/app` routes.
- `/app`, `/app/<slug>` now 404 (global not-found) — that is the intended new contract.
- **Validation:** typecheck + build + theme matrix still green (the live routes never depended on
  `/app`); grep confirms zero `routes/app` references outside `.plans/` and git history.

### P0.3 Harness hardening  *(make the gates honest)*
Files: `scripts/widget-check/grep-invariants.mjs`, `scripts/widget-check/legacy-sentinel.mjs`,
`scripts/widget-check/interactions/navigation.mjs`, root + `apps/web` `package.json`.
1. Wire harness into package.json scripts: `widget-check:grep`, `widget-check:theme`,
   `widget-check:lab`, `widget-check:parts`, `widget-check:self-test`,
   `widget-check:interactions`, `widget-check:sentinel`, `widget-check:validate-layout`
   (thin `node scripts/...` wrappers).
2. **Anti-vacuous guard** in grep-invariants: a `LAYOUT_PATHS` config mapping the *current* tree
   (updated in lockstep by every Stage A phase), plus hard FAIL when expected file classes are
   missing (must find exactly 3 `preset.ts`, 3 `tokens.css`, 3 `custom.css`, 3 scheme css files,
   ≥40 theme widget files, registry + themes index present). No more WARN-and-exit-0 when a
   directory vanishes. Drop `routes/app` from invariant-7's no-any scope (dir no longer exists).
3. **legacy-sentinel rewrite:** replace the stale legacy-`/` assertion with the current contract —
   `/` renders a hydrated widget board for the default preset; `/app/*` is gone (not-found);
   `dialog-portals-out` check unchanged.
4. **navigation.mjs update:** drop the `/app` redirect cargo checks; assert `/` with `?preset=`
   works directly and same-theme project navigation keeps the scope mounted. Keep the hardcoded
   theme list in sync with the registry (fail if they diverge).
- **Validation:** matrix green post-P0.2 tree (proves hardening matches reality).

### P0.4 Snapshot tooling  *(small)*
- New `scripts/widget-check/snapshot.mjs`: reuses `lib/cdp.mjs` (adds capture behind a flag — the
  "no screenshots" constraint was for no-vision agents, not owner evidence), captures `/` +
  `/project/<root>` per theme × declared scheme to `.plans/widget-normalization/snapshots/<phase>/`.
  Adds `widget-check:snapshot` script.
- **Validation:** baseline snapshots captured for all 3 themes.

## Stage A — normalize into the app (6 phases, strictly sequential)

Every phase = `git mv` per the mapping + rewrite imports per the needle map + update
`LAYOUT_PATHS`/specifiers in lockstep + run the full gate matrix. **Move-only:** no refactors, no
renames of symbols, no "improvements" — findings go to the phase report, never into the diff.

### PA.1 `themes/**` → `components/themes/**`  *(~50 files, one unit)*
- Move `widgets/themes/{index.ts,bento/,meadow/,mission-control/}` → `components/themes/`.
  Create empty `components/themes/shared/` (reserved; nothing moves into it now).
- `components/themes/index.ts`: its relative globs (`./*/preset.ts`, `./**/custom.css`,
  `./**/scheme-*.css`) are location-relative — they keep working unchanged. Verify no absolute
  assumptions.
- `widgets/registry.ts` glob: `./themes/*/widgets/index.ts` → `../themes/*/widgets/index.ts`.
- Update `routes/index.tsx`, `routes/project.$.tsx`, `routes/-theme-shell.tsx` imports + harness:
  grep-invariants theme scoping (`components/themes`), theme-widget regex
  (`components[\\/]themes[\\/][^\\/]+[\\/]widgets[\\/]`), invariant-1 scope, `validate-layout.mjs`
  specifier `/src/widgets/themes/index.ts` → `/src/components/themes/index.ts`.
- **Validation:** full matrix × 3 themes × 2 pages + screenshots (theme skins are the risk).

### PA.2 runtime split → `lib/widget/` + `components/widgets/`  *(14 files)*
Per-file map:
- → `lib/widget/`: `layout-types.ts`, `size-class.ts`, `part.ts`, `flows.ts`, `grid-session.ts`,
  `validate-layout.ts`
- → `components/widgets/`: `grid-canvas.tsx`, `widget-shell.tsx`, `render-layout.tsx`,
  `theme-picker.tsx`, `use-grid-drag.ts`, `use-console-keys.ts`, plus (from `widgets/` root)
  `registry.ts` and (from `widgets/core/`) `project-tile.tsx` — `core/` dissolves.
- Rewrite ~28 deep `@/widgets/runtime/*` imports across themes + parts + lab + routes per needle
  map. `use-grid-drag`/`grid-session` cross-imports follow the new paths.
- Harness: invariant-5 needles (`@/components/widgets`, `@/lib/widget`), `validate-layout.mjs`
  specifiers for registry/flows/validate-layout, no-any scope += `lib/widget`.
- **Validation:** full matrix (drag-resize interaction is the risk — run it explicitly).

### PA.3 contexts + prefs → `lib/contexts/`  *(5 files)*
- Move `widgets/contexts/{workspace,project,report,settings}-context.tsx` +
  `widgets/theme-prefs.tsx` → `lib/contexts/`. Update routes (`__root`, `settings`, `index`,
  `project.$`, `parts-preview`, `[__lab]`) + internal consumers (parts, themes, engine).
- Harness: invariant-5 contexts needle, no-any scope += `lib/contexts`.
- **Validation:** full matrix + `/settings` manual check (automated only in PC.3).

### PA.4 parts → `components/parts/`  *(structure preserved)*
- Move `widgets/parts/**` → `components/parts/` (7 root files + `form/` + `git/` + `list/`).
  The barrel `index.ts` stays the only import surface for themes (invariant 5). Rewrite theme
  deep-imports (`parts/form/*` in meadow-header, mc actions/command-bar) and
  `routes/parts-preview.tsx` (10 imports).
- Harness: invariant-5 `@/widgets/parts` needle → `@/components/parts`; part-id collision scope.
- **Validation:** full matrix + parts-preview suite.

### PA.5 settings + lab → `components/settings/`, `components/lab/`  *(10 files)*
- Move `widgets/settings/**` → `components/settings/`; `widgets/lab/**` → `components/lab/`
  (incl. `lab-tokens.css` side-effect import — path-relative, survives).
- Update `routes/settings.tsx`, `routes/[__lab].tsx`.
- **Validation:** full matrix + lab + self-test suites + `/settings` manual check.

### PA.6 Decommission `widgets/`  *(audit phase — Stage A acceptance gate)*
- Remove the now-empty `apps/web/src/widgets/`. Repo-wide grep: zero references to `src/widgets`
  or `@/widgets` outside `.plans/**` and git history. Update stale docs
  (`docs/research/parts-reference.md`, `docs/research/widget-part-catalog.md` path references).
- **Validation:** full matrix + screenshot diff vs baseline for all themes × schemes + typecheck +
  build.

## Stage C — cleanup & hardening (4 phases)

### PC.1 Consistency pass  *(approved; small, behavior-identical)*
- `components/themes/bento/metrics.ts`: import from `@/lib/grid-layout` directly instead of the
  `lib/mosaic-layout` legacy shim. **The shim is kept** (still used by `/designs/**`, and it is a
  future plan artifact) — only bento's dependency changes. Precondition: prove the shim re-exports
  the identical functions; if not identical, skip and report.
- **Strays — relocate, never delete (owner: "keep the script in case they are needed, but the mess
  is appalling"):** create `.plans/attic/`; move `TEST-ALIGNMENT-PLAN.md` (committed future-plan
  that shouldn't have been), `Screenshot_20260906_172900.jpeg`, and
  `apps/web/compact-chain.tmp.mjs` (script kept for reference) into it. Repo working surface is
  clean; nothing is lost.
- Refresh stale docs: `widget-part-catalog.md` banner (designs were restored by owner order),
  path references in `parts-reference.md`.
- **Validation:** full matrix + build + grep for dangling references to moved strays.

### PC.2 Dead-code decision  *(PENDING owner confirmation — not approved yet)*
- Candidates: `components/{summary-cards,needs-attention,pinned-section,project-card}.tsx` —
  believed unreachable from any route since the `/` takeover. At execution: fresh import-graph
  scan; report the proof; **delete only what the owner has confirmed by then**, keep the rest.
- **Validation:** build + matrix + grep for dangling imports.

### PC.3 Settings-page coverage  *(small tooling add)*
- Minimal settings check in the harness (CDP: `/settings` hydrates, each settings section
  present, no console errors) — closes the known coverage gap.
- **Validation:** new check green.

### P0.2b Bento golden-zero fixes  *(owner order: "ALL tests must pass — no pre-existing failure holds")*
- Fix 1 — bento project page `no-inner-scroll`: the `project-surface` widget renders
  `div.shrink-0.overflow-y-auto` scrolling 96px vertically; probe contract says nothing inside a
  scope scrolls (unless `data-scroll="widget"` + allowlisted — allowlist is empty by design, so
  the FIX is in the widget, not the allowlist).
- Fix 2 — bento drag-resize shrink: `vitals-stacks` never shrinks below 2x2 while mission-control
  and meadow clamp to their registry floors — bento's size floors/preset sizing are wrong, not
  the harness.
- After both fix + validate: **re-run the full matrix and re-record the baseline** — the golden
  record becomes ALL GREEN (sentinel green too via P0.2's rewrite). No phase after this may
  advance on any red.

## Vision-gate protocol (binding for all visual verification)

1. No agent on this devbox can see pixels (Read returns CDN URLs). Visual verdicts come from:
   ImageMagick forensics + DOM probes; semantic claims only with quoted tool output.
2. Known capture artifacts (dev-only, lazy-mount races, excluded from comparisons with blanked
   zones on BOTH sides): TanStack Router Devtools badge — bbox (0,755)–(165,800); React Query
   Devtools flame badge — bbox (1200,735)–(1275,800) (proven nondeterministic 3-of-6 vs 4-of-6
   across 12 captures, PA.2 validation). Fixed-position viewport chrome; no app content renders
   in either zone.
3. A/B captures: fresh browser per capture, explicit tab selection when a specific panel is
   under test, probe controls on both sides of any code flip.
4. DEFECTIVE BASELINE SAMPLE — do not compare against
   `baseline/snapshots-pa1/mission-control-project-console.png` (captured mid-sync; proven by
   all-pairs matrix in the PA.2 re-adjudication). Project-page comparisons use the latest
   post-commit clean-tree set with a same-state control (~20s apart, same code) as the empirical
   liveness bound; the app renders live git/scan state, so fixed numeric caps alone under- and
   over-shoot.

### PC.4 Final acceptance
- Full matrix + screenshot diffs vs baseline for every theme × scheme × page, typecheck, build,
  grep-invariants, validate-layout, interactions, settings check.
- Final report: files moved / deleted / relocated, line deltas per directory, gate results,
  residual risks.

---

## Future direction (NOT this effort — recorded so Stage A doesn't preclude it)

The owner's stated end-goal is distributing the generic engine as shadcn components + libs. The
Stage A layout keeps that door open (`lib/widget/` + `components/widgets/` engine files are the
extraction surface; the two type-only module cycles — themes/index ↔ render-layout,
registry ↔ project-tile — are documented and would need breaking at any future package boundary,
as would a Tailwind `@source` entry for a new package). No package is created in this effort.

## Verification matrix (every phase; per-theme where marked)

1. `pnpm run check-types`
2. `pnpm build`
3. `node scripts/widget-check/grep-invariants.mjs` (post-P0.3: via package script)
4. `node apps/web/scripts/validate-layout.mjs`
5. `node scripts/widget-check/run.mjs --theme {mission-control,bento,meadow} --page {dashboard,project}`
6. `node scripts/widget-check/run.mjs --suite {lab,parts-preview,self-test}`
7. `node scripts/widget-check/interactions/run.mjs --theme {mission-control,bento,meadow}`
8. `node scripts/widget-check/legacy-sentinel.mjs` (post-P0.3 rewritten contract)
9. `pnpm run widget-check:snapshot` + eyeball/diff vs baseline (theme-affecting phases)
10. `/settings` manual check (until PC.3 automates it)

Matrix items 5–9 need the dev server on 127.0.0.1:37420 (owner-managed; execution agents never
start one — if unreachable, live suites defer to the next stage boundary and the phase reports it).

## Decisions recorded (2026-09-07)

1. **Execution: NOT started** — owner reviews this plan first.
2. **WIP commit (P0.1): approved** — one `wip:` baseline commit before any move.
3. **Cleanups approved:** bento off the mosaic shim (shim kept); strays relocated to
   `.plans/attic/` (scripts kept, nothing deleted); `/app` namespace killed outright (P0.2).
4. **Package extraction: explicitly refused for now** — removed from scope, future note only.
5. **Four unreachable legacy components: pending** — decided at review/execution (PC.2).
6. **(2026-09-07, execution) Zero-failure policy:** the owner overruled "pre-existing failures
   frozen as golden" — ALL tests must pass at every gate. The two bento failures are fixed in
   P0.2b and the baseline is re-recorded all-green before any Stage A phase runs.

## Execution protocol

- Per phase: 1 implementer (gets this plan's phase section verbatim + needle/map tables + NO-SLOP
  policy, runs gates before reporting) → 1 validator (reads every moved/edited file against the
  mapping, re-runs matrix, enforces NO-SLOP) → fixer on failure (all errors at once) → re-validate,
  ≤3 attempts, then halt-and-report.
- Move-only discipline in Stage A: findings go to the phase report, never into the diff.
- Multi-file phases (PA.1, PA.2) get validators that read ALL moved files + ALL edited files
  (routes + harness) — integration is where moves break.
- No commits during execution beyond the approved P0.1 baseline; each phase ends with a clean gate
  report so the owner can commit per phase if desired.
