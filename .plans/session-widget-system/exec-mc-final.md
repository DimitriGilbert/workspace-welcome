# exec-mc-final — mission-control FINAL authoring (widgets/system)

Standard (final correction, authoritative): the deployed board must equal
`final-GETTING.jpeg` — same placements, same a×b per widget, intentional holes
included. `final-ASKED-for.jpeg` (no holes) is the rejected render, not a spec.
Everything else from the earlier waves stands (donut component, ledger, 1280).

## Placements table — derived from final-GETTING.jpeg, DOM-verified live

Derived by measuring the capture (3397px ≈ 0.88 scale of the 3440 viewport;
12-col grid, cell 96 + gap 12 → 108px row pitch; widget edges land on the
grid within ~15px capture blur):

| widget | node id | x | y | cols | rows |
|---|---|---|---|---|---|
| Fleet vitals | masthead | 0 | 0 | 4 | 1 |
| Activity | activity | 4 | 0 | 4 | 3 |
| AI usage | report-ai | 8 | 0 | 4 | 5 |
| Triage | triage | 0 | 1 | 4 | 3 |
| Code | report-code | 4 | 3 | 4 | 3 |
| Fleet ledger | ledger | 0 | 4 | 4 | 8 |
| Dirty leaders | dirty-leaders | 4 | 6 | 2 | 3 |
| Alerts | alerts-donut | 6 | 6 | 2 | 3 |
| Health | report-health | 8 | 5 | 2 | 3 |
| Stack mix | stack-mix | 10 | 5 | 2 | 4 |

Board = 12 rows. Intentional holes (authored, never filled): centre band
x4-7 rows 9-11 (4×3); below health x8-9 rows 8-11 (2×4); below stack x10-11
rows 9-11 (2×3) — the stepped bottom edge in the image (health ends at row 8,
stack at row 9).

DOM check (deployed render, `[data-widget]` attributes, 3440 and 1280):
placements read back EXACTLY this table; DOM rect overlap check = none.

## Change log (this wave)

- `apps/web/src/widgets/themes/mission-control/preset.ts` — FINAL-GETTING
  arrangement: every node carries its authored `at` anchor + the a×b above;
  tablet/phone v2 size overrides keep the flush re-banding (masthead 8x1,
  pairs 4x4/4x5 — packer-verified flush, zero overlaps).
- `apps/web/src/widgets/runtime/grid-canvas.tsx` (packRegion, ~1 line, see
  "runtime seam" below) — authored anchors pin the DESKTOP board only;
  narrower boards re-pack through the sizing law.
- `packages/ui/src/components/donut.tsx` — ring sizes to the box it is given
  (fill = min(boxW, boxH) capped by `size`); optional shape-aware `legend`
  slot (beside on wide containers ≥420px, stacked below as tight full-width
  rows on narrow ones); mount sweep animation on the arcs (dasharray flip
  post-paint, `motion-reduce:transition-none`); center figure 26px register.
- `fleet-ledger.tsx` — SIGNAL ÷4 (53→13 ratio; px-authored columns with
  per-column px content floors: 24-char names, 29-char branches never cut);
  always-short headers (ST BR U/D D A — the "UP/DIRTALR" collision register
  is gone); table floor = sum of content floors, below it the KvList register
  (compact stamps — fixes the "4 minut" mid-cut); row budget includes the
  canvas's 12px gaps.
- `vitals.tsx` — numerals 30px + labels 10px on the strip; strip threshold
  raised to an 800px container so the 1280 masthead uses the 2-row label grid
  ("DIRTY FI…" clip register is unreachable).
- `triage-board.tsx` — 34px rows (py-[7px]), budget includes gaps.
- `report-code.tsx` — donut+legend as one shape-aware unit; 13px language
  rows with 100px share bars; donut cap 280/300/320 by rung.
- `analytics.tsx` — alerts: donut (cap 200) beside the five rollup rows;
  stack mix: donut (cap 240) beside the three legend rows at the image's
  generous pitch; narrow containers stack via the shared Donut slot.
- `custom.css` — fleet ledger row rhythm back to the ui register (~33px);
  health rows ≈49px.

## Runtime seam (recorded per the standing instruction)

`packRegion` now honors authored `at` anchors at the desktop breakpoint only.
Rationale: an anchor carries a single shared `{x, y}`; the owner's arrangement
needs health y5 + stack y5 side by side at desktop, and any shared-y anchor
pair overlaps once the 12 columns clamp into 8 (tablet) — the format cannot
express "this arrangement at desktop, re-band below" without either a new
per-breakpoint anchor field or this scoping. The one-line scoping keeps the
narrower boards on the v2 sizing law (their flush banding is unchanged and
verified non-overlapping). No other theme uses anchors (grep-verified), so no
other surface is affected. If the format grows per-breakpoint anchors later,
this scoping is the line to revisit.

## Verification

- `pnpm run check-types` clean (all packages).
- Built + deployed: `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build &&
  systemctl --user restart workspace-welcome.service'`; service active, / 200.
- DOM placements = table above (3440 AND 1280; DOM rect overlap check: none).
- Proof: `proof-side-by-side.png` (final-GETTING top, deployed bottom);
  before/after crops under `spec-crops/` (cmp-*, cmp2-*, cmp3-*: per-widget
  regions at the FINAL footprints) and `shots/` (before-3440-root.png,
  before-1280.png, final2-3440-console.png, final2-1280.png).
- Truncation audit (DOM, 3440): only `report-ai`'s model label clips — the
  same row the owner's own captures truncate. Fleet names/branches/stamps,
  vitals labels, timestamps: zero clips. At 1280: triage alert messages
  truncate (pre-existing register with spare-width absorption, not in the
  named fixes); everything named in the orders is clean.

## Outside grants (not hacked)

- `packages/ui/src/components/chart.tsx` keeps its pre-existing
  `const animate = false` ("ui grant") — untouched. Order 6 is honored on the
  parts this wave touches: the reworked Donut carries the mount sweep; no
  animation was disabled anywhere.
- Runtime breakpoint boundaries (PHONE/TABLET queries) untouched; 1280 stays
  a desktop 12-column board, fixed inside the widgets' container ladders.
