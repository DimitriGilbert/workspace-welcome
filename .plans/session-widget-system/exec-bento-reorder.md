# exec-bento-reorder — re-authoring the bento dashboard preset (owner verdict round 8)

Owner verdict (verbatim, abridged): bento preset is shit; reading order must be
needs-attention → key metrics → projects → less-important data; activity is
redundant (leaves the board); the pulse must auto-cycle its tabs; health is a
compact cluster beside the pulse; projects go IN A WIDGET (meadow's
project-bento treatment); signal mix narrowed; stack mix small at the end;
every block content-sized, zero make-it-bigger blank space.

## Chosen composition (desktop 12 cols, cell 96px)

| band | widgets | why it satisfies the order |
|------|---------|----------------------------|
| chrome | `bento-chrome` 12x1 (phone 2x2) | unchanged |
| 1 — prime | `bento-attention` 3x3 · `bento-pulse` 6x3 · `bento-health` 3x3 | attention leads at content size (was 8 cols of half-void); pulse takes activity's old 6x3 slot verbatim ("use it in place", replaces activity); health is the compact cluster beside the pulse (was 2x3, clipped + voids) |
| 2 | `bento-project-bento` 12x8 (NEW kind) | the mosaic IN A WIDGET — meadow's treatment: one chrome-framed kind running the shared `"projects"` flow internally; free tiles + free-floating mosaic header leave the canvas |
| 3 — coda | `bento-signals` 3x3 · `bento-stacks` 3x3 | the less-important pair, narrowed (signal mix 4→3, stacks 4→3), trailing the board |

Scan order = attention → pulse → health → projects → signals → stacks. Zero
board holes at every breakpoint (bands sum: 12 / 12 / 6-trailing-coda; tablet
6-col: 6/6/6/6 + 3+3 pair; phone 2-col stacks). `bento-activity` and
`bento-mosaic-header` leave the dashboard preset (kinds stay registered for
the lab catalog).

The trailing 6-col open area in band 3 is the board's end (mc precedent:
authored open cells), not a mid-board void.

Tablet (6 cols): attention 6x3 → pulse 6x3 → health 6x2 → projects 6x8 →
signals 3x3 | stacks 3x3. Phone (2 cols): chrome 2x2, attention 2x4, pulse
2x3, health 2x3, projects 2x8 (compact ledger), signals 2x3, stacks 2x3.

## Code changes (all inside apps/web/src/widgets/themes/bento/** unless noted)

1. NEW `widgets/project-bento.tsx` — `BentoProjectBento`, modeled on meadow's
   `themes/meadow/widgets/project-bento.tsx`: resolves `getFlow("projects")`
   itself, renders `BentoProjectTile`s on a dense internal 12-col CSS mosaic
   (`grid-flow-row-dense`, `auto-rows-[minmax(84px,1fr)]`, identity spans —
   the ladder rungs are already 12-col-native), tiles keep their ORIGINAL
   rung as `size` so `BentoProjectTile`'s tier logic is untouched. ≤4 canvas
   cols → dense ledger rows (name · alerts · age · recency ring), rows flex
   to share the box (no inner scroll). Chrome = `BentoTile` + b-label header
   ("Projects", filtered count meta, `SizeLegend` meta at wide footprints).
   Registered as `bento-project-bento` (min 2x2) in `widgets/index.ts`.
2. `widgets/pulse.tsx` — dashboard-only tab auto-cycle: `ReportPanel` gains
   `autoCycleTabs?: boolean` (default false — the project page's
   `BentoProjectPulse` stays manual); `BentoPulse` passes true. Effect
   advances activity→health→code→ai every 8s, pauses on hover/focus, no
   cycle under prefers-reduced-motion (DataCarousel semantics).
3. `widgets/vitals.tsx` + `custom.css` — health compact cluster: the
   stats dl re-classes to `b-health-stats` (2-col; 4-across at container
   ≥520px); `b-health-body`'s viewport @media (max-width 1535.98) stack is
   replaced by a container query (@container max-width 519px → column), and
   the gauge wrapper gets `b-health-gauge` (170px → 140px under 400px
   container). Container = the canvas shell's `container-type: size` root —
   the tile sizes to its BOX at every breakpoint, not the viewport.
4. `widgets/signals.tsx` — attention rows size off the tile, not the
   viewport: name `w-32 sm:w-64` → `b-att-name` (8rem, 16rem at container
   ≥720px), glyphs `hidden md:inline-flex` → `b-att-glyphs` (≥560px), age
   `hidden sm:inline` → `b-att-age` (≥420px). At the new 3-col box this is
   the dense content-sized ledger; at 8+ cols it no longer strands a
   mid-row void (chips + flexible spacing absorb the width honestly).
5. `preset.ts` — the composition above; regions collapse to ONE stack
   (`board`) + nothing else (the flow region dies with the free tiles).

## Gates

- `pnpm run check-types`; `pnpm run build`; deploy under
  `flock /tmp/ww-redesign-build.lock`.
- `node scripts/widget-check/run.mjs --theme bento --page dashboard` at
  3440x1440, 1280x800, 390x844, `--scheme paper`; `--theme mission-control`
  and `--theme meadow` dashboards for regression; grep-invariants.
- Per-widget BEFORE/AFTER crops at 3440 + 1280 (before set captured in
  /tmp/ww-shots/before on the pre-change deploy).
- Real-pointer cross-row drag proof on the deployed board (move a widget
  from band to band: lands verbatim, zero overlaps) + pulse auto-cycle
  screenshot pair (different tabs, ~9s apart, no pointer over the widget).

## Deviations / notes (final)

- Registry min floors lowered for two kinds whose old floors were authored
  against the fixed-width internals those internals no longer have:
  `bento-attention` 3x3 → 2x1, `bento-pulse` 3x3 → 2x3 (header/tabs wrap,
  they do not clip; validate-layout + lab ladder re-run clean).
- Projects widget is 12x12 (tablet 6x12, phone 2x10), not 12x8: measured on
  the deployed board, 32 projects at the current ladder run 11 inner
  minmax(84px,1fr) rows (~948px); 8 rows clipped the bottom tile row
  mid-glyph. 12 canvas rows hold the content with rows stretching to fill.
- `packMosaic` (project-bento.tsx) replaces CSS `grid-auto-flow: dense`
  with an explicit first-fit dense packing so the trailing PARTIAL row
  centers — a lone tile in the last line sits mid-band instead of
  stranding an 11-col corner void (meadow's flush 13 rows were count luck;
  bento's 32 projects left one).
- Attention preview rows 6 → 5: at 3x3 the 6th row (min-h-9) overflowed the
  list box and clipped mid-glyph (pre-existing at 8x3 too).
- Extra container rules in custom.css: attention chips fall away below a
  ~360px box (a 40px ellipsis chip is noise); stack donut/legend stack
  below ~380px (legend bars crushed to nothing beside the 112px ring).
- Tile header (project-tile.tsx): name gets min-w-14, the stack chip is
  shrinkable/truncating — at tablet spans three hero names collapsed to
  clientWidth 0 (measured, then fixed: names hold 56-73px, chips yield).
- Pulse health tab stats row wraps (phone 2-col clipped the "5,712
  signals" tail mid-glyph).
- Gates on the final build: check-types OK; validate-layout 8 pass;
  grep-invariants 7 pass; theme suite 6 pass × {bento 3440/1280/390/paper/
  project, mc dashboard 3440+1280, meadow dashboard 3440+1280}; real-pointer
  drag proof PASS (cross-board swap lands verbatim at the ghost preview,
  zero overlaps; drop into free space likewise, closed-ranks compaction per
  round 5/6); auto-cycle proof PASS (Activity→Health→Code→AI→Activity with
  crops, hover holds, reduced-motion off-switch in code).
- KNOWN PRE-EXISTING (not mine): `interactions/run.mjs` reports 5 FAILs on
  bento (console-keys Escape-filter, drag-resize Escape-revert + SE-grow)
  — identical failures reproduce on mission-control and meadow with this
  build; the keyboard move/resize/floor passes hold. Environment/runtime
  issue outside this order's write scope.

## ROUND 9 — the owner's WANT board (bento-WANT.jpeg vs bento-HAVE.jpeg)

Owner correction folded in: the oversized workspace-welcome tile in WANT is
a CAPTURE FLUKE, not a design rule — no per-project hero hierarchy. Spec =
(1) the WANT widget ORDER, (2) content-sized widgets + the flow's own
mosaic tile sizing.

- Band 1 re-rung to the WANT proportions, 4 rows tall: attention 4x4 ·
  pulse 6x4 · health 2x4 (health shows the gauge + 2x2 stat cluster
  centered, exactly the WANT look — `b-health-stats` now goes 4-across
  only from a 3-col tile up (≥640px container), 1-col under ~300px).
- Band 2: project-bento 12→10 of 12 columns; signal mix + stack mix move
  INTO a 2-column right rail (signals 2x3 over stacks 2x3, both
  content-sized). The cells below the rail tiles stay open — content-sized
  rail, mc's authored-holes precedent.
- Mosaic unchanged internally (inner 12-col grid, flow rungs → spans,
  packMosaic dense fill + centered trailing row) — the flow's own sizing
  per the correction; only the widget's canvas width changed.
- Tablet/phone overrides re-rung: attention 6x4/2x4, pulse 6x4/2x4,
  health 6x2/2x4, bento 6x12/2x10, signals|stacks 3x3 pair / 2x3+2x3.
- `bento-pulse` defaultSize 6x3 → 6x4 (registry only; pulse.tsx internals
  belong to the concurrent agent — untouched by this round).
- CONCURRENT-AGENT NOTE: pulse.tsx carries their in-flight content rework
  in the shared tree; it rode the build. One residual blemish at 390: the
  pulse health-tab stats line touches the tile edge — inside pulse.tsx,
  reported to them, not fixable here.

Deployed DOM placements at 3440 (data-x/y/cols/rows):
chrome (0,0) 12x1 · signals-attention (0,1) 4x4 · workspace-pulse (4,1)
6x4 · vitals-health (10,1) 2x4 · project-bento (0,5) 10x12 · signals-mix
(10,5) 2x3 · vitals-stacks (10,8) 2x3. Mosaic: 32 tiles, flow sizing
(hero 3x3 ×1, feature 2x3 ×3, large 2x2 ×14, medium 2x1 ×11, compact 1x1
×3, dense-filled 1-col stack on line 1).

Proofs: side-by-side `.plans/session-widget-system/bento-WANT-vs-DEPLOYED.png`
(WANT | deployed, zoomed out); drag proof PASS on the new layout (stacks↔signals
swap lands verbatim, zero overlaps; health drop below the rail lands verbatim,
push re-homes occupants — round 5/6 model); theme suite 6 pass × {bento
3440/1280/390/paper/project, mc dash 3440, meadow dash 3440}; grep-invariants
7 pass; validate-layout 8 pass; check-types clean.

## ROUND 10 — the owner's live-editor arrangement (bento-OWNER-ARRANGEMENT-FINAL.jpeg)

The owner arranged the board themselves in the live editor; that arrangement
is authored into the preset verbatim:

- Band 1 (4 rows): attention 4x4 · pulse 6x4 · **signal mix 2x4** (moved UP
  out of the coda into the prime rail, its full content).
- Band 2: project-bento 10x12 (the flow's own tile sizing — line 1 in the
  owner image is exactly what the packer produces: ww 3x3, cb/solard/
  migration 2x3, slopcad 2x2 with stationio filling beneath, 1-col dense
  stack of archives) with the rail continuing beside it: **workspace
  health 2x4** over **stack mix 2x3**. Cells below the stack mix stay
  open (content-sized rail, mc authored-holes precedent).
- Tablet/phone overrides re-rung accordingly (signals 6x3/2x4, health
  6x2/2x4, stacks 6x2/2x3).

Deployed DOM placements at 3440: chrome (0,0) 12x1 · signals-attention
(0,1) 4x4 · workspace-pulse (4,1) 6x4 · signals-mix (10,1) 2x4 ·
project-bento (0,5) 10x12 · vitals-health (10,5) 2x4 · vitals-stacks
(10,9) 2x3. Mosaic: 32 tiles, flow rungs (3x3 ×1, 2x3 ×3, 2x2 ×14, 2x1
×11, 1x1 ×3).

Proofs: side-by-side
`.plans/session-widget-system/bento-OWNER-vs-DEPLOYED.png` (owner image |
deployed, zoomed out, 3440); drag proof PASS (health↔signals cross-band
swap lands verbatim at the ghost, zero overlaps; stacks into the open rail
cells verbatim); theme suite 6 pass × {bento 3440/1280/390/paper/project,
mc dash, meadow dash}; grep-invariants 7 pass; validate-layout 8 pass;
check-types clean. pulse.tsx untouched (concurrent agent's).

## ROUND 11 — the owner's placed tile sizes (bento-OWNER-SIZES-LATEST.jpeg)

"Your size don't match mine": the capture's a×b values are the owner's
placed sizes and supersede the flow's quantile drift (their capture has
slopcad 2x3 where the flow served 2x2, etc.). Authored in
`project-bento.tsx`:

- `OWNER_SPANS` — per-project placed footprints: workspace-welcome 3x3;
  context-builder, solard, migration-wp-to-nextjs, slopcad, stationio 2x3;
  sshm0, speaches-ui, speaches, parseArger, lmaafy 2x2; the narrow pair
  Formedible-main-baseline 1x1 + devbox-install 1x2. Unlisted projects
  keep the flow rung; renamed/removed projects fall back gracefully.
- `OWNER_ANCHORS` — the narrow pair pinned to the top-right mosaic column
  (grid col 12, rows 1 and 2-3), so the stack is exactly the capture's two
  tiles flush against line 1's 3-row height. Tile tier content follows the
  span rendered (a placed 2x3 reads as a feature card, as in the capture).
- `packMosaic` now places authored anchors first (obstacles), then ordered
  first-fit; the trailing-row centering shifts the whole group uniformly —
  the old per-tile guard left a 1-cell internal gap in the last row
  (spotted in the placements dump, fixed, verified gap-free).
- project-bento 10x12 → **10x9**: the pinned layout's content is ~8-9
  inner rows; 12 canvas rows inflated the rows ~1.5×. Rail widgets
  unchanged (health 2x4, stack mix 2x3; signals 2x4 in band 1).

Deployed DOM placements at 3440: chrome (0,0) 12x1 · signals-attention
(0,1) 4x4 · workspace-pulse (4,1) 6x4 · signals-mix (10,1) 2x4 ·
project-bento (0,5) 10x9 · vitals-health (10,5) 2x4 · vitals-stacks
(10,9) 2x3. Mosaic: line 1 = workspace-welcome 3x3 + context-builder/
solard/migration/slopcad 2x3 + anchored narrow pair (Formedible-main-
baseline 1x1, devbox-install 1x2); row 2 = stationio 2x3 + sshm0/
speaches-ui/speaches/parseArger/lmaafy 2x2 (six tiles, one row, capture
order); the rest flow-sized, last row centered gap-free.

Proofs: side-by-side
`.plans/session-widget-system/bento-SIZES-vs-DEPLOYED.png` (owner capture |
deployed, zoomed out, 3440); full shot /tmp/ww-shots/sizes2/b3440-full.png;
drag proof PASS (health↔signals cross-band swap verbatim, zero overlaps;
stacks drop verbatim); theme suite 6 pass × {bento 3440/1280/390/paper/
project, mc dash, meadow dash}; grep-invariants 7 pass; validate-layout
8 pass; check-types clean. pulse.tsx untouched (concurrent agent's).

NOTE: the narrow pair's NAMES follow the capture (Formedible-main-
baseline, devbox-install); the owner's message said "appart-limoges/
devbox-install" — the image wins. appart-limoges is flow-placed (last
row). Unpinned tiles' names/tiers follow the flow scan and can drift
between rescans; the pinned spans cannot.

## ROUND 12 — the organic mosaic (owner: "in its work everything is
aligned, not in mine")

The OWNER_SPANS round-11 snapping was the rejection: the owner's tiles sit
at irregular offsets with varied sizes and non-flush edges. Redone:

- Measured every visible tile's ACTUAL rectangle off the capture
  programmatically (native 3381x1272 decode, border-spike refinement; the
  first pass silently returned estimates — fractional pixel sampling →
  NaN comparisons — fixed with integer sampling). Measured native rects:
  line 1 y 656..1112 (h 456): ww x65 w663, cb x744 w453(→~436 after gap
  de-contamination), solard x1197 w437, migration x~1648 w453, slopcad
  x2104 w436; stack pair x2540: Formedible-main-baseline h184, devbox-
  install y876 h217 w212 (bottom 19px ABOVE line 1's — non-flush by
  design); row 2 y1129: stationio + sshm0/speaches-ui/speaches/
  parseArger/lmaafy, w436-437 each, bottoms cut in the capture.
- `OWNER_TILES` now holds these as PERCENT rectangles of the mosaic box
  (x/w of box width, y/h of box height) and the mosaic renders placed
  tiles `absolute` at those percents — irregular edges preserved, nothing
  snapped. Tile tier content follows the placed rect's implied rank.
- The 19 unplaced projects flow in a dense 12-col sub-grid starting at
  FLOW_TOP 60.6% (below stationio's 3-row body) — the step below the
  2-row larges is part of the organic placement (capture cut there).
- project-bento desktop 10x16 (the box aspect calibrated so the percent
  geometry reproduces the capture's 456-native line 1); tablet 6x11,
  phone 2x10 (ledger, unchanged).
- Numeric alignment check (border-spike scanlines, both images normalized
  to their boxes): vertical edges coincide within ±0.06% (≤1.6 real px),
  horizontal within ±0.18% (≤3 real px) — the rectangles coincide.
- Overlay diff: `.plans/session-widget-system/bento-ORGANIC-OVERLAY.png`
  (owner capture region | deployed container, same scale, 50/50 blend);
  side-by-side `bento-ORGANIC-vs-DEPLOYED.png`; full shot
  /tmp/ww-shots/organic/b3440-full.png.
- Gates on the final build: check-types clean; validate-layout 8 pass;
  grep-invariants 7 pass; theme suite 6 pass × {bento 3440/1280/390/
  paper/project, mc dash, meadow dash}; drag proof PASS (health↔signals
  cross-band swap verbatim, zero overlaps; stacks drop verbatim).
  pulse.tsx untouched (concurrent agent's).

## ROUND 13 — the annotated arrangement (bento-OWNER-ARRANGEMENT-LATEST.jpeg)

Owner red marks: "LESS HEIGHT !!!!" on the mosaic; "NOT SNAPPED" (three
arrows) on the rail widgets; the pulse's languages-by-repo view stays (the
pulse agent's file — untouched).

- **Mosaic height cut**: re-measured off the new capture — line 1 is 356
  native px (was 456), row 2 tops at 1041. project-bento 10x16 → **10x12**
  (the realized container 1201px vs the previous 1633 — the mosaic is
  ~26% shorter); OWNER_TILES re-fractioned to the new capture's absolute
  pixels over the realized container (line 1 h 29.64%, row 2 y 31.14%,
  the row-2 band flush at 60.78%), FLOW_TOP 62.1.
- **The rail went organic ("NOT SNAPPED")**: new `bento-rail` kind
  (rail.tsx) — a full-height host (2x16, rows 1-16) placing signal mix,
  workspace health and stack mix at their measured percent rects
  (`RAIL_TILES`): signal x2.89 (16px right of health's left edge —
  preserved), health y31.64, stacks y57.23 — the capture's absolute
  pixels reproduced exactly (DOM-verified: tops 0/543/982, heights
  488/422/290, lefts 16/0/0). Hosts: bento-signals, bento-health,
  bento-stacks (composed kinds, rendered internally). Below 14 rows the
  host degrades to a stacked column (tablet 6x12, phone 2x12).
- The rail's open bottom (below stack mix, ~26% of the host) is the
  capture's unseen region — content-sized remainder; the density probe
  passes (union 0.73 ≥ 0.70).
- The three rail kinds stay registered (the rail host composes them; the
  lab catalog keeps them).

Deployed DOM placements at 3440: chrome (0,0) 12x1 · signals-attention
(0,1) 4x4 · workspace-pulse (4,1) 6x4 · rail (10,1) 2x16 · project-bento
(0,5) 10x12.

Proofs: rail overlay `.plans/session-widget-system/bento-RAIL-OVERLAY.png`
(owner capture rail region | deployed host, same scale, 50/50 — the tile
rectangles coincide); mosaic overlay `bento-MOSAIC-OVERLAY.png` (the
reduced-height geometry coincides); placements table in this file and the
session log; drag proof PASS (attention across every band lands verbatim,
zero overlaps; the rail drop verbatim — closed-ranks compaction per the
round-5/6 model); theme suite 6 pass × {bento 3440/1280/390/paper/
project, mc dash, meadow dash}; grep-invariants 7 pass; validate-layout
8 pass (50 kinds); check-types clean. pulse.tsx untouched (concurrent
agent's; its languages-by-repo view is on the board as arranged).

## ROUND 14 — the fix list (bento-CORRECT.jpeg vs bento-SHIT-CURRENT.jpeg)

The owner's verbatim annotations, applied:
- needs attention "1 BLOCK HEIGHT LESS": 4x4 → **4x3**
- workspace pulse "1 BLOCK HEIGHT LESS": 6x4 → **6x3**
- signal mix "1 BLOCK HEIGHT LESS": 2x4 → **2x3** (its RAIL_TILES rect)
- right rail "this gap should not exist": health moved directly below
  signal mix (one grid gap), stack mix directly below health — RAIL_TILES
  y: signal 0 / health 26.52 / stacks 58.70 over the 2x15 host
- the mosaic starts one row higher: (0,5) → **(0,4)**; everything below
  shifts up; the rail host 2x16 → **2x15** (band 1's 3 rows + the 12-row
  mosaic) so the board bottom stays flush.

The organic treatments stand: the mosaic's OWNER_TILES percent rects are
unchanged (the tile geometry was already at the reduced height); the
rail's organic offsets preserved (signal x2.89). The pulse's contents are
the concurrent agent's — their newest view shows in bento-CORRECT.jpeg
and rides their file.

Deployed DOM placements at 3440: chrome (0,0) 12x1 · signals-attention
(0,1) 4x3 · workspace-pulse (4,1) 6x3 · rail (10,1) 2x15 · project-bento
(0,4) 10x12. Rail tiles: signal x2.89 y0 w97.11 h23.19 · health x0 y26.52
w100 h30.94 · stacks x0 y58.70 w100 h23.19.

Proofs: side-by-side
`.plans/session-widget-system/bento-CORRECT-vs-DEPLOYED.png` (CORRECT |
deployed, band-by-band match); full shot /tmp/ww-shots/final14/b3440-full.png;
drag proof PASS (attention below the mosaic verbatim, zero overlaps; the
rail drop verbatim); gates: check-types clean, validate-layout 8 pass,
grep-invariants 7 pass, theme suite 6 pass × {bento 3440/1280/390/paper/
project, mc dash, meadow dash}.

## ROUND 15 — REVERT to the round-13 state (owner: "the only fucking thing
that was fucking needed was sizing" — the round-14 re-banding was rejected)

The round-14 "fix list" changes are fully undone; the preset is back to
the round-13 board (the one that matched bento-OWNER-ARRANGEMENT-LATEST.jpeg
and passed the gate20 screenshot):

- signals-attention **4x4** (was 4x3) · workspace-pulse **6x4** (was 6x3)
- project-bento **(0,5) 10x12** (was (0,4))
- rail host **2x16** (was 2x15); the organic-mode threshold back to
  `rows >= 14`; bento-rail defaultSize **2x16**
- RAIL_TILES back to the round-13 organic offsets: signal x2.89 y0 w97.11
  **h28.44** · health x0 **y31.64** w100 **h24.59** · stacks x0 **y57.23**
  w100 **h16.90**
- mosaic OWNER_TILES unchanged from round 13 (line 1 h 28.48, row 2 y
  29.92, the row-2 band flush at 28.48+30.23, FLOW_TOP 60.3)

Deployed DOM placements at 3440 (verified): chrome (0,0) 12x1 ·
signals-attention (0,1) 4x4 · workspace-pulse (4,1) 6x4 · rail (10,1)
2x16 · project-bento (0,5) 10x12. RAIL %: signal x2.89 y0 w97.11 h28.44 ·
health x0 y31.64 w100 h24.59 · stacks x0 y57.23 w100 h16.90. Mosaic %:
the round-13 OWNER_TILES exactly (line 1 h 29.64, row 2 y 31.14, the
narrow pair at x 90.65/91.28).

Verification: full shot /tmp/ww-shots/revert/b3440-full.png (the board is
the round-13 board); placements dump above; gates: check-types clean,
validate-layout 8 pass, grep-invariants 7 pass, theme suite 6 pass ×
{bento 3440/1280/390/paper/project, mc dash, meadow dash}, drag proof
PASS (attention below the mosaic verbatim, zero overlaps; the rail drop
verbatim). Deployed via flock + service restart, HTTP 200.

STOP — no sizing changes on own initiative. The owner will mark the
deltas they want on this board; only those get applied.

## ROUND 16 — the owner's sizing deltas (bento-SIZING-DELTAS.jpeg, the
22:10 annotated capture)

The owner marked the deltas ON the current board; applied exactly these,
nothing else:

1. needs attention "THIS WIDGET IS TOO HEIGHT": 4x4 → **4x3**
2. workspace pulse "THIS WIDGET IS TOO HEIGHT": 6x4 → **6x3**
3. signal mix (rail) "1 BLOCK HEIGHT LESS": RAIL_TILES signal h 28.44 →
   **23.19** (3 rows)
4. rail "THIS SPACES ARE SHIT": health moved DIRECTLY below signal mix
   (one grid gap — RAIL_TILES health y 31.64 → **24.35**), stack mix
   directly below health (y 58.70 → **56.81**); health at the owner's
   placed size (h 31.30 ≈ 4 rows, "THIS WIDGET IS NOT THE CORRECT SIZE")
5. the mosaic and everything below shifted up by the freed row:
   project-bento (0,5) → **(0,4) 10x12**; the rail host 2x16 → **2x13**
   (band 1's 3 rows + the placed tiles, content-sized).

Nothing else changed — same widgets, same order, the organic mosaic
(OWNER_TILES) and its holes untouched, the rail's organic x-offset
(signal x2.89) preserved.

Deployed DOM placements at 3440: chrome (0,0) 12x1 · signals-attention
(0,1) 4x3 · workspace-pulse (4,1) 6x3 · rail (10,1) 2x13 · project-bento
(0,4) 10x12. RAIL %: signal x2.89 y0 w97.11 h23.19 · health x0 y24.35
w100 h31.30 · stacks x0 y56.81 w100 h23.19.

Proofs: side-by-side
`.plans/session-widget-system/bento-DELTAS-vs-DEPLOYED.png` (the marked
capture | deployed); full shot /tmp/ww-shots/deltas/b3440-full.png; gates:
check-types clean, validate-layout 8 pass, grep-invariants 7 pass, theme
suite 6 pass × {bento 3440/1280/390/paper/project, mc dash, meadow dash};
drag proof PASS (attention below the mosaic verbatim, zero overlaps; the
rail drop verbatim). Deployed via flock + service restart, HTTP 200.

STOP — no further changes without the owner's marks.

## ROUND 17 — DESTROY THE HOST (owner: "THESE ARE MULTIPLE FUCKING
SEPARATED WIDGETS")

The bento-rail host kind is DELETED (rail.tsx removed; the registry entry
removed). Signal mix, workspace health and stack mix are back to THREE
SEPARATE registered top-level widgets, each at its own grid position in
the 2-column right rail — no host, no nesting, no internal rects; grid
gap only between them; each individually draggable and sizeable.

Rail sizes measured from bento-OWNER-ARRANGEMENT-FINAL.jpeg (vs the
mosaic's 3-row line 1 = 350 native): signal mix 422 native ≈ 3.62 rows →
**2x4** (restored to its placed size, bigger than the 2x3); workspace
health 390 ≈ 3.34 rows → **2x3** (shorter than the 4-row now); stack mix
219 ≈ 1.88 rows → **2x2** (shorter). Health fills its own box (gauge +
the stat rows, the body distributing — no dead space).

Deployed DOM placements at 3440 (three rail entries, NO rail host):
chrome (0,0) 12x1 · signals-attention (0,1) 4x3 · workspace-pulse (4,1)
6x3 · project-bento (0,4) 10x12 · signals-mix (10,1) 2x4 · vitals-health
(10,5) 2x3 · vitals-stacks (10,8) 2x2.

Proofs: independence drag proof PASS — signal mix dragged ALONE
(10,1)→(10,11) lands verbatim at the ghost, zero overlaps; health and
stacks stay separate in the rail column (they compact upward per the
documented round-5/6 model — nothing teleports, no host to drag as a
block). Side-by-side
`.plans/session-widget-system/bento-SEPARATED-vs-FINAL.png` (the FINAL
capture | deployed). Gates: check-types clean, validate-layout 8 pass
(49 kinds), grep-invariants 7 pass, theme suite 6 pass × {bento
3440/1280/390/paper/project, mc dash, meadow dash}. Deployed via flock +
service restart, HTTP 200. pulse.tsx untouched.
