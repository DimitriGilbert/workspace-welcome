# exec-fixer-gate1 — the four visual-gate defects

Branch `widgets/system`. Scope: ONLY the four rejected defects; no commits, no
/designs touches. All fixes built, deployed (`flock /tmp/ww-redesign-build.lock
sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`, 3
iterations) and visually verified.

## Verdict fixes

### 1. Meadow project board — empty bottom half at 3440x1440 — FIXED

- `apps/web/src/widgets/themes/meadow/preset.ts` — project band re-authored to
  sum 12 mosaic rows on desktop (104px rows: 12·104 + 11·12 gap + page padding
  = 1436px ≈ the 1440 viewport): bento `8x7 → 8x12` (tabbed sections at full
  height), rail `header 4x3→4x4`, glance stays `4x4`, NEW rail card
  `meadow-report` at `4x4` below the glance. 8-col reflow: bento full width,
  rail cards re-pack as side-by-side pairs; 2-col: stacks. Both clean.
- `apps/web/src/widgets/themes/meadow/widgets/digests.tsx` — `MeadowReportDigest`
  title follows the report scope: repo → "Project report" (the rail placement),
  scan → "Workspace report" (dashboard unchanged). The kind's `requires:
  [workspace, report]` is satisfied on project pages (ProjectProvider nests
  WorkspaceProvider; validate-layout agrees).
- `apps/web/src/widgets/themes/meadow/widgets/project-sections.tsx` — the
  taller bento's panes fill (fill law): ActivityPane cadence panel `flex-1` +
  `CadenceArea min-h-40 flex-1` (was fixed `h-80`), history section stretches
  with the row (`overflow-hidden` caps long lists at the card edge),
  `CommitsList flex-1`, desktop row constrained `xl:grid-rows-[minmax(0,1fr)]`,
  and the momentum card wrapped in an auto-height `shrink-0` div (its
  ContextCard is `h-full` — unwrapped it claimed the whole column and
  collapsed the cadence chart to its header; caught on screenshot iteration 2).

### 2. MC project — commit pulse heatmap void — FIXED

- `packages/ui/src/components/heatmap.tsx` — opt-in `fill` prop: grid runs
  `1fr` column/row tracks and cells flex through the box instead of the
  centered capped-square mosaic. Default behavior (analytics) untouched.
- `apps/web/src/widgets/themes/mission-control/widgets/project-pulse.tsx` —
  the 2x2 rung passes `fill`; heatmap now spans the widget edge to edge above
  the intact stats row, at every rung.

### 3. MC 1280 — AI USAGE labels ellipsize — FIXED

- `apps/web/src/widgets/themes/mission-control/widgets/report-ai.tsx` —
  `LedgerRow` labels wrap (`min-w-0`, no `truncate`, `leading-relaxed`) instead
  of ellipsizing: an elided metric name is a lie. 1280 shows "TOKENS /
  RECORD", "COST / RECORD", "COST / 1K TOK" fully; the 3440 one-line ledger
  look is unchanged (labels only wrap when the box is narrower than the
  wording — no breakpoint guesswork).

### 4. MC 390 — vitals labels overlap — FIXED

- `apps/web/src/widgets/themes/mission-control/widgets/vitals.tsx` — below the
  560px container rung the six figures sit in a `grid-cols-3` (2 roomy rows,
  one label per cell — no flex-1 squeezing, no one-word-label collisions);
  from `@[560px]` up the design's single spread flex strip takes over, so
  1280/3440 are pixel-identical to before.

## Verification

- `pnpm run check-types` — PASS (all packages).
- `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user
  restart workspace-welcome.service'` — exit 0 (ran 3x during iteration).
- Harness (each `6 pass 0 fail`):
  - `node scripts/widget-check/run.mjs --theme meadow --page project --path
    /home/didi/workspace/workspace-welcome --viewport 3440x1440`
  - `--theme mission-control --page project --viewport 3440x1440`
  - `--theme mission-control --page dashboard --viewport 1280x800`
  - `--theme mission-control --page dashboard --viewport 390x844`
  - `--theme mission-control --page dashboard --viewport 3440x1440`
  - extra regression: meadow dashboard 3440 — 6 pass 0 fail.
- `node scripts/widget-check/grep-invariants.mjs` — 7 pass 0 fail (incl.
  validate-layout over the re-authored preset).
- Screenshots in `.plans/session-widget-system/shots/`:
  - `fixer-meadow-project-3440.png` — board fills the viewport; bento + 3-card
    rail; no beige bottom.
  - `fixer-mc-project-3440.png` — heatmap spans the widget; stats row intact.
  - `fixer-mc-dash-1280.png` — AI USAGE labels wrap fully, nothing clips.
  - `fixer-mc-dash-390.png` — vitals 3x2 grid, no overlaps.
  - `fixer-mc-dash-3440-regression.png`, `fixer-meadow-dash-3440-digests.png`
    — desktop dashboards unchanged.
  - `fixer-meadow-project-activity-tab.png` — Activity tab fills the tall
    bento (cadence flex + momentum card + full-height history).

## Still failing / honest notes

- Nothing known failing from the four verdicts. Minor accepted trade-offs:
  the meadow rail "Project report" card and the glance card render the repo
  report's actual state (stale badge visible for this project); the history
  table clips at its card edge if a repo's commit list exceeds the box (box
  wins, no inner scroller — same contract as the shell had).
