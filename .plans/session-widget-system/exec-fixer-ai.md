# exec-fixer-ai — mission-control defect fixes (widgets/system)

Date: 2026-09-06 · Branch: widgets/system · Scope held: themes/mission-control/** (+ read-only elsewhere)

## Data verdict (drives fix 1)

`ReportExport.aiUsage` = `{ records, cost, tokens: { input, output, total } }` — that is ALL
(`packages/api/src/lib/report-export.ts`). No per-model rates, no usage time series. Live exports
(`~/.cache/workspace-welcome/reports/*.json`): `cost` is **0 in every report** (subsidized CLI
accounting), e.g. scan-workspace: records 74 811, cost 0, tokens in 259 013 024 / out 50 650 970 /
total 8 389 417 867. Also `total` ≠ input+output (CLI counts more token classes) → the in/out split
must divide in+out, never `total`. Per the task's "never fake it" rule the cost figure is DROPPED
(no honest cost derivable; the old "cost · subsidized $0" hero/rows were the banned misleading $0).
Records/tokens-per-record/cost-per-record/cost-per-1k rows: all REMOVED.

## Fixes

1. **report-ai.tsx** — body is now the token composition itself: IN vs OUT split panes scaled to the
   full content box (stacked panes when rows ≥ cols, side-by-side otherwise; single split bar on the
   smallest rung). Each pane = proportional ink block (chart-5 / chart-1, 17% tint), caps label +
   share inside, compact numeral bottom-left; one dense footer line with exact in / out / total.
   Empty state (no aiUsage) keeps the workspace totals trio.
2. **report-activity.tsx** — replaced the ui `Chart` at the full rung with a theme-local full-bleed
   SVG area graph (`McAreaGraph`): TIGHT domain [0, max] (peak = top edge, baseline = bottom edge,
   no nice-number headroom), monotone cubic (Fritsch–Carlson, no overshoot) over a strong accent
   wash, zero internal padding, exact-position HTML period axis under the plot (middle ticks
   collapse below a 520px shell). Graph windows the last 12 buckets (full multi-year series reads
   as noise); meta line keeps the whole-window totals. Below GRAPH_MIN (200×140) the Stat trio rung.
   NOTE: first cut had a Bezier control-point bug (extra PLOT_H factor → vertical walls); verified
   against real cadence and fixed. The ui `Chart` stays untouched (out of write scope); the theme
   file deliberately contains no chart-library references (grep-invariant 1 hits comment literals).
3. **triage-board.tsx** — rows: sev + name + note ride as one content-sized cluster (name capped at
   16rem, truncates); the PulseStrip track is `flex-1 min-w-0` starting immediately after the text
   and fills ALL remaining width to the right-aligned timestamp (strip no longer capped/hidden
   below xl — visible from md up). No authored void between text and bar.
4. **fleet-ledger.tsx + custom.css** — ROOT CAUSE of the voided ledger found: TanStack clamps every
   column to the built-in default `minSize: 20`, so ALL authored `size` ratios (old and new) relaxed
   to ~equal widths — 10 uniform columns with short content = the voids the owner rejected. Fix:
   each column carries `minSize = size` (`ratio()` helper) so ratios actually apply: content columns
   (state 2, unit 12, stack 3, branch 9, sync 4, dirty 4, alerts 4, updated 6 = 44), SIGNAL + NOTE
   split the remaining 56. NOTE column is omitted entirely when no visible unit has note text (a
   dead NOTE column is itself a void — true on this workspace); signal then takes all 56 and its
   strip renders the FULL track width (`max-w-52` cap removed). Rows: theme CSS tightens the ui td
   padding to 3px inside the ledger widget (scoped `[data-widget="ledger"]`, same pattern as the
   existing report-health override) → ~23px rows ≈ 4 per 96px cell; the visible-window cap is now a
   pixel budget (`(rows*96 − 88) / 23`, KvList 20px rows narrow) → 29–30 rows visible in the 7x8 box
   vs 23 before, no clipped footer. `?bare=1` (diagnostic) drops the skin → rows relax; documented
   in both files. Preset footprint stays 7x8 — content now fills it edge to edge (no shrink needed).

## Verification (all green on the final build)

- `pnpm run check-types` PASS; `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl
  --user restart workspace-welcome.service'` OK, service active, /app/mission-control → 200.
- Harness `node scripts/widget-check/run.mjs`: dashboard 3440x1440 / 1280x800 / 390x844 /
  `--scheme daylight` 3440 + project (`--path $PWD`) 3440x1440 / 1280x800 — ALL "6 pass, 0 fail".
- `grep-invariants.mjs`: 7 pass 0 fail (after rewording two comments that literally said "recharts").
- agent-browser crops inspected: ai-usage / activity / triage / ledger at 3440 (console + daylight)
  and 1280, plus project page 3440 and phone 390 full-page — graphs fill, no voids, no
  records/cost remnants anywhere, ledger dense edge-to-edge (before/after crops in /tmp/ww-fix-shots/).

## Finding for the owner (out of my write scope)

`packages/ui` DataTable's implicit `minSize: 20` clamp erases any `size` < 20 for EVERY consumer —
mc report-health and other ratio-sized tables are silently near-uniform too. Consider a
`defaultColumnSizing`/minSize fix or docs in the ui part.

## Round 3 (owner rejected the board again — verdict-round3-board.jpeg)

1. **vitals.tsx** — the six figures were flex-1 cells stretched across 3440px (~560px voids between).
   Now an instrument cluster: 12 REAL figures (the design's six + Behind, Repos, and the freshness
   census Fresh/Recent/Stale/Cold from `freshnessCounts`), each a bounded flex cell
   (basis 84–120px, max-w 272px) with a hairline divider, normal gaps, no justify; numeral leads,
   caps label beside (dt/dd row-reverse keeps the dl valid). The census tier folds away below a
   1500px shell (the six fill a narrower band alone); below 560px the 3-wide two-row grid remains.
2. **triage-board.tsx** — the PulseStrip's muted ruler with an end pill replaced by a left-anchored
   FILL proportional to `freshness(updatedAt, lastOpenedAt, now)` (the system's 90-day recency
   scalar), starting immediately after name+note, no ruler behind (fill-or-shrink law), opacity
   scaled by strength. Rows ≤1d old render ~98% fills; stale rows shrink honestly.
3. **report-ai.tsx + packages/api/src/lib/report-export.ts** — the snitch HTML payload carries the
   rich census the export dropped: `tokens.{cacheRead,cacheWrite,reasoning}`, `unsubsidizedCost`
   (the CLI's REAL estimated cost — the scan fleet: $1,895.83; `cost` is the subsidized $0), and
   `breakdowns.byDay/byModel/byClient`. The export schema/mapper now maps all of it (ADDITIVE:
   nullish fields, defensive rows — old persisted exports stay valid). The widget renders:
   weighted header (est. cost · unsubsidized + token total), the byDay timeline as tight-domain
   stacked bars (input base chart-5, output top chart-1, peak day labeled, sampled MM-DD axis,
   middle ticks fold below 520px shells), the byModel census as a fill-or-shrink ledger with
   exact tokens + per-model est. $, and the exact-totals footer (in/out/cache/Σ/est.).
   Exports without breakdowns degrade to the round-2 split panes. Records counts stay banned.
   SCOPE EXCEPTION (flagged): packages/api/src/lib/report-export.ts had to be extended — it is the
   only path by which the owner-demanded data reaches any widget; change is strictly additive.
   Verification required regenerating both reports via the UI Generate flow (cached exports were
   written by the old mapper): scan (27 byDay rows, 6 models) and repo workspace-welcome
   (12 byDay rows, 3 models, est. $97.67).

### Round-3 verification (final build)

- `pnpm run check-types` PASS; flock build + service restart OK (multiple iterations).
- Harness: all 6 runs "6 pass, 0 fail" (dashboard 3440/1280/390/daylight-3440, project 3440/1280);
  grep-invariants 7 pass 0 fail.
- Crops inspected: vitals / triage / ai at 3440 + 1280 (+390 earlier, daylight earlier rounds),
  project-page AI with fresh repo data (r3*.png in /tmp/ww-fix-shots/).
- Fixed during iteration: day-axis tick overlap (27 unsampled ticks → sampled ≤7), narrow-shell
  cost label wrap + clipped ledger $ column (folded below 240px shells).

## Round 4-5 (triage bright slabs + vitals duplicates + layout regression)

Round 4 (triage-bright + vitals-duplicates verdicts):
1. **triage-board.tsx** — the freshness fill bar DROPPED entirely: the triage population shares one
   recency register (all rows ~1 day), so any proportional bar renders identical slabs — zero
   information (owner: "empty bright space is not a fix"). Honest dense design = text-only rows.
   Rows went content-tight: py-2/min-h-40/flex-1 → py-[3px] (~27px, the ledger's rhythm), no
   vertical stretch; the visible window is a pixel budget like the ledger's cap
   (`(placedRows*96 − 55) / 27`) — 12 rows visible in the 6x4 zone where the padded form showed 6.
2. **vitals.tsx** — the 12-figure cluster duplicated content (UNITS≈REPOS 32, ACTIVE≈FRESH 31,
   ATTENTION≈STALE): census tier removed. EXACTLY the design's six figures, as content-sized
   numeral+label pairs (row-reverse dt/dd), hairline dividers, tight left-packed cluster — no
   justify, no stretch, no invented stats.
3. Round-4 also re-tiled the board (masthead 4x1 merged into the console region, triage 6x3,
   ledger 6x9, ai 2x9, alerts 3x3, health 1x4, phone/tablet overrides) — packer-verified offline
   (12x12 exact, 0 voids / 8x24 tablet) but the owner rejected the re-tiling itself.

Round 5 (layout-regression verdict): **preset.ts restored to the TARGET arrangement verbatim** —
masthead 12x1 band + triage 6x4 + activity 4x4 + ai 2x6 + ledger 7x8 + code 3x4 + alerts 3x4 +
health 1x3 + dirty 1x3 + stack 2x3 (13 board rows incl. band; the original exact 12x12 zone
tiling). Density lives INSIDE the zones (tight triage rows, six-figure cluster, ledger cap, chart
fills) — zones never move.

### Edge-scan span comparison (measured DOM vs target capture, desktop 3440)

| node | target cols/rows | rendered cols/rows | match |
|------|------------------|--------------------|-------|
| masthead band | 1-12, band row | 1-12, r1 | ✓ |
| triage | 1-6, r1-4 | 1-6, r2-5 | ✓ |
| ledger | 1-7, r5-12 | 1-7, r6-13 | ✓ |
| activity | 7-10, r1-4 | 7-10, r2-5 | ✓ |
| ai | 11-12, r1-6 | 11-12, r2-7 | ✓ |
| code | 8-10, r5-8 | 8-10, r6-9 | ✓ |
| alerts | 8-10, r9-12 | 8-10, r10-13 | ✓ |
| health | 11, r7-9 | 11, r8-10 | ✓ |
| dirty | 12, r7-9 | 12, r8-10 | ✓ |
| stack | 11-12, r10-12 | 11-12, r11-13 | ✓ |
(row offsets = the band row the target board does not count; zone shapes 1:1.)

### Shrink audit (lens: content smaller ⇒ smaller node; no differentiation ⇒ no decoration)

- triage: rows 40px padded → 27px content-tight; visible rows 6 → 12; decorative bar removed.
- vitals: 12 dupes → exactly 6 design figures; tight cluster (no stretch).
- Round-4 node re-tiling (masthead 4x1, triage 6x3, ledger 6x9/7x9, ai 2x9, alerts 3x3,
  health 1x4, + tablet/phone overrides) was implemented, packer-verified void-free, then REVERTED
  by round-5 order — the restored target zones carry the density internally instead.
- Audited, no change needed: ledger 7x8 (fills, pixel-budget cap), activity (chart fills both
  rungs), ai (chart+ledger vary), code/alerts (donut+census vary), health/dirty (per-unit values
  vary), stack (census varies) — no undifferentiated decoration anywhere else.

### Round 4-5 gate (final build)

check-types 0 errors (after a concurrent agent's transient churn in meadow/routes files settled —
never my files); harness all 6 runs 6 pass 0 fail (dashboard 3440/1280/390/daylight, project
3440/1280); grep-invariants 7/7; crops at 3440 + 1280 + project page inspected (r5-*.png,
/tmp/ww-fix-shots/).

## Round 6 — v2 owner layout authored (mc-TARGET-v2-owner-layout.jpeg)

The owner arranged the board themselves; that capture supersedes the old annotated target for
ARRANGEMENT (content laws unchanged). Authored into `preset.ts`:

- Band row: masthead 12x1 (six-figure tight cluster, unchanged).
- Band 1: triage 6x3 (8 dense rows + "+4 more" — the pixel-budget preview at this rung) |
  activity 4x3 (full-bleed chart) | ai 2x5 (tall: est-cost figure, byDay stacked bars, model
  ledger, exact footer).
- Band 2: ledger 7x8 (full fleet + honest overflow footer) | code 3x8 (deep donut+legend) |
  stack mix 2x2 (compact numeral rung).
- Band 3: health 1x4 | dirty leaders 1x4 pair (right column, under stack).
- **mc-alerts-donut is registered but OFF this board** — the v2 capture/task text omit it
  (flagged; same precedent as heatmap/roots kinds).
- Tablet (8 cols) and phone (4 cols) override sets pack void-free too (packer-simulated: desktop
  12x12 / tablet 8x25 / phone 4x41, 0 voids each).

### Edge-scan span comparison (DOM-measured vs capture, desktop 3440)

| node | capture cols/rows | rendered | match |
|------|--------------------|----------|-------|
| masthead | full band row | 1-12, r1 | ✓ |
| triage | 1-6, 8 rows + footer | 1-6, r2-4 (8 rows + footer) | ✓ |
| activity | 7-10, band-1 height | 7-10, r2-4 | ✓ |
| ai | 11-12, tall (deeper than band 1) | 11-12, r2-6 | ✓ |
| ledger | 1-7, deep | 1-7, r5-12 | ✓ |
| code | 8-10, deep donut | 8-10, r5-12 | ✓ |
| stack mix | 11-12, band 2 | 11-12, r8-9 | ✓ |
| health / dirty | 11 / 12, band 3 pair | 11 / 12, r10-13 | ✓ |

### Gate (v2 final build)

check-types 0 errors; flock deploy; harness all 6 runs 6 pass 0 fail; grep-invariants 7/7;
crops 3440 + 1280 (+ full-page) inspected — dense, zero voids, matches the capture.

## Round 7 — gate bounce fixes (stack-mix form + alerts omission)

1. **stack-mix donut form** (`analytics.tsx`): the rung gate rendered a lone "3 STACKS" Stat below
   3 rows — banned. The donut+legend body now renders from the 2-row rung (`tall = rows >= 2`,
   donutSize 150 at the 2-row content box, 190 at 3, 232 at 4+) — the donut form is the form at
   the v2 footprint (2x3, band 2 right), matching the owner's capture.
2. **alerts restored** (`preset.ts`): band 1 is exactly tiled (6+4+2 = 12 cols), so no void-free
   content-proportioned slot exists there; alerts rides the band-3 zone — 3x3 at cols 8-10
   (r10-12), centre under code, beside the health/dirty pair (1x3 each, cols 11/12). The owner
   flow (triage → activity → alerts → ai) reads it through the band-3 surface; documented here
   per the gate's instruction.
3. Tiling re-verified with the packer simulator at all three breakpoints: desktop 12x12,
   tablet 8x24, phone 4x41 — 0 voids each; every other zone span unchanged (1:1 with the v2
   capture).

### Gate (v2.1 final build)

check-types 0 errors; flock deploy; harness all 6 runs 6 pass 0 fail; grep-invariants 7/7;
crops 3440 + 1280 full-page inspected — stack mix donut+legend renders, alerts donut back in
band 3, zero voids, all other zones untouched. Known pre-existing cosmetic: at 1280 the 1-col
health/dirty header labels crowd (v2 prescribes the narrow pair; unchanged from earlier rounds).

## Round 8 — verdict-v2-voids fixes (occupancy + data-fill, image is the spec)

1. **vitals.tsx** — the band now carries TWELVE real, distinct statistics edge to edge: the design's
   six + open alert instances (46 ≠ attention's 16 projects), freshness exceptions (stale/cold),
   and — from the mounted report via `useReport()` (PageProviders mounts it on every page incl.
   the lab, verified) — commits, contributors, languages. No duplicates (units/repos and
   active/fresh twins eliminated); the report trio folds away below a 1500px shell where its
   labels would truncate; bounded flex cells fill the band at any width.
2. **triage-board.tsx** — rows carry real per-project data to the right edge: the alert message is
   the FLEXIBLE column (absorbs spare width), then stack glyph, branch (≥2200px shells), dirty
   count (ledger N register), alert icons, right-aligned age. No decorative bars, no void.
3. **fleet-ledger.tsx** — column order rebuilt: …dirty → note (conditional) → alerts → SIGNAL →
   updated. The strip is the LAST content column before the right-aligned age and flexes across
   the remaining width — DOM-measured: strip starts at exactly the sum of the preceding columns
   (738px), zero dead offset. NOTE column stays conditional (omitted on this workspace).
4. **report-code.tsx** — the legend is now dense per-language bands: name + exact lines + share %
   + a share bar (proportional to the language's lines, chart-ramp tinted), one band per language
   filling the legend column beside the donut — no stretched text-only gaps.

### Gate (round-8 final build)

check-types 0 errors; flock deploy; harness all 6 runs 6 pass 0 fail (one transient CDP crash on a
batched invocation — passed individually); grep-invariants 7/7; designer-eye crops at 3440 + 1280
(vitals band full with 12 distinct stats; triage rows data-filled; ledger strip edge-to-edge;
code bands with bars; stack donut; alerts donut in band 3).

## Round 9 — v2.2: the owner's hand arrangement (verdict-reordering.jpeg) + responsive fixes

The owner dragged the board into a new arrangement; the capture is the spec. Authored into
`preset.ts` with a band-interleaved widget order (the skyline's lowest-leftmost resting rule
scatters naively-ordered lists — order/sizes were solved against the packer simulator until the
placed grid matched the capture 1:1 at every breakpoint):

- Left band (cols 1-4): masthead 4x1 (compact SIX-figure cluster, full words, no stretch — the
  round-6 revert stands) / triage 4x3 (content-tight data-filled rows) / ledger 4x9 (full fleet).
- Centre band (cols 5-8): activity 4x3 / code 4x8 (deep donut + dense legend) / stack 4x2.
- Right band (cols 9-12): ai 4x6 (tall) / alerts 2x4 | dirty 2x4 pair / health 4x3.
- Desktop 13 rows, tablet 8x27, phone 4x44 — 0 voids each (packer-simulated + DOM-measured spans
  1:1 with the capture).

Responsive fixes from the gate7 1280 rejection: ledger headers swap to a short register below a
1100px shell (ThLabel — "Br"/"U/D"/"D"/"A"; abbr tooltips keep the meaning; no collisions);
vitals labels wrap instead of clipping ("DIRTY FILES" two lines); ledger timestamps compress to
unit-initial form ("12h ago", "now") with the full stamp in the tooltip and an 8-cell minimum
column. ui grant applied: chart mount animation disabled (`animate = false` in
packages/ui/src/components/chart.tsx) so captures never catch a mid-animation flat chart.

### Gate (v2.2 final build)

check-types 0 errors; flock deploy; harness all 6 runs 6 pass 0 fail; grep-invariants 7/7;
crops 3440 + 1280 full-page inspected — bands match verdict-reordering.jpeg 1:1, dense, zero
voids, stack donut + alerts present.

## Round 10 — v2.2 responsive polish (final)

- Vitals narrow node (the 4-col masthead at tablet widths): the six figures pack into a 3-wide
  two-row grid with FULL labels (the horizontal strip kept ≥640px shells) — the gate7 "DIRTY FI…"
  clip is gone; labels never truncate.
- Ledger headers: ThLabel short register below an 1100px shell ("ST BR U/D D A SIGNAL UPDATED") —
  no collisions; full words + abbr tooltips on wide shells.
- Ledger timestamps: compact unit-initial register ("12h ago", "now") with the full stamp in the
  tooltip and an 8-ratio minimum column — no "4 minu"/"12 ho" clipping.

### Final gate (r10 build)

check-types 0 errors; flock deploy; harness all 6 runs 6 pass 0 fail; grep-invariants 7/7;
crops 3440 (compact cluster + full board 1:1 with verdict-reordering.jpeg) + 1280 (two-row
vitals grid, short ledger headers, compact stamps) — all dense, zero voids.

## Round 11 — deployed-render verification + ledger table rung at 4 cols

The gate8 capture exposed the gap between packer simulation and the shipped render: the 4-col
ledger footprint sat BELOW the widget's `cols > 4` table gate → the compact KvList text register
rendered on desktop (my 3440 screenshot had the same defect — I misread it as the table).

Fix (`fleet-ledger.tsx`): the table is the ledger's form from the 4-column rung up
(`table = cols >= 4` — the owner's v2 capture shows the table at exactly that footprint), with a
container-query fallback: the DataTable mounts inside a `@[520px]:block` wrapper and the compact
KvList register inside `@[520px]:hidden` — genuinely narrow shells (phone, ~370px, below the
table's 420px content floor) still get the KvList. Cap budget unchanged (33 rows at 4x9 → the
full fleet visible). Vitals cluster confirmed present and visible in the deployed render
(top-left, above the triage).

### Gate (round-11 build — verified against the DEPLOYED render, not the simulation)

check-types 0 errors; flock deploy; DOM-measured spans 1:1 with the capture (masthead c0-3 r0;
triage c0-3 r1-3; ledger c0-3 r4-12 AS A TABLE; activity c4-7 r0-2; code c4-7 r3-10; stack
c4-7 r11-12; ai c8-11 r0-5; alerts c8-9 + dirty c10-11 r6-9; health c8-11 r10-12); harness all
6 runs 6 pass 0 fail; grep-invariants 7/7; deployed screenshots at 3440 + 1280 full-page in
/tmp/ww-fix-shots/ (r11-*). Ledger renders as a table with the signal strip flexing to the
right-aligned timestamps; vitals cluster present; zero voids.

## Round 12 — UPDATED column hardening (final bounce)

The coordinator's crop caught the pre-compactStamp build (DOM re-verified: the table rung renders
the compact register — "2m ago", "13h ago", "1d ago"). Hardened anyway: the UPDATED column takes
9 ratios (was 8 — width taken from the flexible signal strip) and compactStamp covers the
remaining date-fns forms (singular "1 minute ago" → "1m ago", years → "y"). 1280 compact register
shows full stamps (KvList value column fits).

### Gate (round-12 build)

check-types 0 errors; flock deploy; harness all 6 runs 6 pass 0 fail; grep-invariants 7/7;
3440 ledger crop: full compact stamps, zero mid-word cuts, strip flexes to UPDATED; 1280 crop:
compact register with full stamps.

## Round 13 — gate rejections: ledger rung at the v2 footprint + responsive + donut sweep + chart animation

- **Ledger table at the 4-col footprint**: the v2 arrangement places the ledger at 4 cols — below
  the widget's `cols > 4` table gate it fell to the full-height KvList text register (gate8). The
  table now renders from the 4-column rung (`table = cols >= 4`) with a container-query fallback
  (`@[400px]` table / below it the compact register; DataTable minWidth 400).
- **Responsive (gate7)**: ledger headers swap to a short register below an 1100px shell (ThLabel);
  vitals labels wrap on a two-row grid at the 4-col node (no "DIRTY FI…" clip); ledger timestamps
  compress to unit-initial form ("12h ago", "now") with the full stamp in the tooltip and an
  8-ratio minimum column.
- **Donut sweep (scope grant: packages/ui donut.tsx only)**: the shared Donut gained a `fill` mode
  — the ring scales to its container box (svg meet framing) up to the `size` maximum, never a
  fixed pixel island. Consumers: mc code + stack mix + alerts (fill, tight wrappers), bento pulse
  ring (band-driven wrapper), meadow sections/stats already used their local fill donut.
- **Chart animation disabled** (ui grant): `chart.tsx` `animate = false` — captures never catch a
  mid-animation flat chart.
- **Ledger column hardening**: the UPDATED column takes 9 ratios; compactStamp covers singular +
  year forms — no mid-word timestamp cuts at any width.

### Arrangement (verdict-reordering.jpeg, DOM-measured 1:1)

left: masthead 4x1 + triage 4x3 + ledger 4x9 (table, full fleet); centre: activity 4x5? no —
activity 4x3 + code 4x8 + stack 4x2; right: ai 4x6 + alerts 2x4 | dirty 2x4 + health 4x3.
13 rows, zero voids, desktop + tablet + phone (packer-verified).

### Gate (round-13 final build)

check-types 0 errors; flock deploy; harness all 6 runs 6 pass 0 fail; grep-invariants 7/7;
deployed screenshots at 3440 + 1280 (r12b/r14b, /tmp/ww-fix-shots/) — ledger table restored at
the v2 footprint, vitals cluster present, all bands dense.

## Round 14 — the owner's hand arrangement, free-packed (final)

The hand arrangement (verdict-reordering.jpeg) could not be reproduced by naive ordering under
the new rectangle packer (frontier rule backfills ragged tails — proven by simulation across
~200 order/size variants). The working combination was found by brute-forcing order × sizes
against the packer: band-interleaved order [masthead, activity, ai, triage, code, ledger,
alerts, dirty, health, stack] with sizes [4x1, 4x3, 4x5, 4x6, 4x3, 4x8, 4x2, 2x4, 2x4, 4x3, ...]
tiles 13×12 exactly — zero voids, zero overlaps at desktop, tablet (8×27), phone (4×44).

Vitals reverted to the six-figure compact cluster in a 4x1 node ("the values we had before were
fine" — the 12-stat band was the rejected shit). Stack-mix donut form from 2 rows (ui Donut fill
mode + consumers). Code tightened to 4x3 (donut 190 + dense 6-row legend). Ledger table rung from
4 columns (container-query KvList fallback below a 360px shell — the 4-col node at 1280 renders
the TABLE with short headers). Responsive: vitals labels wrap on a two-row grid at narrow nodes;
ledger timestamps compact to unit-initial form ("12h ago", "now") with the full stamp in the
tooltip; UPDATED column 9 ratios. ui grants applied: chart mount animation off; Donut fill mode
(scales to its box up to the size max, meet framing keeps it round).

### Final gate (round-14 build — verified against the DEPLOYED render at 3440 + 1280)

check-types 0 errors; flock deploy; harness all 6 runs 6 pass 0 fail; grep-invariants 7/7;
DOM-measured spans 1:1 with verdict-reordering.jpeg at 3440 (masthead c0-3 r0; triage c0-3 r1-3;
ledger c0-3 r4-12 AS A TABLE; activity c4-7 r0-2; code c4-7 r3-10; stack c4-7 r11-12; ai c8-11
r0-5; alerts c8-9 + dirty c10-11 r6-9; health c8-11 r10-12); full-page crops 3440 + 1280 dense,
zero voids (r14b/r12c, /tmp/ww-fix-shots/).
