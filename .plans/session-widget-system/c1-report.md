# C1 — Compliance report (widget-system)

Agent: C1 (no vision — harness/DOM-eval/grep only). Tree: branch `widgets/system` @ `4adb333` (HEAD, "docs(plan): V3 GREEN…"), clean of unstaged product changes (untracked: phase reports only). Report file is untracked; nothing committed, `.plans/` master-plan untouched.

## 1. Gatekeeping (§5 standard gate)

| Gate | Result |
|---|---|
| `pnpm run check-types` | GREEN (6/6 projects) |
| `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'` | GREEN — one deploy; service `active`; `http://192.168.1.41:37420` reachable, `/app/*` 200 |
| Harness self-test (`--suite self-test`) | 6/6 probes correctly FAIL the known-bad lab panel — detection proven |

Deploy SHA under test: build of `4adb333`. Base URL for all runs: `http://192.168.1.41:37420`; project rows use `--path /home/didi/workspace/workspace-welcome`.

## 2. Probe matrix — 6 addresses × 3 viewports (run.mjs, full 6-probe set)

Legend: each cell is the aggregate of no-inner-scroll, density, token-completeness, portal-scope, placement, part-min.

| Theme | Page | 3440x1440 | 1280x800 | 390x844 |
|---|---|---|---|---|
| mission-control | dashboard `/app/mission-control` | PASS | PASS | PASS |
| mission-control | project `/app/mission-control/project/home/didi/workspace/workspace-welcome` | PASS | PASS | PASS |
| bento | dashboard `/app/bento` | PASS | PASS | PASS |
| bento | project `/app/bento/project/home/didi/workspace/workspace-welcome` | PASS | PASS | **FAIL** |
| meadow | dashboard `/app/meadow` | PASS | PASS | PASS |
| meadow | project `/app/meadow/project/home/didi/workspace/workspace-welcome` | PASS | PASS | PASS |

**17/18.** The single FAIL: `part-min [bento] horizontal overflow: content is 79px wider than the scope` — deterministic (79px on two consecutive runs; `?bare=1` variant 77px). All other 5 probes pass on that address; all other 17 address×viewport cells pass all 6 probes.

## 3. Interaction suites (interactions/run.mjs, 1440x900)

| Address | Scripts | Result |
|---|---|---|
| mc dashboard | filter, sort, tabs, navigation, console-keys, drag-resize | OK — 14 pass / 0 fail / 0 warn |
| bento dashboard | full set | OK — 11 pass / 0 fail / 2 warn (sort, project links n/a — not mounted on this board) |
| meadow dashboard | full set | OK — 11 pass / 0 fail / 2 warn (same) |
| mc project | tabs, sort | OK — 1 pass / 0 fail / 1 warn (no `data-sort-key` on page) |
| bento project | tabs, sort | OK — 1 pass / 0 fail / 1 warn |
| meadow project | tabs, sort | OK — 1 pass / 0 fail / 1 warn |

Highlights: drag (arrow deltas + registry-min clamp + Escape restore) PASS on all 3 dashboards; mc sort (7 keys, exclusive, direction toggle) PASS; digit console-keys switch views on mc and are verified no-ops (board intact) on bento (38 widgets) / meadow (35); `/app` redirect → `/app/mission-control` on all themes; mc same-theme dashboard→project navigation keeps the theme scope mounted. WARNs are the script contract's "affordance not mounted" (visible, not failures).

## 4. Bare pass (`?bare=1`)

| Run | Result |
|---|---|
| 6 addresses × 390x844 bare | 5/6 PASS; **bento project FAIL** — same defect (77px overflow) |
| 3 dashboards × 3440x1440 bare spot-checks | 3/3 PASS |

**8/9.** `bare` meta confirmed in JSON (`"bare": true`, URL carries `?bare=1`).

## 5. Static gates

- `grep-invariants.mjs`: **7/7 PASS** — themes-deps (35 files), color-literals (widgets/** zero; ui grandfather list intact at baseline 2026-09-05T19:03:41Z, 4 files), theme-css (6 stylesheets, literals only on custom-property declarations), severity-vocab (174 files, canonical only, no `no-root`), theme-widgets (28 widget files compose parts/runtime/contexts; 0 part-id collisions; 14 registry part ids known), validate-layout (ran clean), no-any (202 files).
- `legacy-sentinel.mjs`: **3/3 PASS** — `/` renders with hydrated legacy chrome; `/designs/mission-control` renders (11 `.mc-label` nodes); a dialog portals OUTSIDE any `[data-theme-scope]`.

## 6. Defects with owner routing

### D-C1-1 — bento project page, 390x844: 79px horizontal overflow (BLOCKS C1)

- **Symptom:** `part-min` FAIL on `/app/bento/project/…` at 390x844, committed+bare. Scope clientWidth 375, scrollWidth 454.
- **Measured DOM (no vision):** two widgets overhang the scope (`data-widget` truth):
  1. `bento-project-commits`: the `<table class="w-full border-collapse">` (DataTable via `widgets/parts/list/commits.tsx` → `@workspace-welcome/ui/components/data-table`) renders 420px min-content (left 34 → right 454; = the 79px). `CommitsList` defaults `useState<CommitsView>("table")`, so the table presentation is mounted at a micro rung where it cannot fit a 1-col tile.
  2. `bento-project-surface` (Files tab): shared `components/file-browser/index.tsx` pane row — `shrink-0 overflow-y-auto` fixed pane (340px) + `w-1 cursor-col-resize` splitter + `flex min-w-0 flex-1` (right edge 404 > 375).
- **Not present** at 3440/1280, on the bento dashboard, or on mc/meadow project pages at 390. Not a harness fault: self-test proves part-min detection; overflow is real `scrollWidth` (verified twice, plus bare).
- **Owner routing:**
  - **parts** (`apps/web/src/widgets/parts/list/commits.tsx`): ladder the default view below the table's floor rung (settled #9 ladder spirit: micro sizes get non-table presentation — default to `list`/`graph` by rendered rung) or floor the table view out of micro rungs. Primary fix site.
  - **theme/bento** (`apps/web/src/widgets/themes/bento/widgets/project-surface.tsx`): either constrain/ladder the FilesList presentation at micro rungs or accept the pane overflow once parts-level sizing lands — re-run part-min after the parts fix to see what remains.
  - **parts/shared-component** (`apps/web/src/components/file-browser/index.tsx`): the `shrink-0` fixed pane + splitter needs a min-w-0/percent fallback below ~400px container. NOTE: legacy production routes consume this component too — any change must stay behavior-neutral (legacy-sentinel re-run required).
- **Harness owner (me): nothing to fix** — probes, interactions runner, invariants, sentinel all behaved to spec. One harness-side note, no action: `interactions/run.mjs` `--path` takes a pathname, so project-page interaction rows must pass the full `/app/<theme>/project/…` path (done here).

## 7. Cross-theme commonality

- **14 registry parts**; adoption: report-gate 3/3, attention-list 3/3, files-list 3/3, artifacts-list 3/3, commits-list 3/3, branch-switcher 3/3, git-actions-toolbar 3/3, note-editor 2/3, project-pulse 2/3, project-led 2/3, form-{create-project,add-root,clone-script} in meadow's workspace widgets (per-preset), form-report-run via ReportGate flows.
- **0 local implementations.** Theme dirs contain only `widgets/` (plus theme css/preset); invariant #5 proves no component name collides with a registry part id and every one of the 28 theme widget files imports ≥1 of parts/runtime/contexts. The only `@/components` import in any theme is `IdeationPanel` — identical, plan-sanctioned shared-functional-component import in all 3 themes (common, not local).
- **One data path everywhere:** all themes go through `useWorkspace`/`useReport`/`useProject` contexts + `WidgetShell`/`WidgetTabs` (runtime); zero recharts/tanstack-table/useTRPC/`useQuery(` imports in themes (invariant #1). Zero color literals in widgets/** (invariants #2/#3). `[data-ww-theme]` scope + `data-theme-scope` marker verified live by portal-scope/token-completeness on every address.

## 8. Verdict

**C1: BLOCKED on D-C1-1** (bento project × 390x844 overflow). Matrix 17/18 probes, bare 8/9, interactions 6/6 OK, invariants 7/7, sentinel 3/3, check-types+build green. Zero FAILs elsewhere; the defect is product code (parts + theme), precisely routed above — re-run the 3 bento project rows (normal + bare) after the fix; expect immediate green.
