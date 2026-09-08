# ALL-GREEN baseline matrix — widget-normalization

Recorded: 2026-09-08T02:19+02:00 (local). Recorder: baseline recorder subagent.
Tree state: all widget-normalization fixes in (bento golden-zero + `/app` kill). Nothing modified by the recorder except this file and `snapshots-allgreen/`.
Dev origin: `http://[::1]:37422` (IPv6 literal) — verified reachable (HTTP 200) before the first run. Servers were NOT started/restarted; no `pnpm dev` was run.
All commands run SERIALLY from the repo root. Exit codes captured via zsh `pipestatus[1]` (status of the command itself, not `tail`).

**This record is the bar every Stage A phase must meet: 17/17 command invocations exit 0, 0 suite failures, 7 soft warns (all "not mounted yet" skips in the interactions suite — pre-existing, reproducible, non-gating).**

Note: `pnpm build` desyncs the prod service on 37420 — expected and irrelevant here; gates target the dev origin on 37422.

---

## 1. `pnpm run check-types`

- **Exit: 0**
- Tail:

```
> workspace-welcome@ check-types /home/didi/workspace/workspace-welcome
> pnpm -r check-types

Scope: 6 of 7 workspace projects
packages/ui check-types$ tsc --noEmit
packages/ui check-types: Done
apps/docs check-types$ tsc --noEmit
packages/api check-types$ tsc --noEmit -p tsconfig.check.json
apps/docs check-types: Done
packages/api check-types: Done
apps/web check-types$ tsc --noEmit
apps/web check-types: Done
```

All 4 checking workspaces (ui, docs, api, web) clean.

## 2. `pnpm build`

- **Exit: 0**
- Full monorepo build completed (600s allowance; finished comfortably within it). Tail:

```
apps/web build: dist/server/assets/badge-CiQg18de.js                         110.93 kB │ gzip:  22.31 kB
apps/web build: dist/server/server.js                                        172.27 kB │ gzip:  43.02 kB
apps/web build: dist/server/assets/forms-BiqxZ3Ig.js                         408.18 kB │ gzip:  88.74 kB
apps/web build: dist/server/assets/render-layout-DKFDmysx.js                472.32 kB │ gzip: 108.48 kB
apps/web build: dist/server/assets/trpc-BKBszewk.js                          597.22 kB │ gzip: 133.30 kB
apps/web build: dist/server/assets/router-Bv97hmbI.js                      2,449.45 kB │ gzip: 419.93 kB
apps/web build: ✓ built in 2.04s
apps/web build: Done
```

No warnings about failed steps; client + server bundles emitted.

## 3. `node scripts/widget-check/grep-invariants.mjs`

- **Exit: 0**
- Full output (7 pass / 0 fail / 0 warn):

```
PASS themes-deps 49 theme file(s) free of chart/table/query imports
PASS color-literals zero literals in widgets/**; packages/ui grandfather list intact (baseline 2026-09-05T19:03:41.496Z, 4 file(s))
PASS theme-css 9 theme stylesheet(s): literals only on custom-property declarations
PASS severity-vocab 196 file(s): canonical severity only, no "no-root"
PASS theme-widgets 37 theme widget file(s) compose parts/runtime/contexts; no part-id collisions (14 registry part(s) known)
PASS validate-layout apps/web/scripts/validate-layout.mjs ran clean
PASS no-any 220 system-namespace file(s) free of any
grep-invariants: OK — 7 pass, 0 fail, 0 warn
```

## 4. `node apps/web/scripts/validate-layout.mjs`

- **Exit: 0**
- Full output (8 pass / 0 fail / 0 warn):

```
PASS validate-layout bento:dashboard resolves against the registry
PASS validate-layout bento:project resolves against the registry
PASS validate-layout meadow:dashboard resolves against the registry
PASS validate-layout meadow:project resolves against the registry
PASS validate-layout mission-control:dashboard resolves against the registry
PASS validate-layout mission-control:project resolves against the registry
PASS validate-layout lab:ladder resolves against the registry
PASS validate-layout 7 page(s) clean · 49 registered widget kind(s)
validate-layout: OK — 8 pass, 0 fail, 0 warn
```

## 5. Theme suites × pages (6 runs)

All with `--base-url http://[::1]:37422`. Each run: 6 probes (no-inner-scroll, density, token-completeness, portal-scope, placement, part-min).

### 5a. `--theme mission-control --page dashboard` — **Exit: 0** (6 pass / 0 fail / 0 warn)

```
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 10 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (47 declared on the scope)
PASS portal-scope 20 portal surface(s) inherit the scope's --background
PASS placement 10 widget(s) across 1 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [mission-control] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

### 5b. `--theme mission-control --page project` — **Exit: 0** (6 pass / 0 fail / 0 warn)

```
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 9 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (47 declared on the scope)
PASS portal-scope 21 portal surface(s) inherit the scope's --background
PASS placement 9 widget(s) across 3 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [mission-control] 1 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

### 5c. `--theme bento --page dashboard` — **Exit: 0** (6 pass / 0 fail / 0 warn)

```
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 7 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (74 declared on the scope)
PASS portal-scope 7 portal surface(s) inherit the scope's --background
PASS placement 7 widget(s) across 1 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [bento] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

Bento golden-zero fix confirmed: 0 fail, 0 warn (previously failed on golden-zero warnings).

### 5d. `--theme bento --page project` — **Exit: 0** (6 pass / 0 fail / 0 warn)

```
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 7 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (74 declared on the scope)
PASS portal-scope 9 portal surface(s) inherit the scope's --background
PASS placement 7 widget(s) across 4 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [bento] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

### 5e. `--theme meadow --page dashboard` — **Exit: 0** (6 pass / 0 fail / 0 warn)

```
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 8 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (40 declared on the scope)
PASS portal-scope 16 portal surface(s) inherit the scope's --background
PASS placement 8 widget(s) across 3 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [meadow] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

### 5f. `--theme meadow --page project` — **Exit: 0** (6 pass / 0 fail / 0 warn)

```
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 4 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (40 declared on the scope)
PASS portal-scope 8 portal surface(s) inherit the scope's --background
PASS placement 4 widget(s) across 1 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [meadow] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

## 6. `node scripts/widget-check/run.mjs --suite lab --base-url http://[::1]:37422`

- **Exit: 0** (6 pass / 0 fail / 0 warn)
- Tail:

```
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 149 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (19 declared on the scope)
PASS portal-scope 24 portal surface(s) inherit the scope's --background
PASS placement 181 widget(s) across 2 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [__lab] 3 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
lab: OK — 6 pass, 0 fail, 0 warn
```

## 7. `node scripts/widget-check/run.mjs --suite parts-preview --base-url http://[::1]:37422`

- **Exit: 0** (4 pass / 0 fail / 0 warn)
- Tail:

```
PASS part-min [bento] 126 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
PASS part-min [meadow] 126 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
PASS part-min [mission-control] 126 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
PASS part-min 3 scope(s) clean (378 floored part boxes total; viewport 1440x900)
parts-preview: OK — 4 pass, 0 fail, 0 warn
```

## 8. `node scripts/widget-check/run.mjs --suite self-test --base-url http://[::1]:37422` (inverted)

- **Exit: 0** (6 pass / 0 fail / 0 warn on the inverted meta-suite)
- The `FAIL` lines below are the suite's own deliberately-broken fixtures; each must be reported as detected. The verdict line + exit code are the gate: harness self-detection works.

```
FAIL no-inner-scroll div.border scrolls vertically 322px
FAIL density widget misplaced-x is under-dense: fill 0 < 0.7 (content box has no visible children)
FAIL density widget sparse-widget is under-dense: fill 0.02 < 0.7 (union 40x20px in content box 205x204px)
FAIL token-completeness 18/38 manifest tokens missing on [data-ww-theme="__check"] — not theme-declared: --sev-critical --sev-warning --sev-info --state-positive --recency-fresh --recency-stale --pinned-accent --eyebrow --chrome-radius --chrome-hairline; declared but empty: --font-sans
FAIL portal-scope div role=dialog "self-test dialog — must portal outside t" renders OUTSIDE [data-theme-scope] with --background "oklch(0.70 0.155 50)" ≠ scope's "oklch(0.165 0.015 60)"
FAIL placement widget misplaced-x: data-x=5 but computed position is 2 (cell 205x96px, gap 12/12px)
FAIL placement top-level widgets overlap: overlap-a × overlap-b (40512px²)
FAIL part-min [__check] part self-test-under-min renders 120px wide < data-part-min-w 480px
FAIL part-min [__check] part self-test-under-min renders 60px tall < data-part-min-h 240px
FAIL part-min [__check] horizontal overflow: content is 1260px wider than the scope
FAIL part-min [__check] 5/38 required tokens resolve EMPTY: --font-sans --chrome-radius --chrome-hairline --chrome-panel-bg --chart-6
PASS self-test probe no-inner-scroll correctly reported failures (detection proven)
PASS self-test probe density correctly reported failures (detection proven)
PASS self-test probe token-completeness correctly reported failures (detection proven)
PASS self-test probe portal-scope correctly reported failures (detection proven)
PASS self-test probe placement correctly reported failures (detection proven)
PASS self-test probe part-min correctly reported failures (detection proven)
self-test: OK — 6 pass, 0 fail, 0 warn
```

## 9. Interactions × 3 themes

All with `--base-url http://[::1]:37422`. Warns are soft ("not mounted yet" skips) — non-gating, exit 0 each.

### 9a. `interactions/run.mjs --theme mission-control` — **Exit: 0** (14 pass / 0 fail / 1 warn)

```
WARN interaction:sort no button[data-sort-key] on /?preset=mission-control — sortable affordances not mounted yet
PASS interaction:tabs 4 tab(s) in a 4-tab tablist: focus + Enter selects, aria-selected/data-active agree
PASS interaction:navigation theme list mirrors the preset registry on disk ([bento, meadow, mission-control])
PASS interaction:navigation /?preset=mission-control directly renders the "mission-control" scope hydrated ([data-ready] stamped)
PASS interaction:navigation same-theme navigation to /project/home/didi/workspace/context-builder?preset=mission-control kept the theme scope mounted
PASS interaction:console-keys "/" focuses the console filter
PASS interaction:console-keys Escape clears and blurs the filter
PASS interaction:console-keys digit key switched the view overview → pinned
PASS interaction:console-keys Escape restored the default view (overview)
PASS interaction:drag-resize ArrowRight refused live and announced: "Fleet vitals can't move right — Activity occupies that spot"
PASS interaction:drag-resize ArrowDown refused live and announced: "Fleet vitals can't move down — Triage occupies that spot"
PASS interaction:drag-resize SE grow refused live and announced: "Fleet vitals can't resize east — Activity occupies that spot"
PASS interaction:drag-resize resize clamped at the registry floor 1x1 after 3 shrink step(s)
PASS interaction:drag-resize Escape restored masthead to its session start 0,0 4x1
interactions: OK — 14 pass, 0 fail, 1 warn
```

### 9b. `interactions/run.mjs --theme bento` — **Exit: 0** (11 pass / 0 fail / 3 warn)

```
PASS interaction:filter "/" focuses, typing narrows, Escape clears and blurs
WARN interaction:sort no button[data-sort-key] on /?preset=bento — sortable affordances not mounted yet
WARN interaction:tabs no [data-slot="widget-tabs"] [role="tab"] on /?preset=bento — no tabbed widget is mounted yet
PASS interaction:navigation theme list mirrors the preset registry on disk ([bento, meadow, mission-control])
PASS interaction:navigation /?preset=bento directly renders the "bento" scope hydrated ([data-ready] stamped)
WARN interaction:navigation no a[href*="/project/"] on /?preset=bento — project links not mounted yet (renderer pending)
PASS interaction:console-keys "/" focuses the console filter
PASS interaction:console-keys Escape clears and blurs the filter
PASS interaction:console-keys digit keys are a no-op on a theme without declared consoleViews — board intact (7 widgets, no view stamp)
PASS interaction:drag-resize ArrowRight at the right edge clamps to a no-op (chrome stays at x=0)
PASS interaction:drag-resize ArrowDown moved chrome to y=1
PASS interaction:drag-resize resize is at the grid's right edge (chrome stays 12x2)
PASS interaction:drag-resize resize clamped at the registry floor 2x2 after 10 shrink step(s)
PASS interaction:drag-resize Escape restored chrome to its session start 0,0 12x1
interactions: OK — 11 pass, 0 fail, 3 warn
```

### 9c. `interactions/run.mjs --theme meadow` — **Exit: 0** (11 pass / 0 fail / 3 warn)

```
PASS interaction:filter "/" focuses, typing narrows, Escape clears and blurs
WARN interaction:sort no button[data-sort-key] on /?preset=meadow — sortable affordances not mounted yet
WARN interaction:tabs no [data-slot="widget-tabs"] [role="tab"] on /?preset=meadow — no tabbed widget is mounted yet
PASS interaction:navigation theme list mirrors the preset registry on disk ([bento, meadow, mission-control])
PASS interaction:navigation /?preset=meadow directly renders the "meadow" scope hydrated ([data-ready] stamped)
WARN interaction:navigation no a[href*="/project/"] on /?preset=meadow — project links not mounted yet (renderer pending)
PASS interaction:console-keys "/" focuses the console filter
PASS interaction:console-keys Escape clears and blurs the filter
PASS interaction:console-keys digit keys are a no-op on a theme without declared consoleViews — board intact (8 widgets, no view stamp)
PASS interaction:drag-resize ArrowRight at the right edge clamps to a no-op (meadow-header stays at x=0)
PASS interaction:drag-resize ArrowDown moved meadow-header to y=1
PASS interaction:drag-resize resize is at the grid's right edge (meadow-header stays 12x1)
PASS interaction:drag-resize resize clamped at the registry floor 1x1 after 11 shrink step(s)
PASS interaction:drag-resize Escape restored meadow-header to its session start 0,0 12x1
interactions: OK — 11 pass, 0 fail, 3 warn
```

Baseline warn set (7 total, all soft skips): `interaction:sort` ×3 (sortable affordances not mounted on any theme), `interaction:tabs` ×2 (bento, meadow — no tabbed widget mounted), `interaction:navigation` ×2 (bento, meadow — project links not mounted, renderer pending). A Stage A phase must not introduce NEW warns or fails; these 7 are the accepted floor.

## 10. `node scripts/widget-check/legacy-sentinel.mjs --base-url http://[::1]:37422` (new post-kill contract)

- **Exit: 0** (4 pass / 0 fail / 0 warn)
- Full output:

```
PASS entrypoint-board / renders the hydrated "mission-control" board (default preset, [data-ready] stamped)
PASS app-namespace-dead /app is gone — 404 not-found rendered, no board, no redirect (notFound=true)
PASS app-namespace-dead /app/mission-control is gone — 404 not-found rendered, no board, no redirect (notFound=true)
PASS dialog-portals-out div [data-slot=dialog-content] role=dialog opened inside the theme scope, fixed-position anchored to the viewport (scope cannot position or clip it)
legacy-sentinel: OK — 4 pass, 0 fail, 0 warn
```

The `/app` kill is confirmed green under the new sentinel contract.

## 11. `node scripts/widget-check/snapshot.mjs --out .plans/widget-normalization/baseline/snapshots-allgreen --base-url http://[::1]:37422`

- **Exit: 0** (12 pass / 0 fail / 0 warn) — all 3 themes × 2 pages × 2 schemes captured:

```
PASS capture bento-dashboard-graphite — snapshots-allgreen/bento-dashboard-graphite.png (108353 bytes)
PASS capture bento-dashboard-paper — snapshots-allgreen/bento-dashboard-paper.png (100850 bytes)
PASS capture bento-project-graphite — snapshots-allgreen/bento-project-graphite.png (129184 bytes)
PASS capture bento-project-paper — snapshots-allgreen/bento-project-paper.png (106729 bytes)
PASS capture meadow-dashboard-daylight — snapshots-allgreen/meadow-dashboard-daylight.png (122581 bytes)
PASS capture meadow-dashboard-nightfall — snapshots-allgreen/meadow-dashboard-nightfall.png (118977 bytes)
PASS capture meadow-project-daylight — snapshots-allgreen/meadow-project-daylight.png (124774 bytes)
PASS capture meadow-project-nightfall — snapshots-allgreen/meadow-project-nightfall.png (120509 bytes)
PASS capture mission-control-dashboard-console — snapshots-allgreen/mission-control-dashboard-console.png (34632 bytes)
PASS capture mission-control-dashboard-daylight — snapshots-allgreen/mission-control-dashboard-daylight.png (38399 bytes)
PASS capture mission-control-project-console — snapshots-allgreen/mission-control-project-console.png (149844 bytes)
PASS capture mission-control-project-daylight — snapshots-allgreen/mission-control-project-daylight.png (151216 bytes)
snapshot: OK — 12 pass, 0 fail, 0 warn
```

12 PNGs verified on disk (count = 12). Scheme names per theme: bento → graphite/paper, meadow → daylight/nightfall, mission-control → daylight/console.

---

## Summary table

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `pnpm run check-types` | 0 | All 4 checking workspaces clean |
| 2 | `pnpm build` | 0 | Full monorepo build OK (web built in 2.04s at the end) |
| 3 | `node scripts/widget-check/grep-invariants.mjs` | 0 | 7 pass / 0 fail / 0 warn |
| 4 | `node apps/web/scripts/validate-layout.mjs` | 0 | 8 pass / 0 fail / 0 warn (7 pages, 49 widget kinds) |
| 5a | `run.mjs --theme mission-control --page dashboard` | 0 | 6 pass / 0 fail / 0 warn |
| 5b | `run.mjs --theme mission-control --page project` | 0 | 6 pass / 0 fail / 0 warn |
| 5c | `run.mjs --theme bento --page dashboard` | 0 | 6 pass / 0 fail / 0 warn (golden-zero fix holds) |
| 5d | `run.mjs --theme bento --page project` | 0 | 6 pass / 0 fail / 0 warn |
| 5e | `run.mjs --theme meadow --page dashboard` | 0 | 6 pass / 0 fail / 0 warn |
| 5f | `run.mjs --theme meadow --page project` | 0 | 6 pass / 0 fail / 0 warn |
| 6 | `run.mjs --suite lab` | 0 | 6 pass / 0 fail / 0 warn (149 density, 181 placement widgets) |
| 7 | `run.mjs --suite parts-preview` | 0 | 4 pass / 0 fail / 0 warn (378 floored part boxes) |
| 8 | `run.mjs --suite self-test` | 0 | Inverted suite green: 6/6 detection probes proven |
| 9a | `interactions/run.mjs --theme mission-control` | 0 | 14 pass / 0 fail / 1 warn (sort not mounted) |
| 9b | `interactions/run.mjs --theme bento` | 0 | 11 pass / 0 fail / 3 warn (sort, tabs, nav links) |
| 9c | `interactions/run.mjs --theme meadow` | 0 | 11 pass / 0 fail / 3 warn (sort, tabs, nav links) |
| 10 | `legacy-sentinel.mjs` | 0 | 4 pass / 0 fail / 0 warn (`/app` dead, dialogs portal out) |
| 11 | `snapshot.mjs --out snapshots-allgreen` | 0 | 12/12 PNGs captured (3 themes × 2 pages × 2 schemes) |

**Verdict: ALL GREEN — 17/17 invocations exit 0; 0 failures anywhere; 7 pre-existing soft warns (interactions "not mounted yet" skips only). Snapshots at `.plans/widget-normalization/baseline/snapshots-allgreen/` (12 PNGs).**
