# exec-pulse-tabs — bento WORKSPACE PULSE tab rework (widgets/system)

Date: 2026-09-07 · Branch: widgets/system · Scope held: themes/bento/** (+ read packages/api)
File: `apps/web/src/widgets/themes/bento/widgets/pulse.tsx` (only file touched).

## Owner verdict driving this

The band's arrangement was right; the tabs were not. The AI tab was a giant
"$0.00 SUBSIDIZED AI COST" hero + four flat stat cards + one clipped leaders
bar — while the export carries the full census (byDay/byModel/byClient
breakdowns, cache/reasoning token classes, `unsubsidizedCost`). "All of the
tabs are pretty bad": every tab had to become dense, graph-driven, no
stretched filler.

## What each tab is now

- **AI usage** — rebuilt on the mission-control report-ai treatment, adapted
  to bento tokens (cyan `--bento-c2` input base, blue `--bento-c1` gradient
  output top):
  - figures row: `est. $ (unsubsidized)` leads (live scan: $1,909) with the
    subsidized `$0` fact as a small muted "subsidized · $0 charged" line —
    never a hero; `records` counts stay banned (owner). Right side: token
    total, per-day average, model count.
  - `byDay` timeline: tight-domain stacked in+out SVG bars (28 daily buckets
    on the scan report), peak day labeled ("peak 09-05 · 60.1M"), exact
    MM-DD axis (≤7 sampled ticks, middle ticks fold on narrow shells),
    per-day exact `<title>` tooltips.
  - ledger beside the chart: by-model census (fill-or-shrink bars, exact
    tokens, per-model est. $ when the CLI priced it) with a manual
    models/repoS toggle — repos = `aiUsageLeaders` (scan only). Client mix
    (zcode 99% · opencode 1%) rides the ledger head as a proportional
    segbar at ≥900px shells.
  - exact-totals footer: in / out / Σ / est. / cache / reas., one line —
    overflow clips the muted tail classes first, never in/out/Σ/est.
  - degradations: no breakdowns (old persisted exports) → honest in/out
    composition bar + repo leaders; usage null/zero → QuietLine. No invented
    data anywhere.
- **Activity** — three carousel views: cadence area graph (meta line now
  carries "peak <period> · <n>"), NEW "by repo" card (commits in window per
  repo, share %), month table (unchanged). A window with <3 buckets falls
  back to a commits-in-window figure (the repo report's single-bucket
  cadence no longer stretches a one-point line across the band).
- **Health** — segbar + severity census shared, then a DataCarousel: existing
  "signals" tally rows (now with affected-repo counts `31×` and inline
  summaries, capped at 8) + NEW "by repo" card (repos ranked worst-severity
  first, then summed signal value). Honest "no single repo flagged" empty state.
- **Code** — fixed a REAL overflow bug (language rows bled over the widget
  header at 6x3 — `min-width:auto` propagation; see structural fixes). Now a
  DataCarousel: "languages" (donut + fill-or-shrink rows, colors keyed by a
  global language→ramp-rank map so donut and bars agree) + NEW "by repo"
  card (top repos by lines, each with a stacked per-language composition bar
  on the same ramp).

## Structural fixes (root causes, not spot patches)

1. **Band-width escape** — `ReportTabs` sat as a flex item with
   `min-width:auto` in a row wrapper; any wide min-content inside (the
   health rows' nested nowrap summary ≈989px) blew the whole tab band out to
   viewport width (1279px inside a 567px box) — visible as the segbar/rows
   crossing the tile border. Fixed with `min-w-0` on the wrapper and the
   ReportTabs root; health label/summary now truncate as separate flex
   children.
2. **Vertical bleed** — every TabsContent is `overflow-hidden`; all ledger
   rows follow fill-or-shrink (`flex-1` + `max-h-12/14/16` + `justify-evenly`)
   so tall bands (12x5 project band) cap rows instead of stretching them
   into empty cards, and short bands shrink rows without voids.
3. **Container over viewport queries** — name/value/files columns key off
   `@[900px]` (the shell container), not `sm:`; the AI two-column grid opens
   at `@[520px]` so the 1280 dashboard rung (≈574px tile) still gets chart +
   ledger side by side. Figures row and footer are single-line
   (`whitespace-nowrap` + `overflow-hidden` + `min-w-0`) so wrapping can
   never eat the chart's height again.

## Carousel contract kept

Auto-cycle verified live on the deployed build: advances activity → health →
code → ai every 8s untouched; `hover` over the tile holds the tab across a
dwell; `prefers-reduced-motion` (agent-browser `set media reduced-motion`)
stops advancing entirely.

## Verification (final build)

- `pnpm run check-types` PASS (whole workspace).
- Deployed twice via `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build &&
  systemctl --user restart workspace-welcome.service'`; service active, pages 200.
- Harness `scripts/widget-check/run.mjs` — theme: OK 6 pass 0 fail on:
  bento dashboard 3440x1440 + 1280x800; bento project
  (`--path $PWD`) 3440x1440; mission-control dashboard 3440 + 1280 and
  project 3440; meadow dashboard 3440 + 1280. `grep-invariants.mjs` 7/7 PASS.
  - One FAIL: bento project @1280x800 no-inner-scroll on `project-surface`
    (file-browser tree pane) — the DOCUMENTED pre-existing owner-gated red
    (exec-runtime-bento.md: shared `components/file-browser` pane scrolls
    below ~857px-tall viewports; allowlist ships empty pending owner
    sign-off). Untouched by this diff; passes at 3440.
- Crops (before/after pairs) in `/tmp/pulse-tabs/before/` and
  `/tmp/pulse-tabs/after/`: dash + proj, each tab, 3440 and 1280. Highlights:
  AI tab 3440 = $1,909 est. + 28-day stacked bars + 6-model ledger +
  exact totals (was: $0.00 hero + 4 flat cards + clipped leaders bar);
  code tab 1280 rows no longer overlap the header; health fills with 5 tall
  rows + per-repo view.
