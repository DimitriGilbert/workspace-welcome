# V2 — Wave-2 validator report (master plan §5 V2)

Branch `widgets/system` @ `7ab3c9e` (T2-mc `25c1a2e..5f1ac7a` wiring, T2-bento `6f59346`, T2-meadow `dc0dda1`, P4a DataTable `9a2a614`, harness tabs-fix `7ab3c9e` all landed and committed). One deploy performed (`flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`; build green, service `active`, `/app/mission-control` → 200). Base URL `http://192.168.1.41:37420`. All 12 harness runs + 6 interaction runs wrote JSON to `/tmp/v2-report/` (not committed). No code was changed by V2; no commits made.

## Verdict: **PASS** — zero FAILs attributable to runtime / parts / theme / contexts. All 5 non-PASS interaction findings classify as HARNESS-CALIBRATION (owner: harness), evidence below.

## Harness matrix (run.mjs --page dashboard, suite `theme`) — PASS/FAIL per theme × viewport × probe

| Probe | mc 3440×1440 | mc 1280×800 | mc 390×844 | bento 3440×1440 | bento 1280×800 | bento 390×844 | meadow 3440×1440 | meadow 1280×800 | meadow 390×844 |
|---|---|---|---|---|---|---|---|---|---|
| no-inner-scroll | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| density | PASS (13w) | PASS (13w) | PASS (13w) | PASS (6w) | PASS (6w) | PASS (6w) | PASS (3w) | PASS (3w) | PASS (3w) |
| token-completeness | PASS (50 decl) | PASS (50) | PASS (50) | PASS (44) | PASS (44) | PASS (44) | PASS (42) | PASS (42) | PASS (42) |
| portal-scope | PASS (24 surf) | PASS | PASS | PASS (12) | PASS | PASS | PASS (6) | PASS | PASS |
| placement | PASS (2 regions) | PASS | PASS | PASS (4 regions) | PASS | PASS | PASS (4 regions) | PASS | PASS |
| part-min | PASS (1 box) | PASS | PASS | PASS (0 boxes) | PASS | PASS | PASS (0 boxes) | PASS | PASS |

Every run: `theme: OK — 6 pass, 0 fail, 0 warn`. Totals: 54/54 probe-green.

## Bare pass (`?bare=1` via `--bare`, 1280×800)

| Theme | Result |
|---|---|
| mission-control | OK — 6 pass, 0 fail, 0 warn (47 tokens declared — custom.css tokens correctly drop) |
| bento | OK — 6 pass, 0 fail, 0 warn (40 declared) |
| meadow | OK — 6 pass, 0 fail, 0 warn (42 declared) |

Bare interaction suites (`--path "/app/<slug>?bare=1"`) reproduce the normal-mode results exactly (mc OK 12/0/2; bento 10 pass / 2 fail / 1 warn; meadow 10/3/1 — same findings, none bare-specific). Full interaction suite still passes in bare modulo the same classified items.

## Interaction suite (`interactions/run.mjs`, default viewport 1440×900)

| Theme | filter | sort | tabs | navigation | console-keys | drag-resize | Result |
|---|---|---|---|---|---|---|---|
| mission-control | PASS | WARN (pending) | PASS (6 tabs) | PASS redirect + WARN (settle race, item D5) | PASS ×4 (incl. digit 1..N, Escape restore) | PASS ×5 (move, pin stamp, grow, floor, Escape) | **OK — 12 pass, 0 fail, 2 warn** |
| bento | PASS | WARN (pending) | PASS (4 tabs) | **FAIL** (D2) | PASS ×3, **FAIL** digit (D3) | PASS ×5 | **FAILED — 10 pass, 2 fail, 1 warn** |
| meadow | PASS | WARN (pending) | PASS (4 tabs) | **FAIL** (D2) | PASS ×3, **FAIL** digit (D3) | PASS ×4, **FAIL** pin stamp (D4) | **FAILED — 10 pass, 3 fail, 1 warn** |

`sort` WARN ×3 is the designed pending state, not a finding: `button[data-sort-key]` (DataTable, P4a `9a2a614`) mounts with project pages/report zones at T3; the WARN contract ("pending must not look broken, nor pass silently") is doing its job.

## Invariants + sentinel + gatekeeping

| Check | Command | Result |
|---|---|---|
| 7 grep invariants | `node scripts/widget-check/grep-invariants.mjs` | **OK — 7 pass, 0 fail, 0 warn** (themes-deps 26 files, color-literals 0/4-grandfathered, theme-css 6 sheets, severity-vocab 165 files, theme-widgets 19 files/14 parts, validate-layout, no-any 193 files) |
| Legacy sentinel | `node scripts/widget-check/legacy-sentinel.mjs` | **OK — 3 pass, 0 fail, 0 warn** |
| Typecheck | `pnpm run check-types` | **PASS** (all packages) |
| Build + deploy | `pnpm build` + service restart under flock | **PASS** (single deploy) |

## Cross-theme commonality

- **3/3 themes import Chart from parts** — `import { Chart } from "@workspace-welcome/ui/components/chart"` in `widgets/themes/bento/widgets/{project-tile,pulse,vitals}.tsx`, `widgets/themes/meadow/widgets/{context-cards,meadow-context}.tsx`, `widgets/themes/mission-control/widgets/report-activity.tsx` (+ `MIN_CONTENT` floor import on mc).
- **0 local chart implementations** — themes grep clean for `<svg`, `<canvas`, `<polyline`, `<path`, `d="M`, `recharts` (only comment references in `mission-control/tokens.css` to the recharts token ramp, which is a tokens file, allowed).
- **0 local table implementations** — no `<table`, no `@tanstack/table` in `widgets/themes/**` (the only tanstack hits are `@tanstack/react-router` links). DataTable is consumed from parts where used (mc, 3 files).
- **0 local format implementations** — no format/table/chart helper definitions in themes; themes consume the shared `@/lib/format` module (8 files across all 3 themes: `relativeTime`, `formatCompact`, `formatCost`, `formatTokens`, `compactAge`, `dateTooltip` — named as a legal shared module by T2's requirements) plus the plain `Number.toLocaleString()` builtin for integer counts. Only compositions + `custom.css`/`tokens.css` live theme-locally.

## Defects & calibration findings (fix-dispatch — V2 changed no code)

### D2 — navigation: `/app` per-theme redirect expectation vs the app's single default (bento + meadow FAIL) — **HARNESS-CALIBRATION**, owner: harness

- Finding: `interaction:navigation /app did not land on /app/bento (at /app/mission-control)` (meadow likewise). mc passes only because it *is* the default.
- Evidence: `apps/web/src/routes/app/index.tsx:7` `const DEFAULT_THEME = "mission-control"` + `throw redirect(...)` — one app-wide default by design; master-plan G1 decision #3 ("Default theme for `/app` redirect — proposed: mission-control") is the pending owner ruling. The redirect mechanism itself works on every run (always lands `/app/mission-control`, verified in all 6 interaction runs + 3 probes).
- Probe ref: `scripts/widget-check/interactions/navigation.mjs` step 1 — `path.startsWith(\`/app/${ctx.theme}\`)` asserts a per-theme default that cannot hold for non-default themes.
- Fix (harness): assert the configured default (`/app/<DEFAULT_THEME>`) instead of `ctx.theme`. If the owner overturns G1 #3, the constant changes — the per-theme assertion stays wrong either way.

### D3 — console-keys: per-widget tabs miscounted as console views (bento + meadow FAIL) — **HARNESS-CALIBRATION**, owner: harness

- Finding: `interaction:console-keys digit key did not switch the view (still null)` on bento/meadow (mc passes — it declares console views).
- Evidence: the runtime renders console views only when the preset declares `consoleViews` (`apps/web/src/widgets/runtime/render-layout.tsx:343` conditional WidgetTabs; views feed `use-console-keys` at :311; `data-console-view` stamped at :330 as `activeView ?? undefined`). Only `widgets/themes/mission-control/preset.ts:55` declares `consoleViews` (wired by T2-mc-wiring `5f1ac7a`); the T2 requirements do not mandate them for bento/meadow. The script derives view-count N from document-wide `[data-slot="widget-tabs"] [role="tab"]` (`scripts/widget-check/interactions/console-keys.mjs`, `views` query) — but bento/meadow mount 4 *per-widget* tabs, which `tabs.mjs` itself documents as legitimate ("Boards legitimately mount MULTIPLE tabs components (per-widget tabs)"). Digit switching is correctly a runtime no-op when `views` is undefined.
- Fix (harness): scope the views query to the page-header console tablist (e.g. `[data-slot="page-header"] [data-slot="widget-tabs"] [role="tab"]`) or gate on a `[data-console-view]` element existing; treat 0 console views as pending, not FAIL. (If the owner later wants view-switching parity on all dashboards, that is a new T2-scope theme requirement, not a V2 defect.)

### D4 — drag-resize: pin stamp demanded on a no-op edge move (meadow FAIL) — **HARNESS-CALIBRATION**, owner: harness

- Finding: `interaction:drag-resize committed move did not stamp data-pinned on meadow-header`.
- Evidence: meadow-header is authored 12 cols wide in a 12-col region at x=0, so ArrowRight clamps to a no-op. The runtime deliberately does not commit no-op moves: `apps/web/src/widgets/runtime/use-grid-drag.ts` `moveKeyDown` — `if (x === origin.x && y === origin.y) { announce("...already at the edge"); return; }` before `commitPlacement`; `data-pinned` reflects committed placements only (`grid-canvas.tsx:354`; semantics documented in `grid-session.ts:69`). The script accepts "no change at the edge" for the position assertion but then unconditionally requires the stamp (`scripts/widget-check/interactions/drag-resize.mjs`, `if (!movedRight.pinned) report.fail(...)`). mc passes because its masthead (9 of 12 cols) has headroom, so its move really commits.
- Fix (harness): assert the pin stamp only when the placement actually changed (move the `pinned` assertion into the moved branch), or target a widget with headroom for the pin check.

### D5 — navigation: project-anchor WARN is a settle race via the `/app` redirect (mission-control WARN, confirms T2-mc) — **HARNESS-CALIBRATION**, owner: harness

- Finding: `WARN interaction:navigation no a[href^="/app/mission-control/project/"] … (renderer pending)`.
- Evidence (DOM-eval probe, no vision): direct `goto /app/mission-control` + settle → **32** project anchors present at t+0 with `[data-ready]` set; via `goto /app` (redirect) + settle → **0** anchors at settle, **32** after +3s. Arriving via the redirect, settle's `[data-ready]`+double-rAF fires before the projects query mounts the nav-rail anchors — a timing race, not missing affordances (T2-mc's claim confirmed).
- Probe ref: `navigation.mjs` step 2 does a single `queryExists` right after settle; `scripts/widget-check/interactions/helpers.mjs:74` already ships the bounded `waitForSelector`.
- Fix (harness): `waitForSelector(linkSelector, { timeoutMs: 5000 })` before WARNing.

### Routing summary for the orchestrator

- runtime: no defects. parts: no defects. theme (mc/bento/meadow): no defects — bento/meadow's missing `consoleViews` and meadow's full-width header are legal authored choices. contexts: no defects. harness: D2, D3, D4, D5 (all calibration; script-side fixes only). After the harness fixes land, V2 re-runs the interaction suites only (harness matrix, bare, invariants, sentinel, gatekeeping already green at `7ab3c9e`).

## Calibration notes

- `run.mjs --viewport` takes `WxH` (e.g. `1280x800`), not `--viewport <w> <h>`; `--bare` appends `?bare=1`; `interactions/run.mjs` has no `--bare` — use `--path "/app/<slug>?bare=1"` (path is concatenated onto base-url verbatim).
- `part-min` reports 0 part boxes on bento/meadow dashboards (1 on mc) — vacuous pass; dashboards apply chart floors via style constants (`MIN_CONTENT`), the `[data-part-min-*]` boxes concentrate in the lab/parts-preview suites (V1: 378 boxes). Observation only.
- Portal-scope counts scale with theme chrome (mc 24 / bento 12 / meadow 6 portal surfaces) — consistent across all viewports and bare.
