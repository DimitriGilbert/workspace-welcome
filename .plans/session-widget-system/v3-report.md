# V3 — Wave-3 validator report (master plan §5 V3)

Branch `widgets/system` @ `2818d81` (T3-mc `ce463ca`, T3-bento `f2be410`, T3-meadow `70829c2` all landed). ONE deploy performed (`flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`; build green, service `active`, `/app/mission-control` + real project page → 200). Base URL `http://192.168.1.41:37420`. All 16 harness runs + 3 interaction runs + DOM-eval diagnostics wrote JSON to `/tmp/v3-report/` (not committed). No code was changed by V3; no commits made. Target project: `/app/<slug>/project/home/didi/workspace/workspace-welcome` (real repo root, cached report, scan warmed after the restart — service scan cache is in-memory).

## Harness contract finding (read first)

`run.mjs --page project` **cannot target a project path**: `scripts/widget-check/run.mjs:120-126` hardcodes `/app/<theme>/project/` (+`?bare=1`); the service 307s the trailing slash to `/app/<theme>/project`, which matches `/app/$theme/project/$` with an **empty splat** → `projectPath="/"` → `project === null` → the page renders the project board in its null-project states ("Not in the current scan"). Verified live: empty-splat page shows "PROJECT Not in the current scan" forever; the real-repo page at the same viewports loads live data (branch, commits, alerts). The matrix below therefore validates the project-page **shell + null-project rendering**; real-page probe coverage was supplied via `interactions/run.mjs --path` (which accepts a full pathname) plus DOM eval. **D-V3-2** dispatches the missing flag.

## Verdict: **FAIL** — one theme-owned defect (meadow 390×844 `no-inner-scroll`), everything else green. 76/78 probe checks PASS across 13 runs; interactions 0 FAIL ×3; invariants 7/7; sentinel 3/3; commonality 3/3. Dispatch: D-V3-1 → theme-meadow, D-V3-2 → harness.

## Harness matrix (`run.mjs --page project`, suite `theme`) — PASS/FAIL per theme × viewport × probe

| Probe | mc 3440×1440 | mc 1280×800 | mc 390×844 | bento 3440×1440 | bento 1280×800 | bento 390×844 | meadow 3440×1440 | meadow 1280×800 | meadow 390×844 |
|---|---|---|---|---|---|---|---|---|---|
| no-inner-scroll | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL (D-V3-1, 71px)** |
| density | PASS (8w) | PASS | PASS | PASS (6w) | PASS | PASS | PASS (3w) | PASS | PASS |
| token-completeness | PASS (50 decl) | PASS | PASS | PASS (44) | PASS | PASS | PASS (42) | PASS | PASS |
| portal-scope | PASS (19 surf) | PASS | PASS | PASS (13) | PASS | PASS | PASS (6) | PASS | PASS |
| placement | PASS (3 regions) | PASS | PASS | PASS (3) | PASS | PASS | PASS (3) | PASS | PASS |
| part-min | PASS (1 box) | PASS | PASS | PASS (0 boxes) | PASS | PASS | PASS (0) | PASS | PASS |

Every mc/bento run `theme: OK — 6 pass, 0 fail, 0 warn`. Totals: 53/54 probe-green. Widget counts are the project presets rendering in null-project states (see contract finding); mc's green no-inner-scroll/density/placement at all viewports + bare also confirms the T3-mc nested-shell size fix.

## Bare pass (`?bare=1` via `--bare`, 1280×800; redirect preserves the query — verified via curl headers)

| Theme | Result |
|---|---|
| mission-control | OK — 6 pass, 0 fail, 0 warn (47 tokens declared — custom.css correctly dropped) |
| bento | OK — 6 pass, 0 fail, 0 warn (40 declared) |
| meadow | OK — 6 pass, 0 fail, 0 warn (42 declared) |

Meadow bare at 390×844 reproduces D-V3-1 (73px) — the defect is bare-independent. Total probe record: 78 checks, 76 PASS, 2 FAIL (same root cause).

## Interaction suite (`interactions/run.mjs --path "/app/<slug>/project/home/didi/workspace/workspace-welcome"`, 1440×900)

| Theme | filter | sort | tabs | navigation | console-keys | drag-resize | Result |
|---|---|---|---|---|---|---|---|
| mission-control | PASS | WARN (pending) | PASS (5 tabs / 2-tab tablist) | PASS redirect + PASS same-theme project nav | PASS ×3 (digit no-op correct, no consoleViews) | PASS ×5 | **OK — 12 pass, 0 fail, 1 warn** |
| bento | PASS | WARN (pending) | PASS (7 tabs / 4-tab tablist) | PASS redirect + WARN (no anchors exist) | PASS ×3 | PASS ×5 | **OK — 11 pass, 0 fail, 2 warn** |
| meadow | PASS | WARN (pending) | PASS (7 tabs / 7-tab tablist) | PASS redirect + WARN (chips are buttons, see below) | PASS ×3 | PASS ×5 | **OK — 11 pass, 0 fail, 2 warn** |

Every project page mounts tabbed sections and **tabs PASS ×3** (focus + Enter, `aria-selected`/`data-active` agree, exactly one selected per tablist). `sort` WARN ×3 is the designed pending state — the report table mounts behind its tab (`GRAPH/TABLE`, bento surface tabs, meadow sections tab), no `button[data-sort-key]` at settle; same WARN class V2 accepted. Navigation WARNs on bento/meadow are honest: their dashboards expose no `a[href]` project anchors (DOM: bento 0 hrefs at all; meadow 3, all `/reports/$key`). **DOM-eval click-through** proves meadow's real affordance: clicking a "Needs care" chip landed `/app/meadow/project/home/didi/workspace/context-builder` with the `data-ww-theme="meadow"` scope still mounted.

## Navigation-consistency (V3 requirement)

- mc dashboard: **32** project anchors, all `/app/mission-control/project/<path>` — clicked one, landed same-theme project route, scope kept (harness PASS + DOM).
- meadow: attention chips navigate via `navigate({ to: "/app/$theme/project/$", params: { theme: "meadow", … } })` (`widgets/themes/meadow/widgets/meadow-attention.tsx:32-36`) — click-through verified same-theme.
- **Zero** hrefs to `/designs/*` or `/projects/*` on any dashboard or project page (DOM inventory ×6 pages), and zero in `widgets/{themes,runtime,parts,contexts}` source (grep; only a comment in `runtime/flows.ts:34`).
- Observation (not a defect, G1 item): the **bento dashboard has no open-project affordance at all** (tiles not clickable; `widgets/themes/bento/widgets/signals.tsx:41` documents `onOpen` unbound). Vacuously consistent; routes to theme-bento/G1.

## Invariants + sentinel + gatekeeping

| Check | Command | Result |
|---|---|---|
| 7 grep invariants | `node scripts/widget-check/grep-invariants.mjs` | **OK — 7 pass, 0 fail, 0 warn** (themes-deps 35 files, color-literals 0 + 4 grandfathered, theme-css 6 sheets, severity-vocab 174 files, theme-widgets 28 files / 14 parts, validate-layout clean — covers project-requiring kinds 8/8, no-any 202 files) |
| Legacy sentinel | `node scripts/widget-check/legacy-sentinel.mjs --base-url http://192.168.1.41:37420` | **OK — 3 pass, 0 fail, 0 warn** |
| Typecheck | `pnpm run check-types` | **PASS** (all packages) |
| Build + deploy | `pnpm build` + service restart under flock | **PASS** (single deploy) |

## Cross-theme commonality (project pages)

- **3/3 themes import Chart from parts** — `@workspace-welcome/ui/components/chart` in bento `widgets/{project-report,project-tile,pulse,vitals}.tsx`, meadow `widgets/{context-cards,meadow-context,project-sections}.tsx`, mc `widgets/report-activity.tsx`.
- **0 local chart implementations** — no `<svg`/`<canvas`/`<polyline`/`recharts`/`d="M` in any themes `*.tsx`.
- **0 local table implementations** — no `<table`, no `@tanstack/table` in `widgets/themes/**`.
- **0 local format implementations** — no format helpers/`Intl.*` defined in themes; consumers of shared `@/lib/format` (15 theme files) plus the plain `Number.toLocaleString()` builtin.
- Shared `IdeationPanel` imported directly by bento `project-surface.tsx:19` and meadow `project-sections.tsx:20` (plan-sanctioned; ideation has no part). Themes compose parts/contexts/runtime only — **commonality PASS**.

## Defects (fix-dispatch — V3 changed no code)

### D-V3-1 — meadow project page: tab strip overflows its widget at 390×844 — **DEFECT**, owner: theme-meadow

- Finding: `FAIL no-inner-scroll div[data-slot=widget-tabs].flex.shrink-0.items-center (widget meadow-project-sections) scrolls horizontally 71px` (73px bare). Reproduced on the **real repo page** at 390×844 via DOM eval (overflowPx 71; mc and bento tab strips 0px on the same page/viewports).
- Evidence: `widgets/themes/meadow/widgets/project-sections.tsx` mounts all 7 `SECTIONS` tabs (`:39-47`, `WidgetShell tabs={SECTIONS}` `:401-405`) in every size rung; at 390 the meadow ladder places the widget at a compact rung where 7 tabs cannot fit. The runtime strip is `overflow-x-auto` (`widgets/runtime/widget-shell.tsx:146-147`), so the overflow becomes a scrollable element, which the probe fails (allowlist ships empty pending G1 #2). mc (2-tab) and bento (4-tab) fit at 0px — fitting is achievable.
- Fix routing: theme-meadow renders a compact tab set (or no tabs) on compact rungs; alternatively, if scrollable tab strips are the ratified pattern, that is a runtime WidgetTabs decision plus a G1 #2 `data-scroll="widget"` allowlist entry — not a probe change.

### D-V3-2 — `run.mjs --page project` cannot reach `/app/<theme>/project/<path>` — **DEFECT (harness-calibration)**, owner: harness

- Finding: the project-page form hardcodes the empty splat (`scripts/widget-check/run.mjs:120-126`), so the harness validates `/app/<theme>/project` (projectPath `"/"`, `project === null`) and can never exercise the deterministic-fixture/real-repo page that V3/C1 specs name. Evidence: 307 trailing-slash redirect (query preserved); empty-splat page permanently "Not in the current scan" vs live data on the real page (DOM dumps in `/tmp/v3-report/` diagnostics).
- Fix (harness): add `--path <pathname>` (mirroring `interactions/run.mjs:7,76`) or a `--project-path` flag to `targetUrl()` before C1, whose full matrix requires `/project/$fixture` pages. Until then C1's probe matrix would silently test the null-project shell.

### Observations (not defects)

- bento dashboard open-project affordance missing (above, G1 item). `sort` WARN ×3 = table behind its tab (designed pending). Digit keys no-op without `consoleViews` — correct runtime behavior, PASS ×3.

## Accepted deviations (already logged in master-plan §12 — verified in code, no action)

- **T3-bento pin/ring substitutions**: `project-hero.tsx:113` renders `project.pinned` as a `Chip` (pin-toggle substitution); `project-tile.tsx:35,97` uses `ProjectLedPart`; recency ring is the ui `ScoreRing` part — all on the import surface. Logged as G1/C1 items.
- **T3-bento `?ideation=new` deep-link dropped**: `themeSearchSchema` accepts only `bare` (`routes/app/-theme-shell.tsx:30-32`, routes frozen post-M1); no dangling `ideation=new` links in the ported widgets.
- **meadow T3 size ~770 lines**: `git show --stat 70829c2` = 769 insertions (167+421+141 widget files + preset/index). Per-file max 421 ≤ the ~450 split rule; totals exceed the estimate exactly like the accepted T2-bento (~1460). mc ~574 / bento ~819 insertions, per-file max 326/385 — same classification.

## Routing summary for the orchestrator

runtime: no defects (WidgetTabs overflow only manifests via meadow's composition; D-V3-1's alternative fix path would be runtime+G1). parts: no defects. contexts: no defects. theme-meadow: D-V3-1. theme-bento: no V3 defect (affordance observation → G1). theme-mc: no defects (nested-shell fix confirmed). harness: D-V3-2. After D-V3-1 lands, V3 re-runs meadow 390×844 normal + bare only; after D-V3-2 lands, C1 gains real-path probe coverage.
