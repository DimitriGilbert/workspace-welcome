# DATA specialist — refined plan (round 1)

Deltas from draft-data.md driven by peer reviews (review-architect.md, review-parts.md,
review-migration.md). Unchanged sections are not restated; this file amends the draft. Where
peers converged on my position, that is noted; where I conceded or held, the reason is given.

---

## 1. Revisions (change → reason → source)

### R1. ProjectProvider nests WorkspaceProvider (architecture change)
**Change**: §2.1 mounting becomes:

```
dashboard page:  SettingsProvider > WorkspaceProvider > ReportProvider{ scan, roots[0] }
project page:    SettingsProvider > ProjectProvider{ path } > ReportProvider{ repo, path }
                                                  └─ mounts WorkspaceProvider internally
```

**Reason**: architect's concern 1 — project pages must be able to host workspace widgets
(mb's InstrumentTile-as-hero precedent; `PageLayout.context: "project"` presets may reference
workspace widgets). Nesting is nearly free: `useScanQuery` hits the same react-query entry
dashboards already warmed, and all Workspace derivations are memoized. `useWorkspace()` now
works under any provider stack that includes Project.
**Source**: review-architect §1.1.

### R2. Contexts move to `apps/web/src/widgets/contexts/` (location concede)
**Change**: providers + their hook files live at `widgets/contexts/` (inside architect's
unified system tree). `lib/` keeps ONLY pure-TS/data infra: `lib/queries/`,
`lib/scan-metrics/`, `lib/format.ts` (plus existing `lib/forms/`, `lib/grid-layout/`).
**Reason**: architect §4 (contexts are React providers existing only for this system; the
system tree is the grep-able namespace for migration's invariants) + parts' cross-cutting
table backed it. I initially placed them in `lib/` for import-purity symmetry, but the
"lib = pure TS, no React components" line architect drew is cleaner than my "lib = infra"
line, and two peers preferred it. Technical content unchanged.
**Source**: review-architect §4, review-parts §5.1.

### R3. Requirement declaration: `requires` + validate-layout script (mechanism replaced)
**Change**: keep `requires: readonly ContextKey[]` (architect adopted my field name over
their `contexts`). Drop my "branded type at check time" layer — it cannot work for
data-driven presets referencing a runtime registry. Enforcement is: (a) runtime throw in
`useWorkspace()/useProject()/useReport()/useSettings()` (kept from draft), plus (b)
architect's validate-layout script (W4) asserting `requires ⊆ page provider stack` over
preset data + registry — running in the check phase.
**Reason**: architect's concern 2 is correct — runtime map + declarative data defeats a
type-level check; the script is the honest equivalent.
**Source**: review-architect §1.2.

### R4. ReportGate: children is `ReactNode`; slots + `mode` + `entry` unified (concede + merge)
**Change**: final contract —

```ts
interface ReportGateProps {
  children?: ReactNode;              // rendered for stale AND fresh (NOT a render-prop)
  mode?: "gate" | "banner" | "line"; // parts' densities
  entry?: string;                    // project path; consumes entry(path) + isEntryStale(path)
  missing?: ReactNode; running?: ReactNode; loading?: ReactNode;  // my override slots
  quiet?: boolean;
}
```

The state machine (§3.1–3.2 of my draft) is unchanged and remains mine; the component is
parts'. Staleness-aware content = a part that itself calls `useReport()`.
**Reason**: I concede the render-prop — children-as-node composes with parts-hosting-parts,
carousel cards, and pure-data presets (a render-prop cannot be referenced by kind in a
preset). My slots, `quiet`, and null-for-`no-scope` survive; parts' `mode` and `entry`
adopted; architect requested exactly this merge.
**Source**: review-parts §2.1, review-architect §1.3.

### R5. `ledState` hosted in scan-metrics (held my ground, with a purity carve-out)
**Change**: `apps/web/src/lib/scan-metrics/severity.ts` exports

```ts
export interface LedState {
  tone: "critical" | "warning" | "info" | "live" | "nominal";
  label: string;
}
export function ledState(project: Project, now: number): LedState;
```

(`critical|warning|info` from `worstSeverity`, `live` from `isHot` 48 h, `nominal` = clean.)
packages/ui's `Led` keeps its own structurally-identical `tone` union — no import between
metrics and ui; parts may re-export as `ledOf` if they want the friendlier name.
**Reason**: parts offered to own `ledOf` "so your module stays presentation-free", but the
DERIVATION is the 3x-duplicated thing the catalog flagged (StatusLed/projectLed/worstSeverity);
splitting it across layers re-creates the duplication the module exists to kill. The
structural-union carve-out answers the purity objection — metrics never imports ui, ui never
imports metrics.
**Source**: review-parts §2.2 (their alternative accepted as a naming alias, not a move).

### R6. D8 scope shrinks: no design-file deletions, no temp route (accepted)
**Change**: D8 becomes "wire providers into new page shells" only. All deletions of
design-local metrics/report-utils/bento-metrics move to migration's K1. The D5 temporary
test route is dropped — my provider-mount validation panel is hosted by parts' preview
route (one of the two sanctioned dev surfaces). The `CommitHistoryCell` switch is ALSO
deferred: it is shared with `/designs/*` pages that mount no ProjectProvider, so rewiring
it to `useProject()` would break designs; the new system's `ListCommits` part supersedes it
and `CommitHistoryCell` dies in K1/K5 untouched.
**Reason**: migration's concern 1 is right — my D8 as drafted broke `/designs` compilation
before K1 and spent effort on dying code. The CommitHistoryCell catch is mine from working
their concern to its conclusion.
**Source**: review-migration §B.1, §A.3.

### R7. SettingsProvider mounts in the `/app` tree only, until K5 (accepted)
**Change**: §2.1 amended — NOT `__root.tsx` (would put new machinery on legacy routes
promised untouched). Mounted by migration's `/app` route layout (M1+); promoted to the app
root at K5 cutover.
**Reason**: migration's concern 3 — keeps the "legacy untouched" promise audit-clean; one
`settings.get` query scoped to `/app` until cutover is free.
**Source**: review-migration §B.3.

### R8. Severity phase: sweep designs early + token rename in the SAME phase (locked)
**Change**: D1 = api `AlertSeverity`/`scan.ts` emission + CSS token rename
(`--sev-error|--sev-warn` → `--sev-critical|--sev-warning` in base globals + theme CSS) +
mechanical literal sweep of the 12 design files + 3 legacy components, one phase, one
commit. Migration's legacy sentinel (one design route + `/` + one dialog) gates every
subsequent wave to prove behavior-neutrality.
**Reason**: settled in review exchange — parts/migration both agreed; token rename must not
drift from the type change ("one rename commit, not two"). Early sweep is type-forced
(parts/metrics/contexts type against canonical from day one).
**Source**: review-migration §B.2, §C.5; review-parts §3.2.

### R9. Small accepts (no structural impact)
- Export `ScanState` union type from workspace-context (architect §1.5).
- Providers stamp `data-providers="<keys>"` on their root (migration §8.2); exact strings:
  space-separated lower-case context keys in mount order, e.g. `data-providers="settings workspace report"`.
- `REPORT_PERIOD_PRESETS` (incl. `All → undefined`) exported from `lib/queries/reports.ts`
  for parts' `FormReportRun` (was mb's local array).
- Flow-generator seam: flows receive `WorkspaceContextValue` as input (my review ask);
  architect's `flows.ts` consumes `useWorkspace()` — confirmed compatible since flows run
  inside the provider stack.
- `ReportView` carries directly-consumable rows: `cadence: CadencePoint[]`,
  `alerts` (label/severity/summary/count/value), `languages` rows, plus `alertTally.rows`
  — parts' ask (§2.3) confirmed; no re-mapping in parts.
- `stackRamp(n)` stays OUT of scan-metrics — parts withdrew the ask in their review
  amendments (ui `lib/tokens.ts` owns color cycling). Metrics remain color-free.
- `commitLog` contract stands: provider = one shared entry (limit 200) as
  `UseQueryResult<CommitLogEntry[]>`; other limits via `useCommitLogQuery(path, limit)`
  direct hook. Parts' ListCommits uses the direct hook.
- `git` provider surface confirmed as the final prop source for BranchSwitcher /
  GitActionsToolbar app parts (parts amendment #4).
- `no-scope` status name stands (parts concurred; flag for owner ratification since
  context.md's sketch said `no-root`).

## 2. Feedback addressed / not addressed

| Peer feedback | Disposition |
|---|---|
| architect: nest Workspace in Project | **Addressed** (R1) |
| architect: branded-type check impossible | **Addressed** (R3 — script + throw) |
| architect: ReportGate double-definition | **Addressed** (R4 — merged on parts' API) |
| architect: export ScanState type | **Addressed** (R9) |
| architect: contexts in system tree | **Addressed** (R2 — conceded) |
| parts: children as ReactNode | **Addressed** (R4 — conceded) |
| parts: ledOf home | **Partially** — derivation moved to me as `ledState`, name alias allowed (R5); final call theirs to veto in round 2 |
| parts: ReportView row shapes | **Addressed** (R9) |
| parts: BranchSwitcher/GitActionsToolbar | **Addressed** (R9 — provider surface is final) |
| migration: defer design deletions to K1 | **Addressed** (R6) |
| migration: SettingsProvider /app-scoped | **Addressed** (R7) |
| migration: sweep-timing + sentinel | **Addressed** (R8) |
| migration: data-providers attribute | **Addressed** (R9) |
| parts: `stackRamp` in metrics | **Refused** in review; parts conceded — ui tokens own it (R9) |
| parts: `commitLog(limit)` function API | **Refused** (hook-safety); direct-hook alternative offered and adopted |

## 3. Final phase table (supersedes draft §8; sizes/LoC unchanged unless noted)

| # | Type | Phase | Files | Deps | Gate |
|---|---|---|---|---|---|
| D1 | S | Canonical severity: api types + scan emission + `--sev-*` token rename + literal sweep (12 design files, 3 legacy components) | ✎ `packages/api/src/lib/{types,scan}.ts`, ✎ base/theme css, ✎ ~15 web files | none | check-types + build; grep: zero old severity literals; legacy sentinel (design route + `/` + dialog) green |
| D2 | S | `lib/scan-metrics/` (7 files, now incl. `ledState`) | ● `apps/web/src/lib/scan-metrics/*` | D1 | check-types; no React/color imports in module |
| D3 | P | format unification | ✎ `apps/web/src/lib/format.ts` | none (parallel with D1/D2) | check-types |
| D4 | S | `lib/queries/` module (scan/roots/reports/commit-log + `REPORT_PERIOD_PRESETS`) | ● `apps/web/src/lib/queries/*`; ✎ absorb `use-report.ts` internals | D1 | check-types + build; no `trpc.*.queryOptions` outside module (grep) |
| D5 | S | `widgets/contexts/{settings,workspace}-context.tsx` (+ `data-providers` stamps, `ScanState` export) | ● 2 files | D2, D4 | check-types; validation panel hosted in parts preview route (not my route) |
| D6 | S | `widgets/contexts/report-context.tsx` + `lib/report-view.ts` (moved from meadow + row-shape additions) | ● 2 files | D4 | check-types + build; single `isReportStale` caller (grep) |
| D7 | S | `widgets/contexts/project-context.tsx` (nests Workspace; quintet/IDE/note/commitLog/copyPath/touch once) | ● 1 file | D5, D6 | check-types; quintet greppable only here |
| D8 | S | Wire provider stacks into new page shells (with migration M-phases); NO deletions, NO design edits | ✎ page shells | D1–D7 + peers | check-types + build; full verify loop |

## 4. Convergence notes

- **Settled this round**: directory tree (architect §4 — I fall in line), `/app/$theme`
  routes (migration), `requires` field name (mine, adopted by architect), `no-scope`
  (mine, parts concur; owner-ratify), severity early-sweep + one-commit token rename,
  ReportGate merged API, one harness + two dev surfaces, `stackRamp` in ui tokens,
  `commitLog` hook-safety pattern, Project-nests-Workspace.
- **My scorecard vs the group**: conceded contexts location (R2), ReportGate render-prop
  (R4), D8 deletions (R6), SettingsProvider scoping (R7); held ledState-in-metrics (R5),
  api-emission severity (group agreed), expose-not-copy contexts (group agreed),
  no-mapper grep invariant (migration adopted).

## 5. Remaining concerns (open into round 2 / synthesis)

1. **`ledState` vs `ledOf` home** — my R5 is the last open disagreement with parts; tiny
   either way, but the catalog's "one derivation" goal is why I hold. Parts veto = alias
   in app parts, derivation stays mine; I can live with the inverse too.
2. **Provider-stack derivation from `PageLayout.context`** — architect never explicitly
   answered my proposal (workspace → scan/roots[0], project → repo/path, optional
   `report: false` escape). It is confirmed by their §1.4 reading; the master plan should
   state it in one sentence so the page-shell builder has a spec.
3. **Owner sign-off list affecting my domain**: `no-scope` naming (vs context.md's
   `no-root` sketch), severity token rename riding D1.
4. **Registry growth / code-splitting** (architect §10.4) — contexts are cheap, but if the
   static registry pulls every widget into every route, my providers ride along; noted,
   not solved; revisit post-migration.
