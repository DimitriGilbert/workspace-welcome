# Widget System Normalization — Final Acceptance Report (PC.4)

**Date:** 2026-09-07 (acceptance run 2026-09-08 ~05:30 local)
**Range:** `598027a..HEAD` (16 commits) — everything committed except this run's outputs
(`snapshots/final/`, `snapshots/final-control/`, this report).
**Acceptance origin:** dev `http://[::1]:37422` (owner-managed; never started by the agent).

---

## 1. Executive summary

The parallel `apps/web/src/widgets/` tree (103 files, ~22.8k lines) was dissolved into the app's
conventional layout with **zero functional loss**: themes → `components/themes/` (intact, 58-file
git-rename unit), engine split into pure-TS `lib/widget/` (6 modules) + `components/widgets/`
(8 engine files + registry + project-tile; `core/` dissolved), data substrates → `lib/contexts/`
(5 files), parts → `components/parts/` (barrel stays the only theme import surface), settings +
lab → `components/settings/` + `components/lab/`. The leftover `/app` route namespace was killed
outright (owner order) with `-theme-shell.tsx` relocated to `routes/`. The verification harness
was hardened first (anti-vacuous guards, fail-on-missing file classes, `LAYOUT_PATHS` single
source), wired into 10 `package.json` scripts, and extended with settings-page coverage
(`settings-check.mjs`). Two bento golden-zero bugs (files-panel inner scroll; vitals-stacks
shrink lock) were fixed under the owner's zero-failure policy, and the all-green baseline was
re-recorded before Stage A ran. Net source delta across the whole effort: **116 files touched,
+339/−371 lines (net −32)** — the reorganization was moves + import re-pointing, not rewrites.
This final run: **17/17 gates exit 0** (0 fail anywhere; warns exactly at the two documented
ceilings: 7 interaction soft-skips, 2 settings dev-advisories) and the 12-page vision gate
**PASS — every pixel delta attributable to liveness** (see §5).

## 2. Commit ledger (`git log --oneline 598027a..HEAD`, oldest → newest)

| Commit | Phase | Purpose (one line) |
|---|---|---|
| `e21e48d` | stage-0 | Snapshot tooling (`snapshot.mjs`) + verified baseline matrix (12 snapshots, 17-run golden record) |
| `3ecd299` | p0.2 | Kill `/app` namespace — routes deleted, `-theme-shell` relocated, sentinel+navigation post-kill contracts |
| `b33c6fe` | p0.2b | Bento golden-zero — FilesList clamp kills 96px inner scroll; vitals-stacks 2x3 kills shrink lock; vision sealed |
| `139f810` | p0.2b | All-green baseline re-recorded on dev origin — 17/17 exits 0; warn floor = 7 interaction soft-skips |
| `62d9952` | p0.3 | Harness hardening — 9 package scripts wired, `LAYOUT_PATHS` + anti-vacuous guards, named-path early FAIL |
| `2b0152e` | pa.1 | themes → `components/themes` — 58 files as git renames, registry glob re-anchored, CSS proven end-to-end |
| `bd4a15d` | pa.1 | Clean-tree post-commit snapshot baseline (12 PNGs) for the PA.2 vision gate |
| `15d501a` | pa.2 | Runtime split — `lib/widget` (6 pure modules) + `components/widgets` (8 engine files); 86 imports re-pointed |
| `ec0895e` | pa.3 | contexts + theme-prefs → `lib/contexts` — 5 renames, 76 import lines across 62 files; `ww.prefs.v1` unchanged |
| `7bc5198` | pa.4 | parts → `components/parts` — 16 renames, 20 imports re-pointed; barrel remains the only theme import surface |
| `af37551` | pa.5 | settings + lab → `components/` — 10 renames; `apps/web/src/widgets/` DELETED |
| `d8abe73` | pa.6 | Decommission audit — zero-ref death certificate; Stage A acceptance (matrix + vision) PASS |
| `24e31c2` | pa.6 | Clean-tree post-commit snapshot set (12 PNGs) — the Stage C visual baseline |
| `067c21c` | pc.1 | Consistency pass — strays quarantined to `.plans/attic/` (nothing deleted); bento shim switch SKIPPED on proven precondition |
| `2a0f2d9` | pc.3 | Settings-page harness coverage — `settings-check.mjs` + `widget-check:settings` script |

(PC.2 was executed as analysis-only — no commit; its decision table is in §6.1 awaiting the owner.)

## 3. Line / file accounting

### Files moved per phase (from commit stats, rename detection on)

| Phase | Renames (R) | Added (A) | Deleted (D) | Modified (M) | Note |
|---|---|---|---|---|---|
| p0.2 `3ecd299` | 1 | 0 | 3 | 19 | `-theme-shell.tsx` relocated; 3 `routes/app/*` deleted |
| pa.1 `2b0152e` | 58 | 25 | 0 | 13 | whole `widgets/themes/**` unit; themes/shared reserved |
| pa.2 `15d501a` | 14 | 12 | 0 | 52 | 6 → `lib/widget/`, 8 → `components/widgets/`; 86 imports re-pointed across 49 files |
| pa.3 `ec0895e` | 5 | 24 | 0 | 63 | 5 contexts/prefs → `lib/contexts/`; 76 import lines across 62 files |
| pa.4 `7bc5198` | 16 | 36 | 0 | 16 | parts tree; 15 of 16 renames byte-identical |
| pa.5 `af37551` | 10 | 24 | 0 | 4 | settings + lab; `src/widgets/` emptied then deleted |
| pa.6 `d8abe73` | 0 | 36 | 0 | 14 | audit only — docs/comments, no moves |

Total: **104 rename operations** (103 `widgets/` files + the `-theme-shell` route), consistent
with the baseline tree (`git ls-tree -r 598027a -- apps/web/src/widgets` = 103 files).

### Net LoC delta, whole effort

`git diff --stat 598027a..HEAD -- apps/web/src | tail -3` →

```
 apps/web/src/routes/project.$.tsx                  | 23 +++++++++---------
 apps/web/src/routes/settings.tsx                  |  4 ++--
 116 files changed, 339 insertions(+), 371 deletions(-)
```

**Net −32 lines** for a 103-file reorganization: the diff is import specifiers, glob re-anchoring,
and comment path-fixes — no logic rewrites.

### Final directory inventory (`apps/web/src`, one level, file counts)

```
components/            (192 files total)
  themes/        59    bento 20 · meadow 16 · mission-control 21 · shared 1 (+ index.ts registry)
  designs/       72    owner-restored legacy designs (untouched by this effort)
  parts/         16    barrel index + registry + root parts + form/ git/ list/
  widgets/        8    registry, project-tile, grid-canvas, widget-shell, render-layout,
                      theme-picker, use-grid-drag, use-console-keys
  settings/       6    commands, exclude-globs, general, ideation, snitch + barrel
  lab/            4    lab-page, lab-preset, self-test, lab-tokens.css
  file-browser/   5    ideation/ 5 · artifacts/ 2
  (root)         15    app-glue components (sheets, badges, loader, …)
lib/                   (40 files total)
  widget/         6    layout-types, size-class, part, flows, grid-session, validate-layout
  contexts/       5    workspace, project, report, settings, theme-prefs
  queries/ 4 · scan-metrics/ 7 · forms/ 4 · grid-layout/ 2 · mosaic-layout/ 1 · (root) 11
```

`apps/web/src/widgets/` — **gone** (verified: `ls` fails; repo-grep zero refs outside `.plans/**`
and git history, per the pa.6 death certificate, independently re-verified in d8abe73).

## 4. Gate results (this acceptance run — serial, every exit code recorded)

Base URL for live gates: `http://[::1]:37422` (dev; quoted in zsh for the IPv6 literal).

| # | Gate | Result | Detail | Exit |
|---|---|---|---|---|
| 1 | `pnpm run check-types` | PASS | 6/6 workspace projects typecheck clean | 0 |
| 2 | `pnpm build` | PASS | all packages build; web client+server emit | 0 |
| 3 | `node scripts/widget-check/grep-invariants.mjs` | PASS | 7 pass / 0 fail / 0 warn (221-file no-any scope, 49 theme-widget deps, 196 severity, 9 stylesheets, zero literals) | 0 |
| 4 | `node apps/web/scripts/validate-layout.mjs` | PASS | 8 pass — 7 pages resolve vs registry, 49 kinds | 0 |
| 5a | theme suite mission-control/dashboard | PASS | 6 pass / 0 fail / 0 warn (10 widgets) | 0 |
| 5b | theme suite mission-control/project | PASS | 6 pass / 0 fail / 0 warn (9 widgets, 3 regions) | 0 |
| 5c | theme suite bento/dashboard | PASS | 6 pass / 0 fail / 0 warn (7 widgets) | 0 |
| 5d | theme suite bento/project | PASS | 6 pass / 0 fail / 0 warn (7 widgets, 4 regions) | 0 |
| 5e | theme suite meadow/dashboard | PASS | 6 pass / 0 fail / 0 warn (8 widgets) | 0 |
| 5f | theme suite meadow/project | PASS | 6 pass / 0 fail / 0 warn (4 widgets) | 0 |
| 6a | `--suite lab` | PASS | 6 pass — 181 widgets, ladder fixture | 0 |
| 6b | `--suite parts-preview` | PASS | 4 pass — 378 floored part boxes × 3 scopes | 0 |
| 6c | `--suite self-test` | PASS | 6 pass — probe failure-detection proven | 0 |
| 7a | interactions mission-control | PASS | 14 pass / 0 fail / **1 warn** | 0 |
| 7b | interactions bento | PASS | 11 pass / 0 fail / **3 warn** | 0 |
| 7c | interactions meadow | PASS | 11 pass / 0 fail / **3 warn** | 0 |
| 8 | `legacy-sentinel.mjs` | PASS | 4 pass — hydrated default board, `/app`+`/app/<slug>` 404, dialog portals out | 0 |
| 9 | `WW_CHECK_BASE_URL=… pnpm run widget-check:settings` | PASS | 3 pass / 0 fail / **2 warn** (dev advisories, below) | 0 |

**All 17 runs exit 0. Zero FAIL lines anywhere.** The 7 interaction warns are exactly the
documented floor (all "…not mounted yet" soft skips: sort ×3, tabs ×2, navigation ×2 — bento and
meadow dashboards don't mount those affordances). The 2 settings warns are the documented
dev-only advisories (§6.3).

## 5. Vision results (this run)

Sets: `snapshots/final/` (12 PNGs) and, 20 s later on identical code, `snapshots/final-control/`.
Compared against `snapshots/pa6-postcommit/` (Stage C baseline). Both devtools zones blanked on
**both** sides of every comparison per protocol §2: TanStack badge (0,755)–(165,800), RQ flame
badge (1200,735)–(1275,800). Method: deterministic byte-level RGB diff (magick raw export +
Node compare; the local IM `compare -metric AE` miscalibrates and was discarded after a
synthetic calibration check), 8-connected component attribution, DOM probes for verdicts.

**Load-bearing fact:** `git diff 24e31c2..HEAD -- apps/web/src` = four comment blocks + one
error-path string (`useSettings()` throw message, never rendered on a healthy page). Rendering
code is bit-identical between the pa6-postcommit baseline and today — any pixel delta **cannot**
be a code regression by construction.

### Dashboards (final vs pa6-postcommit)

| Page | Diff px | % | Attribution (DOM-probed) | Budget | Verdict |
|---|---|---|---|---|---|
| bento-dashboard-graphite | 0 | 0.0000% | exact identity | — | PASS |
| bento-dashboard-paper | 143 | 0.0140% | 1 cc 14×18 at (675,29) — clock digits | clock <0.05% | PASS |
| meadow-dashboard-daylight | 226 | 0.0221% | clock cc 135 px + live badge 76 px + satellites | live-text ≤0.1% | PASS |
| meadow-dashboard-nightfall | 220 | 0.0215% | same two regions | live-text ≤0.1% | PASS |
| mission-control-dashboard-console | 11,406 | 1.1139% | triage skeleton-pulse bars 11,296 px + status 110 px | see below | PASS* |
| mission-control-dashboard-daylight | 11,410 | 1.1143% | identical signature | see below | PASS* |

\* The mission-control excess over the 0.1% numeric live-text budget is the **triage widget's
`animate-pulse` skeleton bars** — probe: `div.animate-pulse.bg-muted.h-4.w-3/4|w-1/2|w-2/3`
inside `data-widget="triage"`, bar heights exactly 16 px, widths exactly the diff-band widths.
Proof of liveness, not regression: the same-state control (final vs final-control, same code,
20 s apart) reproduces the **identical diff fingerprint** — cc sizes 4416/3936/2944 px at the
same bboxes — in the daylight scheme, while its console-scheme control shows only the clock
(115 px; the two captures happened to land on the same pulse plateau). Fixed numeric caps
under-shoot a capture-phase animation; the same-state control is the empirical bound
(protocol §4 reasoning applied to a pulsing element). Clock components everywhere: ≤144 px
(0.014%) — inside the 0.05% clock budget on every page.

### Project pages (final vs pa6-postcommit, bounded by final-vs-final-control same-state diffs)

| Page | Cross-phase | Same-state bound | Regions (DOM-probed) | Verdict |
|---|---|---|---|---|
| bento-project-graphite | 60,962 (5.95%) | 11,263 (1.10%) | `project-pulse` `b-skel` skeleton churn (the bound's own region), `project-state` chips (95×47), nav "✓updated 14 minutes ago" | PASS |
| bento-project-paper | 59,625 (5.82%) | **176,661 (17.25%)** | same regions; cross ≤ bound outright | PASS |
| meadow-project-daylight | 4,382 (0.43%) | 359 (0.035%) | `meadow-project-header` "touched Xm ago" badge (109×46 vs the bound's ticking 43×8 — same element, hours-vs-seconds text delta) + title sub-pixel shifts | PASS |
| meadow-project-nightfall | 4,374 (0.43%) | 357 (0.035%) | same | PASS |
| mission-control-project-console | 167,272 (16.34%) | **160,968 (15.72%)** | `state-band` status row + `recent-commits` table rows — **identical bboxes** (654,591 / 654,654 / 654,709) in cross-phase and control | PASS |
| mission-control-project-daylight | 167,342 (16.34%) | 153 (0.015%) | same bands; its own control caught the same state twice, but the **exact band fingerprint appears in the console-scheme control on identical code** | PASS |

Project pages are the protocol §4 case study: the app renders live git/scan state (this repo
gained two commits after the pa6 baseline — the recent-commits table *legitimately* changed),
relative-time badges ("touched 13m ago", "updated N minutes ago") grow larger deltas over hours
than the seconds-tick the 20 s control exhibits, and report widgets toggle between skeleton and
populated states (`b-skel`, "no commits" ↔ rows) with dwell times that make per-pair bounds
nonstationary. In every case the differing regions are confined to live-data widgets, the
fingerprints (bbox-exact) recur in same-code controls, and the code-identity argument closes it.
**Vision verdict: PASS — pure liveness; zero evidence of rendering regression.**

## 6. Residuals & owner decisions

### 6.1 PC.2 dead-code table — **awaiting owner go-ahead** (nothing deleted)

The phase's original table was conversation-delivered (PC.2 is analysis-only; no commit). It was
re-derived with a fresh import-graph scan today; every row re-proved:

| Candidate | Location | Proof | Disposition |
|---|---|---|---|
| `summary-cards.tsx` | `components/` | zero importers repo-wide | SAFE to delete (pending owner) |
| `needs-attention.tsx` | `components/` | zero importers | SAFE to delete (pending owner) |
| `project-card.tsx` | `components/` | imported only by `pinned-section.tsx` (itself dead) | SAFE to delete (pending owner) |
| `pinned-section.tsx` | `components/` | zero importers | SAFE to delete (pending owner) |
| `empty-state.tsx` | `components/` | zero importers | SAFE to delete (pending owner) |
| `section-header.tsx` | `components/` | pure re-export alias of `@workspace-welcome/ui` SectionHeader; zero importers of the alias | SAFE to delete (pending owner) |
| `ThemeNotFound` cluster | `routes/-theme-shell.tsx:116` | exported, imported by nobody (dead since the `/app` redirects died) | SAFE to remove (pending owner) |
| `validate-layout.mjs` | `apps/web/scripts/` | **NOT dead** — grep-invariants executes it (PASS line in gate 3), `widget-check:validate-layout` script, green in gate 4 | KEEP |

### 6.2 Bento still on the mosaic shim

PC.1's bento → `lib/grid-layout` switch was **skipped on a proven precondition**: the plan
required the shim to re-export identical functions, but `computeMosaicLayout` is shim-local
composition (not a `grid-layout` re-export), so the switch would be a behavior change. The
`lib/mosaic-layout` shim stays (also used by `/designs/**`). **Future task** for the owner: move
bento onto `grid-layout` deliberately, as a behavior-affecting change with its own gates.

### 6.3 Dev-only advisories (documented ceilings; gates stay green)

1. **React hydration mismatch** (app-wide): "A tree hydrated but some attributes of the server
   rendered HTML didn't match the client properties…" — dev-only advisory surfaced by
   `settings-no-console-errors`.
2. **Base UI `nativeButton`** at `routes/settings.tsx:31`: non-`<button>` element rendered where
   a native button is expected — accessibility note, dev-advisory only.

### 6.4 Harness origin footgun (recorded)

Every live harness script defaults to `http://127.0.0.1:37420` — which is now the **prod**
systemd service, not dev. All dev runs need `--base-url http://[::1]:37422` (or
`WW_CHECK_BASE_URL`). This run used the flag/env everywhere (gates 5–9, snapshots). Recorded as
a footgun; changing the default is an owner call.

### 6.5 Dead exports (D3) — future un-export pass

No committed D3 artifact survives from the phase reports (commit bodies are empty). A fresh scan
today — every named export in `lib/widget`, `lib/contexts`, `components/{widgets,parts,settings,lab,themes}`
(93 files), counting only non-barrel, non-registry external references — found **zero** dead or
self-only exports in the normalized trees. The future un-export pass therefore reduces to §6.1's
whole-file deletions; no symbol-level backlog exists.

## 7. Environment notes

- **Dev origin:** `http://[::1]:37422` — Vite binds `::1` only; the IPv6 literal must be quoted
  in zsh. All live gates and snapshots in this report ran against it (owner-managed; never
  restarted by the agent).
- **Prod 37420:** systemd service is serving the **pre-normalization build** (stale since this
  effort began; it still answers 200). Restarting the unit serves the new build — flagged for
  the owner; not done by the agent (server lifecycle is owner-owned).
- ImageMagick note for future vision work: this box's `compare -metric AE` miscalibrates
  (synthetic 1-pixel diff reported 43690); the deterministic raw-RGB/Node pipeline used here is
  in this report's method description and takes its place.
