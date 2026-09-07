# Widget-Normalization Baseline Matrix — GOLDEN BASELINE

Recorded: 2026-09-07 (evening, CEST)
Git HEAD: `598027a67cf855df319bd0a07ae2c04155beaf41` — `598027a widget-normalization: safety commit of in-flight WIP before refactor (owner-approved)` (2026-09-07 23:33:18 +0200)
Environment: node `v24.20.0`, pnpm `10.33.4`, linux x86_64 (Fedora, kernel 7.1.13-200.fc44.x86_64)
Dev server: pre-existing at `http://127.0.0.1:37420` (Vite dev; NOT started or restarted by the recorder)

Method: every command run serially from the repo root against the untouched tree; exit codes captured verbatim; output quoted verbatim (only the `pnpm build` log is trimmed to the last 40 lines per package). Raw logs kept in `/tmp/widget-baseline/`. This is the golden baseline every refactor phase is compared against — any diff in exit codes or PASS/FAIL lines below is a regression signal.

---

## 1. `pnpm run check-types`

Exit code: `0`

```text
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

Result: **PASS** — ui, docs, api, web all typecheck clean.

---

## 2. `pnpm build`

Exit code: `0`
Full log: 294 lines; trimmed below to the last 40 lines per package (root preamble + `apps/docs` + `apps/web`; these are the only two packages with `build` scripts in the `pnpm -r build` scope of 6/7 projects).

Root preamble:

```text
> workspace-welcome@ build /home/didi/workspace/workspace-welcome
> pnpm -r build

Scope: 6 of 7 workspace projects
```

`apps/docs` (last 40 lines of its section):

```text
apps/docs build: dist/client/assets/features-gZFlWSXd.js                                  4.09 kB │ gzip:   2.00 kB
apps/docs build: dist/client/assets/getting-started-CFxMh0ok.js                          12.67 kB │ gzip:   3.15 kB
apps/docs build: dist/client/assets/index-BXXbReUt.js                                   363.68 kB │ gzip: 115.98 kB
apps/docs build: ✓ built in 607ms
apps/docs build: vite v8.1.5 building ssr environment for production...
apps/docs build: [2K
apps/docs build: transforming...✓ 156 modules transformed.
apps/docs build: rendering chunks...
apps/docs build: computing gzip size...
apps/docs build: dist/server/assets/empty-plugin-adapters-Cq4--YW-.js         0.28 kB │ gzip:   0.18 kB
apps/docs build: dist/server/assets/start-DmyFYdaC.js                         0.29 kB │ gzip:   0.21 kB
apps/docs build: dist/server/assets/page-shell-TwBegY05.js                    0.74 kB │ gzip:   0.43 kB
apps/docs build: dist/server/assets/404-4ECmNls8.js                           0.82 kB │ gzip:   0.45 kB
apps/docs build: dist/server/assets/section-header-C91w8P1D.js                1.45 kB │ gzip:   0.68 kB
apps/docs build: dist/server/assets/_tanstack-start-manifest_v-Dfj_Vxbx.js    1.92 kB │ gzip:   0.54 kB
apps/docs build: dist/server/assets/concepts-C9gOsLpL.js                      2.45 kB │ gzip:   1.15 kB
apps/docs build: dist/server/assets/features-hARZ-aYc.js                      5.06 kB │ gzip:   2.25 kB
apps/docs build: dist/server/assets/routes-c3gYxiPv.js                        5.38 kB │ gzip:   1.79 kB
apps/docs build: dist/server/assets/settings-DvMB8lPR.js                       5.50 kB │ gzip:   1.57 kB
apps/docs build: dist/server/assets/router-C8NZ-p26.js                       13.46 kB │ gzip:   3.99 kB
apps/docs build: dist/server/assets/getting-started-DzuGoyPK.js              18.45 kB │ gzip:   3.58 kB
apps/docs build: dist/server/assets/button-DXk7mRXY.js                      121.97 kB │ gzip:  25.07 kB
apps/docs build: dist/server/server.js                                      172.24 kB │ gzip:  43.02 kB
apps/docs build: ✓ built in 364ms
apps/docs build: [prerender] Prerendering pages...
apps/docs build: [prerender] Concurrency: 12
apps/docs build: [prerender] Crawling: /404
apps/docs build: [prerender] Crawling: /
apps/docs build: [prerender] Crawling: /features
apps/docs build: [prerender] Crawling: /docs/concepts
apps/docs build: [prerender] Crawling: /docs/getting-started
apps/docs build: [prerender] Crawling: /docs/settings
apps/docs build: [prerender] Prerendered 6 pages:
apps/docs build: [prerender] - /
apps/docs build: [prerender] - /features
apps/docs build: [prerender] - /docs/getting-started
apps/docs build: [prerender] - /docs/concepts
apps/docs build: [prerender] - /404
apps/docs build: [prerender] - /docs/settings
apps/docs build: Done
```

`apps/web` (last 40 lines of its section):

```text
apps/web build: dist/client/assets/pack-grid-BdDcbNPG.js                      10.66 kB │ gzip:   3.90 kB
apps/web build: dist/client/assets/___lab_-COmhsVSO.js                        11.21 kB │ gzip:   3.86 kB
apps/web build: dist/client/assets/_tanstack-start-manifest_v-GQKTOSh-.js     12.67 kB │ gzip:   2.27 kB
apps/web build: dist/client/assets/dropdown-menu-DYf5bUmG.js                  13.19 kB │ gzip:   4.05 kB
apps/web build: dist/client/assets/open-project-Bh6p0SQD.js                   14.79 kB │ gzip:   4.35 kB
apps/web build: dist/client/assets/project-git-actions-DC2a_6OO.js            15.01 kB │ gzip:   4.34 kB
apps/web build: dist/client/assets/ideation-model-picker-BWk-JPJo.js          19.37 kB │ gzip:   5.79 kB
apps/web build: dist/client/assets/settings-BqOKNhF1.js                       23.58 kB │ gzip:   5.77 kB
apps/web build: dist/client/assets/projects._-B3EFCaIi.js                     24.92 kB │ gzip:   6.17 kB
apps/web build: dist/client/assets/tabs-DvFenPhA.js                           25.07 kB │ gzip:   5.73 kB
apps/web build: dist/client/assets/project._-CCTwahsu.js                      33.06 kB │ gzip:   7.77 kB
apps/web build: dist/client/assets/project._-pDQlQ5Sn.js                      34.35 kB │ gzip:   7.82 kB
apps/web build: dist/client/assets/parts-preview-Ds8l5BVT.js                  36.24 kB │ gzip:  10.95 kB
apps/web build: dist/client/assets/tooltip-Bi-9a4Fy.js                        38.21 kB │ gzip:   8.83 kB
apps/web build: dist/client/assets/findRootOwnerId-B-8PdZcx.js                38.58 kB │ gzip:   8.52 kB
apps/web build: dist/server/assets/ledger-DlRR_EhA.js                         38.62 kB │ gzip:   9.23 kB
apps/web build: dist/server/assets/mission-bento-Bvqc0LI2.js                  42.60 kB │ gzip:  10.75 kB
apps/web build: dist/server/assets/project._-BPGACNe5.js                      42.98 kB │ gzip:   9.73 kB
apps/web build: dist/server/assets/swiss-C9G35q-k.js                          45.56 kB │ gzip:  11.34 kB
apps/web build: dist/server/assets/context-BvK-Jql0.js                        45.80 kB │ gzip:  12.92 kB
apps/web build: dist/server/assets/carousel-BFaIF8of.js                       50.55 kB │ gzip:  12.73 kB
apps/web build: dist/server/assets/themes-D6PWAxIW.js                         51.76 kB │ gzip:  14.60 kB
apps/web build: dist/server/assets/project._-D8-QFnSh.js                      52.83 kB │ gzip:  10.68 kB
apps/web build: dist/server/assets/meadow-CWqjpn_M.js                         53.76 kB │ gzip:  13.04 kB
apps/web build: dist/server/assets/commit-graph-Cku3tddh.js                   59.50 kB │ gzip:  16.45 kB
apps/web build: dist/server/assets/bento-VWnLFIaR2.js                         60.71 kB │ gzip:  14.74 kB
apps/web build: dist/server/assets/instrument-tile-CBXAb0tY.js                61.99 kB │ gzip:  15.98 kB
apps/web build: dist/server/assets/report-widgets-wrQI6Mwz.js                 62.08 kB │ gzip:  15.54 kB
apps/web build: dist/server/assets/ideation-panel-C9A-KMbm.js                 69.93 kB │ gzip:  18.78 kB
apps/web build: dist/server/assets/mission-control-DW1tS7Pe.js                71.44 kB │ gzip:  18.12 kB
apps/web build: dist/server/assets/report-panel-HGJfcQNv.js                   71.47 kB │ gzip:  17.08 kB
apps/web build: dist/server/assets/score-ring-Bgqz7Ado.js                     91.00 kB │ gzip:  25.21 kB
apps/web build: dist/server/assets/badge-CiQg18de.js                         110.93 kB │ gzip:  22.31 kB
apps/web build: dist/server/server.js                                        172.27 kB │ gzip:  43.02 kB
apps/web build: dist/server/assets/forms-BiqxZ3Ig.js                         408.18 kB │ gzip:  88.74 kB
apps/web build: dist/server/assets/render-layout-DkJrPn3A.js                 472.16 kB │ gzip: 108.45 kB
apps/web build: dist/server/assets/trpc-BKBszewk.js                          597.22 kB │ gzip: 133.30 kB
apps/web build: dist/server/assets/router-1qHimI4v.js                      2,451.78 kB │ gzip: 420.67 kB
apps/web build: ✓ built in 1.95s
apps/web build: Done
```

(For the record, `apps/web` client build finished `✓ built in 2.52s` over 4648 modules; SSR build `✓ built in 1.95s`; `apps/docs` client `✓ built in 607ms`, SSR `✓ built in 364ms`, 6 pages prerendered.)

Result: **PASS** — docs + web build clean (vite v8.1.5).

---

## 3. `node scripts/widget-check/grep-invariants.mjs`

Exit code: `0`

```text
PASS themes-deps 49 theme file(s) free of chart/table/query imports
PASS color-literals zero literals in widgets/**; packages/ui grandfather list intact (baseline 2026-09-05T19:03:41.496Z, 4 file(s))
PASS theme-css 9 theme stylesheet(s): literals only on custom-property declarations
PASS severity-vocab 196 file(s): canonical severity only, no "no-root"
PASS theme-widgets 37 theme widget file(s) compose parts/runtime/contexts; no part-id collisions (14 registry part(s) known)
PASS validate-layout apps/web/scripts/validate-layout.mjs ran clean
PASS no-any 224 system-namespace file(s) free of any
grep-invariants: OK — 7 pass, 0 fail, 0 warn
```

Result: **PASS** — 7 pass, 0 fail, 0 warn.

---

## 4. `node apps/web/scripts/validate-layout.mjs`

Exit code: `0`

```text
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

Result: **PASS** — 8 pass, 0 fail, 0 warn.

---

## 5. Theme × page suites — `node scripts/widget-check/run.mjs --theme <theme> --page <page>`

### 5a. `--theme mission-control --page dashboard`

Exit code: `0`

```text
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 10 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (49 declared on the scope)
PASS portal-scope 20 portal surface(s) inherit the scope's --background
PASS placement 10 widget(s) across 1 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [mission-control] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

Result: **PASS**

### 5b. `--theme mission-control --page project`

Exit code: `0`

```text
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 9 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (49 declared on the scope)
PASS portal-scope 21 portal surface(s) inherit the scope's --background
PASS placement 9 widget(s) across 3 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [mission-control] 1 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

Result: **PASS**

### 5c. `--theme bento --page dashboard`

Exit code: `0`

```text
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 7 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (76 declared on the scope)
PASS portal-scope 7 portal surface(s) inherit the scope's --background
PASS placement 7 widget(s) across 1 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [bento] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

Result: **PASS**

### 5d. `--theme bento --page project`

Exit code: `1`

```text
FAIL no-inner-scroll div.shrink-0.overflow-y-auto.@max-[640px]:min-w-0 (widget project-surface) scrolls vertically 96px
PASS density 7 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (76 declared on the scope)
PASS portal-scope 9 portal surface(s) inherit the scope's --background
PASS placement 7 widget(s) across 4 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [bento] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: FAILED — 5 pass, 1 fail, 0 warn
```

Result: **FAIL** — `no-inner-scroll`: `div.shrink-0.overflow-y-auto.@max-[640px]:min-w-0` inside widget `project-surface` scrolls vertically 96px. This is a genuine pre-existing failure on the untouched tree (see Flags below).

### 5e. `--theme meadow --page dashboard`

Exit code: `0`

```text
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 8 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (42 declared on the scope)
PASS portal-scope 16 portal surface(s) inherit the scope's --background
PASS placement 8 widget(s) across 3 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [meadow] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

Result: **PASS**

### 5f. `--theme meadow --page project`

Exit code: `0`

```text
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 4 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (42 declared on the scope)
PASS portal-scope 8 portal surface(s) inherit the scope's --background
PASS placement 4 widget(s) across 1 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [meadow] 0 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
theme: OK — 6 pass, 0 fail, 0 warn
```

Result: **PASS**

---

## 6. `node scripts/widget-check/run.mjs --suite lab`

Exit code: `0`

```text
PASS no-inner-scroll no inner scrollers inside [data-theme-scope] (tolerance 2px, allowlist empty)
PASS density 149 widget(s) measured ≥ 0.7 fill (0 skipped: <40px or data-density-exempt)
PASS token-completeness all 38 manifest tokens present (19 declared on the scope)
PASS portal-scope 24 portal surface(s) inherit the scope's --background
PASS placement 181 widget(s) across 2 region(s): data-attrs match computed positions, bboxes pairwise disjoint
PASS part-min [__lab] 3 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
lab: OK — 6 pass, 0 fail, 0 warn
```

Result: **PASS**

---

## 7. `node scripts/widget-check/run.mjs --suite parts-preview`

Exit code: `0`

```text
PASS part-min [bento] 126 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
PASS part-min [meadow] 126 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
PASS part-min [mission-control] 126 part box(es) ≥ floors, no horizontal overflow, all 38 tokens resolve non-empty, fixed-box == viewport
PASS part-min 3 scope(s) clean (378 floored part boxes total; viewport 1440x900)
parts-preview: OK — 4 pass, 0 fail, 0 warn
```

Result: **PASS** (viewport 1440x900, 378 floored part boxes across 3 scopes)

---

## 8. `node scripts/widget-check/run.mjs --suite self-test`

Exit code: `0`

INVERTED SUITE — the eleven FAIL lines below are the probes firing correctly against a deliberately known-bad panel; the `PASS self-test probe …` lines prove detection works. The suite's exit 0 / overall PASS means the harness is healthy.

```text
FAIL no-inner-scroll div.border scrolls vertically 322px
FAIL density widget misplaced-x is under-dense: fill 0 < 0.7 (content box has no visible children)
FAIL density widget sparse-widget is under-dense: fill 0.02 < 0.7 (union 40x20px in content box 205x204px)
FAIL token-completeness 18/38 manifest tokens missing on [data-ww-theme="__check"] — not theme-declared: --sev-critical --sev-warning --sev-info --state-positive --recency-fresh --recency-stale --pinned-accent --eyebrow --chrome-radius --chrome-hairline; declared but empty: --font-sans
FAIL portal-scope div role=dialog "self-test dialog — must portal outside t" renders OUTSIDE [data-theme-scope] with --background "oklch(70% .155 50)" ≠ scope's "oklch(16.5% .015 60)"
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

Result: **PASS** (harness self-verification healthy)

---

## 9. Interactions — `node scripts/widget-check/interactions/run.mjs --theme <theme>`

### 9a. `--theme mission-control`

Exit code: `0`

```text
PASS interaction:filter "/" focuses, typing narrows, Escape clears and blurs
WARN interaction:sort no button[data-sort-key] on /app/mission-control — sortable affordances not mounted yet
PASS interaction:tabs 4 tab(s) in a 4-tab tablist: focus + Enter selects, aria-selected/data-active agree
PASS interaction:navigation /app redirects to / — the entrypoint renders the "mission-control" scope
PASS interaction:navigation /app/mission-control redirects to /?preset=mission-control with the "mission-control" scope mounted
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

Result: **PASS** — 14 pass, 0 fail, 1 warn (sort affordance not mounted: benign WARN)

### 9b. `--theme bento`

Exit code: `1`

```text
PASS interaction:filter "/" focuses, typing narrows, Escape clears and blurs
WARN interaction:sort no button[data-sort-key] on /app/bento — sortable affordances not mounted yet
WARN interaction:tabs no [data-slot="widget-tabs"] [role="tab"] on /app/bento — no tabbed widget is mounted yet
PASS interaction:navigation /app redirects to / — the entrypoint renders the "bento" scope
PASS interaction:navigation /app/bento redirects to /?preset=bento with the "bento" scope mounted
WARN interaction:navigation no a[href*="/project/"] on /app/bento — project links not mounted yet (renderer pending)
PASS interaction:console-keys "/" focuses the console filter
PASS interaction:console-keys Escape clears and blurs the filter
PASS interaction:console-keys digit keys are a no-op on a theme without declared consoleViews — board intact (7 widgets, no view stamp)
PASS interaction:drag-resize ArrowRight at the right edge clamps to a no-op (vitals-stacks stays at x=10)
PASS interaction:drag-resize ArrowDown moved vitals-stacks to y=9
PASS interaction:drag-resize resize is at the grid's right edge (vitals-stacks stays 2x2)
FAIL interaction:drag-resize resize never shrank vitals-stacks below 2x2 — shrink path broken
PASS interaction:drag-resize Escape restored vitals-stacks to its session start 10,8 2x2
interactions: FAILED — 10 pass, 1 fail, 3 warn
```

Result: **FAIL** — `interaction:drag-resize` shrink path never shrank `vitals-stacks` below 2x2 on bento (genuine pre-existing failure on the untouched tree; see Flags below). The 3 WARNs (sort/tabs/project-links not mounted) are benign.

### 9c. `--theme meadow`

Exit code: `0`

```text
PASS interaction:filter "/" focuses, typing narrows, Escape clears and blurs
WARN interaction:sort no button[data-sort-key] on /app/meadow — sortable affordances not mounted yet
WARN interaction:tabs no [data-slot="widget-tabs"] [role="tab"] on /app/meadow — no tabbed widget is mounted yet
PASS interaction:navigation /app redirects to / — the entrypoint renders the "meadow" scope
PASS interaction:navigation /app/meadow redirects to /?preset=meadow with the "meadow" scope mounted
WARN interaction:navigation no a[href*="/project/"] on /app/meadow — project links not mounted yet (renderer pending)
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

Result: **PASS** — 11 pass, 0 fail, 3 warn (all 3 WARNs benign: sort/tabs/project-links not mounted)

---

## 10. `node scripts/widget-check/legacy-sentinel.mjs`

Exit code: `1`

**KNOWN-STALE — rewritten in P0.3.** This failure is EXPECTED on the baseline: the sentinel asserts legacy chrome on `/` that the `/app kill` removed. Recorded verbatim; not a regression signal for later phases.

```text
FAIL legacy-root / rendered but legacy markers are missing (addDirectory=false, bodyChars=1864)
PASS legacy-design-mc /designs/mission-control renders (11 .mc-label nodes)
FAIL dialog-portals-out could not find the "Add directory" button on / to open a dialog
legacy-sentinel: FAILED — 1 pass, 2 fail, 0 warn
```

Result: **FAIL (EXPECTED / KNOWN-STALE — rewritten in P0.3)**

---

## Summary matrix

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `pnpm run check-types` | 0 | PASS — ui/docs/api/web typecheck clean |
| 2 | `pnpm build` | 0 | PASS — docs (client+SSR+6 pages prerendered) + web (client 2.52s, SSR 1.95s) built |
| 3 | `node scripts/widget-check/grep-invariants.mjs` | 0 | PASS — 7 pass, 0 fail, 0 warn |
| 4 | `node apps/web/scripts/validate-layout.mjs` | 0 | PASS — 8 pass, 0 fail, 0 warn |
| 5a | `run.mjs --theme mission-control --page dashboard` | 0 | PASS — 6 pass, 0 fail, 0 warn |
| 5b | `run.mjs --theme mission-control --page project` | 0 | PASS — 6 pass, 0 fail, 0 warn |
| 5c | `run.mjs --theme bento --page dashboard` | 0 | PASS — 6 pass, 0 fail, 0 warn |
| 5d | `run.mjs --theme bento --page project` | 1 | **FAIL — no-inner-scroll: `project-surface` scrolls vertically 96px** (5 pass, 1 fail) |
| 5e | `run.mjs --theme meadow --page dashboard` | 0 | PASS — 6 pass, 0 fail, 0 warn |
| 5f | `run.mjs --theme meadow --page project` | 0 | PASS — 6 pass, 0 fail, 0 warn |
| 6 | `run.mjs --suite lab` | 0 | PASS — 6 pass, 0 fail, 0 warn (149 dense widgets / 181 placed) |
| 7 | `run.mjs --suite parts-preview` | 0 | PASS — 4 pass, 0 fail, 0 warn (378 part boxes, 3 scopes) |
| 8 | `run.mjs --suite self-test` | 0 | PASS — inverted suite; all 6 probes correctly FAIL on known-bad panel, detection proven |
| 9a | `interactions/run.mjs --theme mission-control` | 0 | PASS — 14 pass, 0 fail, 1 warn |
| 9b | `interactions/run.mjs --theme bento` | 1 | **FAIL — drag-resize shrink path: `vitals-stacks` never shrinks below 2x2** (10 pass, 1 fail, 3 warn) |
| 9c | `interactions/run.mjs --theme meadow` | 0 | PASS — 11 pass, 0 fail, 3 warn |
| 10 | `legacy-sentinel.mjs` | 1 | EXPECTED FAIL — **KNOWN-STALE, rewritten in P0.3** (1 pass, 2 fail, 0 warn) |

### Flags

- **5d — bento:project `no-inner-scroll` FAIL (exit 1), pre-existing on the untouched tree.** `div.shrink-0.overflow-y-auto.@max-[640px]:min-w-0` inside widget `project-surface` scrolls vertically 96px. This is the only theme×page cell that fails; refactor phases must not make it worse, and fixing it should flip this cell to PASS.
- **9b — bento interactions `drag-resize` FAIL (exit 1), pre-existing on the untouched tree.** Shrink path never shrinks `vitals-stacks` below 2x2 (mission-control and meadow both shrink to the registry floor 1x1). Same expectation: no regression; fix should flip to PASS.
- **10 — legacy-sentinel FAIL is expected and acknowledged** (asserts legacy chrome on `/` that the `/app kill` removed). KNOWN-STALE — rewritten in P0.3; do not treat its exit 1 as a regression in later phase comparisons until it is rewritten.
- WARNs (mission-control sort; bento/meadow sort, tabs, project-links) are benign "affordance not mounted" notices, consistent across themes.
