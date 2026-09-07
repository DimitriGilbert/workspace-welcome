# exec-runtime-bento — progress notes (runtime audit + bento size-rung sweep)

Agent scope: `apps/web/src/widgets/runtime/**`, `apps/web/src/widgets/parts/**`,
`apps/web/src/widgets/themes/bento/**`, `scripts/widget-check/**`.
Read-only: `components/designs/**`, `routes/designs/**`, `packages/ui/**`,
`themes/mission-control/**`, `themes/meadow/**`, `routes/app/**`, `lib/grid-layout/**`.

NOTE: the previous exec-runtime-bento.md (killed agent) claimed a
`[container-type:size]` shell change and a v2-accepting validate-layout were
already in the tree — BOTH claims were false (verified by reading the files +
`git diff`); this file is written fresh from verified state only.

## §1a — Is canvas layout persisted? Does a `version` bump invalidate anything?

**No persistence exists.** Verified:

- `runtime/grid-session.ts` — the ONLY placement-override store: module-scope
  `Map` keyed by `pageId` (`${theme}:${page}`). Manual drag/resize commits
  shadow the authored layout for the browser session only; the file contract
  (settled #4) forbids localStorage/sessionStorage. A reload always re-packs
  from preset code.
- `widgets/theme-prefs.tsx` persists ONLY `{ preset, schemes }` under
  `ww.prefs.v1` — never geometry. (Gotcha for future agents: concurrent
  harness/agent runs share that store and can flip the active preset/scheme
  mid-session — use an isolated browser session when screenshotting.)
- No other layout-geometry storage anywhere (checked routes/designs, ui).

**So a `version` bump can never go stale against a saved layout — the packer
always re-packs from code.** Made the bump meaningful anyway:

- `runtime/layout-types.ts`: `PageLayout.version` is now `1 | 2`; doc states
  v2 = per-breakpoint footprint generation, and that a future persistence
  layer MUST store the preset version with saved layouts and drop entries
  whose stored version ≠ the preset's current version.
- `runtime/validate-layout.ts`: accepts exactly versions 1 and 2 (message
  names both); mission-control/meadow/lab stay v1 and stay valid.
- Bento `dashboard` + `project` bumped `1 → 2` (task requirement).

## §1b — size-class.ts soundness + packer degenerate footprints

- `resolveSizeClass` audited: exact rung; between rungs = largest defined
  rank ≤ current; below every rung = smallest defined; empty `defined` =
  current unchanged; malformed entries ignored / degrade to smallest. Never
  throws, never `undefined`. Sound.
- `lib/grid-layout/pack-grid.ts` (read-only for me, audited only):
  `normalizedFootprint` clamps `cols` to grid width, floors both dims at 1 —
  an item can never strand at a degenerate (0-wide/0-tall) footprint at 12/8/4
  columns, and no item is ever dropped. Residual (documented, not fixed —
  outside write scope): the rescue pass places at the lowest skyline **x=0
  first**, so at 6 columns a footprint set that can't tile the width (e.g.
  3+5+4) strands items left-aligned beside board holes. That was bento's
  project hero at tablet — fixed at the PRESET layer, see §2.

## §1c — Height-aware container queries: ENABLED (carefully)

Before: shell root was `container-type: inline-size` (Tailwind `@container`)
everywhere; height conditions evaluated as unknown and never matched; the
content box was not a query container.

Change (`runtime/widget-shell.tsx`): canvas-placed shells
(`GridItemContext !== null`) now root **`container-type: size`**; out-of-grid
shells (composite slots, dialogs, lab, explicit `size` prop) keep
`inline-size`. Rationale: only the canvas gives a provably definite height
(fixed px `grid-auto-rows` × rows + stretched `h-full` frame), so size
containment is safe exactly there; content-driven heights would collapse
under `contain: size`. The ternary swaps the class — `@container` and
`[container-type:size]` are never both applied, so no utility-order conflict.
SSR-stable: the context exists during render → server and client stamp the
same class. Height conditions now work against the shell root for rich/compact
switching; width behavior unchanged (same element, content box).

Regression evidence: harness green on mission-control, meadow, bento
(dashboard+project, graphite+paper, 3440/1280/800/390, bare), lab suite,
parts-preview, self-test; settings page + /designs/bento screenshot-compared.

## §2 — Bento sweep: what was wrong, what changed

Compared `/app/bento` against read-only `/designs/bento` at 3440x1440,
1280x800, 800x900, 390x844 (dashboard + project). No bento widget renders a
lone number at 2x1+ at any rung (all five mosaic tiers and every band widget
have real designs; density probe ≥0.7 fill everywhere). The real failures
were placement-layer degeneracies + two under-filled rungs:

1. **Format v2 + per-breakpoint footprints** (`layout-types.ts`,
   `grid-canvas.tsx`, `preset.ts`): `WidgetNode` gained optional
   `tablet`/`phone` `SizeClass` overrides; `useViewportBoard` (replaces
   `useViewportColumns`, no other importers) returns the active breakpoint
   key + column count; `packRegion` packs with
   `nodeSizeForBreakpoint(node, bp)`. SSR renders desktop first paint as
   before; overrides resolve once, in one place.
2. **Bento preset v2** (`themes/bento/preset.ts`):
   - dashboard `signals-mix` `tablet: "6x3"` — the clamped 4-col span left a
     2-col board hole at tablet; the mix now takes the full row (the design's
     own mid-band re-span, bento.css @media 1024–1535).
   - project hero: `project-state` `tablet: "3x4"`, `project-summary`
     `tablet: "6x4"` — 3+5+4 cannot tile a 6-col board (any static order
     strands all three; verified by packer trace), so tablet re-rungs to the
     design's equal-thirds 3+3 / 6 with ZERO holes; desktop keeps the
     prototype's 3+5+4 exactly.
   - dashboard `chrome` `phone: "2x2"` — at 2 columns the wrapped
     brand/actions/search stack clipped in one 96px row (brand invisible);
     `2x2` restores the design's <1024px three-row header. Chrome registry
     `min` corrected `3x3 → 2x2` accordingly (widgets/index.ts).
3. **Pulse band cadence table** (`widgets/pulse.tsx`): was `justify-center`
   with a natural-height table — a 3-row table clustered inside a 12x5 band
   with a huge void (and clipped its thead at phone). Now the table is
   `h-full` (rows distribute through the box in tall bands) inside
   `overflow-hidden` with a bottom fade (`mask-image` over `var(--foreground)`
   → token-pure; crops cleanly when months outrun the height). Verified
   visually at 12x5, 6x5, 6x3, 2x3.
4. **Feature-tier stat table** (`widgets/project-tile.tsx`): the `dl` wasn't
   stretched so `content-center` was inert — stat rows pinned top with dead
   space below on 2x3 phone tiles. Added `h-full`; the grid now centers in
   the card.

Metadata/subtitles: bento tiles deliberately carry the design's own b-label
headers and the theme stylesheet drops `[data-slot=widget-shell-header]`
(custom.css "system chrome swap") — no metadata was moved to the shell meta
slot because the shell chrome is intentionally invisible in this theme;
nothing was orphaned.

## Verification (mandatory loop) — FINAL, post resize-fix + header migration

- `pnpm run check-types` PASS (whole workspace, final tree).
- `node apps/web/scripts/validate-layout.mjs`: all pages clean (mc pages now
  v2 with tablet overrides; meadow/bento/lab unchanged behavior).
- `grep-invariants.mjs`: 7/7 PASS.
- Deployed twice via `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build &&
  systemctl --user restart workspace-welcome.service'`; service 200.
- Harness `theme: OK — 6 pass, 0 fail` on: mission-control dashboard
  3440/1280/800/390 + daylight 3440 + project 3440; meadow dashboard 3440;
  bento dashboard 3440/390 + paper 800; bento project 3440; lab (171 widgets);
  self-test 6/6; parts-preview.
- **Known red (pre-existing, NOT mine, out of scope):** bento project
  no-inner-scroll at short viewports — the shared
  `components/file-browser/index.tsx` tree pane (`overflow-y-auto`, fixed
  `70vh` height) scrolls whenever the scanned repo's root listing is taller
  than 70vh (36px @1280x800, 5px @390x844; passes at 3440). Proven not my
  regression: with `container-type` toggled back to inline-size in the live
  DOM the scroll is byte-identical; the component is untouched by my diff.
  Documented in c1-report.md and master-plan.md as owner-gated.
- Screenshots LOOKED at (isolated agent-browser session — concurrent agents
  share the daemon/prefs store): dashboard 3440/1280/800/390, project
  3440/800/390, paper 3440 — zero lone-number widgets at 2x1+, zero board
  holes at tablet, chrome whole at phone, pulse table fills its band.

## PRIORITY INSERT — resize "row problem" (owner: "resizing any block fucks the dashboard up")

**Reproduced** on the deployed board (keyboard + synthetic-pointer gestures):
one resize commit pins the widget as a packer anchor; the fill-the-line packer
then REQUIRED a LEVEL foundation for every free item — punched skylines rarely
offer one — so blocks were stranded above holes or dumped by the rescue pass,
and successive resizes cascaded into a scattered, hole-riddled board (empirical
dump: after one grow, code/alerts jumped two bands down leaving 2x3 + 2x2
interior holes).

**Fix (packer layer, `lib/grid-layout/pack-grid.ts`)** — unified free-item
placement on BEST-FIT: every step places the pending item whose lowest RESTING
position (min over x of the tallest column under the footprint) is lowest,
leftmost on ties, earliest reading order on ties. The old `lowestLevelX`
level-gate + rescue split is gone (the rescue was the same math, applied only
when no level window existed). On flat skylines best-fit degenerates to the old
behavior — proven byte-identical placements for every clean board; on punched
skylines items claim every hole their width fits.

**Proof:** placement baselines captured via Vite SSR before/after
(`pack-before.json`/`pack-after3.json`, all presets × dashboard/project ×
desktop/tablet/phone): bento + meadow IDENTICAL at all 6 combos; mc dashboard
desktop IDENTICAL (owner TARGET untouched); mc dashboard tablet 53 interior
holes → 0, mc dashboard phone 1 → 0, mc project tablet 8 → 0; overlaps 0
everywhere. Browser proof on the deployed build: scripted sequence (keyboard
grow → pointer SE grow → keyboard move) — after each step: zero grid overlaps,
zero bbox overlaps, pins hold, board re-packs tight (screenshots
`/tmp/bento-shots/rz-0-start.png`, `rz-1-grow.png`, `rz-2-final.png`). Escape
revert untouched.

## PRIORITY INSERT II — the best-fit fix was NOT enough (owner: "jack shit fixed")

The owner's live cases (verdict-resize-during/after, verdict-resize-case3)
proved the residual defect: best-fit fixed TIGHTNESS but not STRUCTURE. Every
commit re-ran the GLOBAL packer, so all free items re-settled by lowest
resting position — widgets teleported across column bands (ledger left the
left stage; health/dirty jumped to the top-left; centre voids opened).
Reproduced all three owner cases live (shrink activity; activity top-right;
drop at the top band) on the deployed build before reworking.

**Real fix — MUTATION RE-PACK MODEL (`lib/grid-layout/pack-grid.ts`
`compactPacked` + `grid-canvas.tsx` `packRegionCompact` + `grid-session.ts`
columns record):** manual mutations no longer re-run the global packer.
Compact mode keeps every non-edited widget's x-BAND AND footprint, recomputes
only y: committed manual placements (pinned) + authored `at` anchors are
obstacles at their exact cells; free items (ascending previous y) take the
lowest y where they intersect no placed x-overlapping item — gravity
compaction within the kept bands. Properties: no cross-band teleports
(x preserved), the committed drop/resize lands VERBATIM (pinned placements
are never adjusted), holes refill, neighbours yield only on real overlap,
refusals stay pinned-only (a target overlapping a pinned widget is refused —
it does not geometrically fit). Compact mode engages only when the recorded
session columns == the live grid width and the previous placements cover the
region's nodes; breakpoint changes and filter-grown flows fall back to the
global pack. No overrides → global pack byte-identical (clean authored boards
unaffected — re-verified by baselines).

**Proof:** chained unit test (5 sequential mutations: shrink, move-up,
west-grow, shrink, cross-board move): 0 overlaps, 0 x-drift per step. Live
pointer-event matrix on the deployed build with after-screenshots
(`/tmp/bento-shots/mx-A..D.png`): A shrink-activity (owner case 1), B
move dirty-leaders to row 1 (lands exactly, ai yields in-band), C
activity to the top-right 6x3 span (owner case 3 — pins at the preview,
ai/code yield in-band, left stage intact — compare the owner's scatter
capture), D move alerts across the ledger band (lands at the cursor, ledger
slides down within its band, 0 bbox overlaps). Note: pinned-target drops
REFUSE with an announcement by design (manual placements are immovable;
Escape reverts); everything else lands where the preview shows.

Also: the concurrent mc-widgets fixer changed preset sizes under me mid-proof
(ledger 7x8, code 3x4 — the design's 7/3/2 zones); initially misread as a
cols-drift bug, confirmed theirs, harness re-run green on the combined state.



## MC residuals (scope extended to themes/mission-control/** for these only)

1. **Header migration (owner mod 1) — DONE.** `ThemePreset.headerCommand?`
   (themes/index.ts) = component rendered at the common page header's right
   edge (render-layout PageBody, inside the provider stack, after tabs, before
   the filter). `McCommandRegister` (command-bar.tsx) = sync clock + Actions
   menu + Rescan + Settings + the four form parts, `flex-wrap items-center` so
   it fills the header slot; `McCommandBar` keeps the kind for the lab (same
   register in a chrome-stripped shell). Preset drops the `command-bar` node;
   masthead `12x1`. The band fills: mc-vitals cells are `flex-1` (six figures
   spread edge to edge, vertically centered — the owner-marked dead middle is
   gone). Meadow renders no headerCommand; bento hides the page header and
   keeps its own chrome.
2. **Version lift — was already DONE** this session before the mc report:
   `PageLayout.version` is `1 | 2`, validate-layout accepts 1|2, and this file
   states plainly: **NO layout persistence exists** (grid-session is module
   memory; reloads always re-pack from code) — version bumps invalidate
   nothing and are format-generation markers only; a future persistence layer
   must store+check the version. mc dashboard/project now `version: 2` (they
   carry v2 tablet overrides); bento both pages v2; meadow stays v1.
3. **mc tablet ragged bottom — FIXED via v2 `tablet` overrides** (minimal
   preset touch; the 8-col board cannot tile the static desktop spans):
   dashboard console → pairs/bands [triage|activity 4x4], [ai 4x6 | code 4x4 +
   alerts 4x4], [ledger 8x8], [health 2x5 | dirty 2x5 | stack 4x3]; project
   readout → [pulse|commits 4x4], [activity 8x5], [ai|health 4x4], [code 8x5].
   All mc boards now pack ZERO interior holes at 8 cols (placement baselines +
   800px screenshot `final-mc-800.png`).

## FILL LAW + SUBTITLE BAN (owner laws, my layers)

- `widgets/parts/**`: audited — no fixed-height internals, no standalone
  meta rows (`list/files.tsx` forwards a height prop; form parts' fixed
  heights are inside dialogs). ui chart family (chart/donut/h-bars/data-table/
  stat — READ-ONLY) audited: all `h-full w-full min-h-0`, nothing to record.
- Command band fill: vitals figures `flex-1` spread + centered (above).
- Bento dead-zone inspection at 3440x1440 (`final-bento-3440-p0.png`): every
  band fills (health gauge+stats, activity chart h-full, stack mix, attention
  rows, signal mix, pulse table now `h-full` with distributed rows + bottom
  fade); density probe 0.7-fill with 0 skipped. Subtitle ban: bento metadata
  rides each tile's own title line (shell header hidden by design); no
  standalone subtitle rows in parts/** or bento. Meadow not audited (out of
  scope — flagged for the orchestrator).

## RESIZE-PROOF DELIVERABLE + DataTable minSize clamp fix

- `resize-proof.md` (this directory): executable drag recipe — DOM selectors/hit-zone
  math, re-derive snippet, grip liveness check, and five copy-pasteable
  agent-browser sequences with real CSS-pixel coordinates, each validated end-to-end
  with real CDP mouse input on the deployed build (observed announcements + placement
  dumps recorded as "Expected (observed)").
- **Real-input bug found while validating the recipe** (synthetic dispatchEvent
  bypasses hit-testing, which is why earlier proofs passed where a real drag
  failed): the MOVE grip's `group-hover:pointer-events-auto` compiles into
  `@media (hover: hover)` — headless/CDP browsers report `hover: none`, so the grip
  was `pointer-events: none` forever and real drags couldn't grab it. Fixed:
  the grip is always pointer-live (grid-canvas.tsx; the always-live NW resize zone
  already claimed that corner, so nothing new is blocked; opacity stays hover-gated).
  Move case re-validated verbatim with real mouse input after the fix.
- **ui DataTable minSize clamp** (granted fix, `packages/ui/src/components/
  data-table.tsx`): TanStack's built-in default `minSize: 20` clamped every
  authored `size` < 20 to a uniform width, erasing content-tight ratios. Fix:
  `defaultColumn: { minSize: 0 }` — authored `size` is the width contract; explicit
  per-column `minSize` still wins (fleet-ledger's `ratio()` workaround unaffected).
  `mc report-health` re-authored content-proportioned (Sev 12 / Signal 78 flex /
  Value 10, content floors). Sweep: consumers = mc fleet-ledger (explicit floors —
  fine), mc project-commits (14/16/56/12 — healed by the default, verified live:
  237/270/947/203px = exact authored ratios), mc roots-panel (24/10 — healed),
  parts/list/commits (56/24/20 — >=20, unaffected), parts-preview (50/25/25 —
  unaffected), meadow/bento — no DataTable consumers.

## ROUND 3+4+5 — full droppable board, skyline-fill around pins, bento authored-board purge

- **Region model (round 3):** mc dashboard merged into ONE droppable region — the
  masthead vitals band is row 0 of the console grid; drops onto/beside the vitals
  work and the band yields like any free widget (verified: dirty-leaders dropped ON
  the vitals band at 6,0; masthead compacted to 0,4; board re-tiled tight, 0
  overlaps). Console views filter the single region, so the vitals band persists
  across attention/pinned/archive — predictable. Bento keeps per-band regions (its
  flow region cannot merge); drops within bands verified (B-1..B-3).
- **Mutation re-pack (round 4):** the in-band compaction was REMOVED — it stranded
  voids around floating pins (the owner's bento archipelago: pinned cells froze,
  free widgets only slid in-band). The mutation re-pack is now the skyline-fill
  packer itself, rewritten on an OCCUPANCY-RECT model (`pack-grid.ts`): fixed items
  (committed pins + authored anchors) are exact rectangles; free items take the
  lowest non-intersecting position (fill-the-line across width classes). This fills
  AROUND pins — including the space above/beside a floating pin that the old
  heights frontier model lost. Authored boards re-verified: 0 overlaps on every
  preset × page × breakpoint; holes 0 everywhere except inherent pin/footprint
  remainders (mc phone: a 1-col strip beside the fixer's 3-wide code/alerts —
  authored geometry, not the packer).
- **Bento authored board (round 5):** stack mix prose deleted (numbers + bar legend
  beside the donut); health cluster fills (stats distribute full height); attention
  rows are single dense truncate lines (flexible chips column absorbs width);
  `AI $0.00` deleted from the pulse meta (cost shows only when > 0); activity chart
  already fills its box (the flat look is the data — ui Chart domain is
  `[0, "auto"]`, tight).
- **resize-proof.md rewritten** with post-merge coordinates + vitals-band case +
  three bento cases — every sequence executed verbatim with real CDP mouse input.

## ROUND 5 FINAL — swap/push/never-refuse arrangement model

The in-band compact mode and the best-fit global re-pack were BOTH replaced by the
incremental ARRANGEMENT model (owner round 5): the session store now commits the
WHOLE settled region arrangement after every mutation (`grid-session.ts` — immutable
snapshot swap; the in-place mutation bug that made React skip re-renders is fixed);
the canvas renders a committed arrangement VERBATIM; `pack-grid.ts`
`settleArrangement` resolves a drop with (1) SWAP when the moved widget's old rect
is free and exactly one same-footprint occupant holds the target, else (2) PUSH:
occupants re-home below the drop (x kept, chained downward), and (3) NO gravity and
NO skyline re-sorting — widgets the drop did not displace stay exactly where they
were. Refusals exist only for authored `at` anchors (preset geometry); session pins
never block an explicit user drop. A breakpoint change or filter-grown node set
falls back to the authored global pack until the next edit.

Validated live (real CDP pointer sequences): the owner's target arrangement
re-affirmed drop-by-drop (8 mc drops, final board = target, 0 overlaps); a
displacing drop + push + restore on mc; a bento multi-move (activity to the left
column, stacks below — each drop landed exactly, untouched widgets stayed). Recipe
cases 1-8 in `resize-proof.md` re-validated under the final model (observed
placements updated in the doc).

Harness (new `/?preset=` URLs after the meadow agent's route migration — run.mjs
re-derived): mc 3440/1280/390/daylight/project, meadow dash+project, bento
dash+project, lab, self-test, parts-preview — all `6 pass 0 fail`; grep-invariants
7/7; check-types PASS (theme-picker's route-typed navigation adapted to the
migrated route schemas — minimal documented double-cast).

## ROUND 6 — taste-driven compaction + transient-render finding

- **Compaction policy (owner taste directive):** `settleArrangement` now CLOSES the
  cells a mutation vacated — after swap/push, FREE widgets slide cell-by-cell into
  the vacated space (vertically from below, then horizontally from the right),
  stopping at the first blocker and never touching pinned placements. Band-local
  and stepwise: the board reads as closed ranks after every move, no cross-band
  teleports, no islands. Pinned placements are immune (they protect the owner's
  explicit spots). Verified live on bento: activity moved out of the top band →
  stacks slid left beside health (closed ranks); the drop position itself is
  honored verbatim (a drop low leaves the space above — the owner's explicit
  choice, not a mechanical void).
- **Transient-render finding (mc fixer's taste sweep):** the "empty chart" /
  "flat line" captures are recharts MOUNT ANIMATION frames — `chart.tsx`
  `const animate = !reduceMotion` animates on every mount/filter change; mid-
  animation screenshots catch axis-only frames, and the pulse carousel catches
  mid-auto-advance slides. Settled renders on BOTH schemes are filled (verified:
  graphite + paper pulse tables crop with the fade, activity spikes render).
  **Required ui change (READ-ONLY for me):** `packages/ui/src/components/
  chart.tsx` — set `const animate = false` (mount animation off) so the board is
  screenshot-stable and never flashes empty.

## ROUND 7 — bento unified region + re-authored narrative

- **One droppable surface:** the bento dashboard merged into a single region
  `board` (chrome → health → activity → signal mix → attention → stacks → pulse →
  mosaic eyebrow); the project mosaic stays its own flow region (generated tiles
  cannot join a stack). Cross-row moves verified live with real pointer input:
  stacks moved from band 2 UP across the old band boundary to row 2 — landed
  verbatim, the displaced signal mix re-homed below it, 0 overlaps, untouched
  widgets (chrome/health/activity/attention/pulse/mosaic + all tiles) unmoved.
- **Re-authored narrative (owner verdict folded in):** stack mix OUT of the first
  line (band 2, content-sized 4x3 beside the attention ledger); the prime band =
  health SHRUNK to content (2x3) beside activity (6x3) and signal mix (4x3) — the
  widgets the owner rated decent hold the first band; pulse full-width 12x3 (the
  chart/table crop fills it); attention 8x3 unchanged. Tablet re-banded flush
  (health|activity, signal|stacks at 3+3); phone stacks full-width. Pack verified:
  holes=0, overlaps=0 on every region × breakpoint. Per-widget crops judged at
  3440 + 1280: dense, no oversized-empty tiles.
- **Light-theme flashing (round 6 follow-up, meadow agent's sweep):** root cause
  was TWO ThemePickers fighting — chrome-hosted pickers render without
  `activeScheme`, resolved the SAVED default (graphite/dark) and fought the
  route's deep-linked scheme, oscillating the html class ~18x/second (148 class
  mutations in 8s on bento paper). Fixed: chrome-hosted pickers read the THEME
  SCOPE's `data-ww-scheme` attribute (the board's ground truth) via a
  MutationObserver-synced state; the saved selection is only the fallback.
  Verified: 0 class mutations over 8s on bento paper, mc daylight, and meadow —
  all stable.

## Residuals / required changes outside my scope

1. **FileBrowser inner scroll (owner-gated, per master-plan):** add
   `data-scroll="widget"` to the two pane divs in
   `apps/web/src/components/file-browser/index.tsx` (tree pane ~line 222,
   viewer pane equivalent) AND allowlist the hosting widget ids
   (`project-surface`, plus meadow/mc equivalents) in
   `scripts/widget-check/probes/no-inner-scroll.allowlist.json`
   (`{ "widgets": [...] }`). The allowlist ships EMPTY by design; entries
   need the part-level declaration to take effect, so both land together
   with owner sign-off. Until then bento project @<~857px-tall viewports
   fails that one probe.
2. **Packer rescue left-alignment** (`lib/grid-layout/pack-grid.ts`): the
   rescue pass could consider best-fit x (minimize leftover frontier) instead
   of first-lowest x; would make v1 presets strand less. Not touched (other
   themes' layouts depend on current behavior).
3. **ui parts (READ-ONLY for me): none required.** Height-aware container
   queries are live for ui parts via the canvas-placed shell root
   (`@container (min-height: …)` now resolves); no existing ui part needed a
   change for this sweep.
