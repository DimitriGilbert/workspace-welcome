# exec-mc — mission-control widget board rework (branch widgets/system)

## Baseline findings

- Deployed build at 3440x1440 (shots/baseline-3440.png) matches `mc-CURRENT-do-not-ship.jpeg`:
  loose in-canvas "Filter fleet" input + count row, "SYNCED/ACTIONS/RESCAN" row, full
  "ACTIONS: add-directory/create-project/generate-report/clone-script + Settings" band all
  floating in dead space above the board; console region = triage 7x3, ledger 7x14,
  activity 3x4, ai 3x3 ($0.00 hero), health 3x4, code 3x4, heatmap 2x4, alerts 1x3,
  stack 1x3, dirty 1x3, roots 1x3 → tall scroll, off-target ordering.
- The working tree ALREADY carries (uncommitted, prior wave): subtitles in WidgetShell `meta`
  for mc-report-activity/code/health, so the subtitle→titlebar mod is mostly a verify step;
  the deployed build predates it.
- Packer = skyline fill-the-line (`lib/grid-layout/pack-grid.ts`), one CSS grid per stack
  region, `gap-6` (24px) BETWEEN regions, 12px inside; regions pack independently in reading
  order. Simulated the target arrangement by hand — see "New dashboard pack" below.

## Applied mods

1. Command band: mc-command-bar loses the duplicated filter input + count (the common page
   header already owns `data-console-filter` + `/` via use-console-keys) and gains the
   Settings link so the removed mc-actions band loses no door; Actions dropdown keeps the 4
   form parts. mc-actions dropped from the dashboard preset (kind stays registered; lab keeps
   exercising it).
2. GRAPH/TABLE toggle removed from mc-report-activity (redundant-class): full rung is the
   area chart, small rung the totals trio. custom.css widget-tabs skin stays (page-header
   console tabs still use WidgetTabs).
3. mc-report-ai: $0.00 hero killed. Full rung = records/tokens/cost MiniStat row + token
   in/out ledger; zero-cost renders the honest "subsidized — $0" chip, not a hero numeral.
   Mid rung = records + tokens + in/out bars. Small = compact records/tokens line. No-usage
   rung = totals trio (unchanged honesty).
4. mc-report-health: signals DataTable capped by placed height at mid rungs (rich ledger at
   1x3), vertical severity census below 240px container; full rung unchanged (12-row table).
5. mc-dirty-leaders: h-bars already gated rows>=2 — narrow (<240px container) design added:
   total + top-3 leaders mini-ledger instead of the lone "163 DIRTY FILES" Stat.
6. Preset dashboard (see below) packed to the TARGET arrangement; heatmap + roots removed
   from the dashboard board (kinds remain registered).

## New dashboard pack (final, matches the TARGET 1:1 at 3440)

command region: masthead 8x1 + command-bar 4x1 (one tight band; tablet 8 + 4; phone 4 + 4).
console region reading order (fill-the-line skyline — order IS placement order):
triage 6x4, report-activity 4x4, report-ai 2x6, ledger 6x8, report-code 4x4,
alerts-donut 4x4, report-health 1x3, dirty-leaders 1x3, stack-mix 2x3 →
- triage(1-6 r1-4) rides ledger(1-6 r5-12)
- activity(7-10 r1-4), code(7-10 r5-8), alerts(7-10 r9-12)
- ai(11-12 r1-6), health(col11 r7-9) | dirty(col12 r7-9), stack-mix(11-12 r10-12)
12 rows desktop, zero gaps. Phone (4 cols) packs gapless: triage 4x4, activity 4x4,
ai 2x6 + health 1x3 + dirty 1x3 + stack 2x3, ledger 4x8, code 4x4, alerts 4x4.
Heatmap + roots kinds stay registered but off this board (lab still exercises them).

## Late fixes found by phone screenshots

- report-health census wrapper had `hidden … @[240px]:hidden` → census never rendered;
  now `flex … @[240px]:hidden` (ERR/WRN/INF rows at phone width).
- mc-stack-mix narrow (<240px container) fell to a lone "3 STACKS" Stat at 2x3 →
  narrow legend list added.
- mc-alerts-donut: same narrow severity-ledger variant added (no lone numeral at 1-wide
  tall rungs).
- mc-dirty-leaders headline total now the fleet truth (`vitals.dirtySum`), leaders stay
  the per-unit ranking; narrow variant = total + top-4 ledger.
- mc-triage rows distribute (`flex-1 min-h-[40px]`) so the 6-row preview fills 6x4.

## Verification log

- `pnpm run check-types` — PASS (whole workspace, final build).
- `apps/web node scripts/validate-layout.mjs` — 8 pages clean, 47 kinds.
- `scripts/widget-check/grep-invariants.mjs --theme mission-control` — 7 pass, 0 fail
  (severity vocab, theme widgets, validate-layout, no-any included).
- widget-check harness `--theme mission-control`: dashboard 3440x1440 / 1280x800 /
  390x844 / 3440x1440 `--scheme daylight` and `--page project --path <repo>` at
  3440x1440 — ALL "theme: OK — 6 pass, 0 fail, 0 warn" (density, placement disjoint,
  no-inner-scroll, token completeness, portal scope, part-min).
- Screenshots (shots/): final-3440.png matches the TARGET arrangement + all five mods;
  final-1280.png clean responsive desktop; new-390.png + new-390-mid.png phone tight,
  narrow rungs real; new-3440-daylight.png light scheme clean; new-project-3440.png
  project page (state band, pulse+commits, activity graph, new AI composition).
- Deploys: `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user
  restart workspace-welcome.service'` — 4 iterations, service 200 after each.

## Residual risks

- Board is 12 console rows ≈ scrollHeight 1625 at 1440 viewport: alerts/stack-mix bottoms
  sit just below the fold — same crop as the owner's TARGET capture; no internal gaps.
- Tablet (8 cols, not in the verification set) packs tight but with a ragged bottom
  (bottom-right notch) — inherent to static sizes on 8 cols.
- AI usage at 2x6 keeps structural air between its three content blocks (justify-between);
  every block is real data (trio / cost ledger / token bars), no hero, no dead half.

## RUNTIME CHANGES NEEDED (orchestrator — outside my write scope)

1. **version bump blocked by runtime types.** Mission says bump dashboard AND project layout
   `version: 1` → `2`, but `PageLayout.version` is the literal type `1`
   (apps/web/src/widgets/runtime/layout-types.ts:67) and validate-layout flags
   `version !== 1` as a violation (apps/web/src/widgets/runtime/validate-layout.ts:229).
   Preset therefore still ships `version: 1` (a `2` fails check-types + the harness).
   Fix: widen the type to `1 | 2`, accept 2 in validate-layout, then bump both presets.
2. **Owner mod (1) — command chrome into the common header.** The target's red arrow asks
   why the fleet filter/command chrome is not a common part of the page header. The header
   (runtime/render-layout.tsx `PageBody`) already carries the common filter; it should also
   host the sync clock + Actions menu + Rescan (+ Settings link) so the canvas needs no
   command row at all. mc-command-bar is structured so its body can migrate verbatim into
   that header slot; the preset node can then be dropped.

## Verification log

- (pending)

## Round 2 — fill law + pixel-exact sizing (owner verdict rework)

### Measured geometry (edge-detection on mc-TARGET, ImageMagick scanlines)
- Capture frame 3397px: panel borders at x=22/1688, 1705/2810, 2827/3370 → column
  bands triage 6 / activity 4 / ai 2 (colW≈264, gap≈17); band 2: ledger 7
  (x 24→1981), code 3 (1986→2810), health 1 + dirty 1 (2827/3108→3370), stack 2.
  Rows: band1 y274→719, band2 737→1183 → 4-row bands (capture rows ≈98+18 gap;
  health/dirty 891→1183 ≈ 2.6 rows, ai 274→874 ≈ 5.2 rows — capture itself is
  non-uniform vertically).
- Final preset spans: triage 6x4, activity 4x4, ai 2x6, ledger **7x8**, code
  **3x4**, alerts **3x4**, health 1x3, dirty 1x3, stack 2x3 (runtime agent's
  headerCommand / masthead 12x1 / v2 tablet overrides preserved untouched).

### DOM-measured render boxes (3440x1440) — spans match capture 1:1, zero gaps
masthead 12x1; triage (0,1) 6x4 · activity (6,1) 4x4 · ai (10,1) 2x6 ·
ledger (0,5) 7x8 · code (7,5) 3x4 · alerts (7,9) 3x4 · health (10,7) 1x3 ·
dirty (11,7) 1x3 · stack (10,10) 2x3. All columns close at row 12.
Honest delta: canvas gap is 12px (runtime-owned constant) vs capture ~17, capture
rows ~98-112 non-uniform → absolute-px equality is impossible; normalized grid
spans are exact. proof-console-sidebyside.png = capture | render comparison.

### Subtitle-row kill (owner law)
Root cause was DOUBLE SHELLS: renderLayout wraps every widget in a shell that
renders the registry title; theme widgets mounted a second shell whose header
carried the meta — that inner header WAS the standalone subtitle row. Fix in
custom.css: the inner header is pinned onto the frame's title row (absolute,
top-right; DOM-verified same line: outer y=194, inner y=193) so metadata shares
the titlebar line and content starts under the hairline. ReportGeneratedMeta
("N hours ago HTML ↗") DELETED outright (report-shared + all 4 report kinds);
project-commits' "newest first" noise meta deleted. Remaining metas are real
info only, on the titlebar.

### Per-widget fill verdicts (crops in /tmp/w-*.png, inspected individually)
- triage PASS: pulse strip flex-1 fills the mid-row span edge to edge.
- activity PASS: chart stretches from titlebar hairline to box bottom, full width.
- ai PASS: one filled ledger — 5 hairline rows distributing full height (values
  15px) + tokens block anchored bottom; no clusters, no hero.
- code PASS: donut sized to rung (232px at 3x4) + legend rows distributing the
  same height, stats band on top.
- alerts PASS: donut 232 + severity rows WITH per-code rollup sub-rows (+share %)
  distributing full height.
- stack-mix PASS: donut 190 + legend rows (units + share %) distributing.
- dirty-leaders PASS: HBars flex-1 justify-around + total header + footer.
- ledger PASS: rows fill, "+9 more" footer pinned.
- health PASS (borderline, honest): signals table + bottom census strip
  (ERR/WRN/INF); td density raised via node-scoped CSS; at 5 signals the residual
  gap ≈ one content row (~45px). Data-dependent: 1-2 signals would void a 3-row
  box — box cannot shrink further without breaking the 12-row pack (capture
  shows ~2.6 rows).
- NOT MINE per orders: vitals/command band. Runtime observation to queue: at
  1280/390 the masthead figures clip under the sticky page header (header grew
  with the register; board top padding not raised) and phone vitals labels
  overlap.

### Verification (final build)
- check-types PASS; validate-layout 8 pages clean; grep-invariants 7/7.
- Harness `--theme mission-control`: dashboard 3440x1440 / 1280x800 / 390x844 /
  3440x1440 daylight + project@3440 — ALL 6 pass 0 fail.
- Screenshots: shots/fill-3440.png (+ -bottom, fill-1280, fill-390,
  new-3440-daylight, new-project-3440, proof-console-sidebyside.png).
