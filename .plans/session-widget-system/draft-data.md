# DATA specialist — draft (round 1)

Domain: the four contexts, the ReportContext state machine, canonical severity, the shared
scan-metrics module, format-helper unification, ProjectContext consolidation. Everything below
is written against the actual code on this branch (paths verified).

---

## 1. Approach in one paragraph

Contexts are **thin, typed views over the react-query cache, mounted per page, never per
widget**. Each provider calls the canonical tRPC query hooks once and exposes (a) the live
query results, (b) memoized derivations from the shared `scan-metrics` module, and (c) a small
action surface (`refresh`, `generate`, the git quintet). No context copies data out of the
query cache, so a hero tile on the dashboard and a project page dedupe by construction: they
share query keys, and the keys are canonical because there is exactly one hook per tRPC
procedure, in one module. ReportContext is the single implementation of the
missing/running/stale/fresh machine (mb's `WorkspaceReportProvider` + meadow's
`useReportJson`/`useReportRunner` are the two best existing drafts; we merge them).
Severity becomes `critical|warning|info` **at the packages/api boundary** — scan emits
canonical directly, no runtime mapper survives.

---

## 2. The four contexts

### 2.1 Mounting topology (who renders which provider)

| Provider | Mounted by | Notes |
|---|---|---|
| `SettingsProvider` | route root layout (`apps/web/src/routes/__root.tsx` wrapper or each top-level route) | one `settings.get` query per app; cheap; settings page writes through it |
| `WorkspaceProvider` | every dashboard page shell | owns `projects.scan` + `roots.list` + filter state + the shared `now` clock |
| `ReportProvider { kind, path, period? }` | page shell, composed by the page — **not** nested inside WorkspaceProvider | dashboard: `kind: "scan", path: roots[0]?.path`; project page: `kind: "repo", path` composed inside ProjectProvider. Orthogonal contexts mean a page *could* host two report scopes; today none does. |
| `ProjectProvider { path }` | every project page shell | fetches scan via the same canonical hook (cache-shared with dashboards — identical key), owns the git quintet/IDE/note/commitLog |

Rationale: settled decision #4 says layout definitions are declarative data — a widget cannot
own its provider (a provider is a live hook tree, not data). Providers are therefore page-shell
structure; the page shell is derived from the layout definition's scope (`workspace` vs
`project:<path>`), which is the architect's territory but the mapping is: **page scope →
provider stack**.

### 2.2 Exact value shapes

```ts
// apps/web/src/lib/contexts/settings-context.tsx
interface SettingsContextValue {
  settings: UseQueryResult<Settings>;         // raw query result, exposed not copied
  editorCommand: string | undefined;          // convenience reads
  terminalCommand: string | null | undefined;
  snitchPath: string | null | undefined;
  /** settings.set mutation wrapper (invalidates settings.get) */
  update(input: Partial<Settings>): void;
}
```

```ts
// apps/web/src/lib/contexts/workspace-context.tsx
import type { ScanResult, Root, Project } from "@workspace-welcome/api/lib/types";
import type { FleetVitals } from "@/lib/scan-metrics";

interface WorkspaceContextValue {
  scan: UseQueryResult<ScanResult>;           // projects + rootErrors, live
  roots: UseQueryResult<Root[]>;
  /** projects with hidden filtered out — the default working set everywhere */
  projects: Project[];
  rootErrors: ScanResult["rootErrors"];
  /** THE clock: scan.dataUpdatedAt || Date.now() (existing pattern, kept verbatim) */
  now: number;
  scanState: "loading" | "error" | "empty" | "ready";
  /** invalidate projects.scan + roots.list, then refetch (rescan handler) */
  refresh(force?: boolean): void;
  /** memoized: fleetVitals(projects, now) — one implementation */
  vitals: FleetVitals;
  /** matchProject text filter, owned here so every widget narrows together */
  filter: string;
  setFilter(value: string): void;
}
```

`scanState` derivation: `error` when `scan.isError`, `loading` when `scan.isPending`,
`empty` when `roots.data?.length === 0`, else `ready`. (Filter application stays a
`useMemo` in widgets — we do NOT re-provide filtered lists; that is the catalog §3.5 rule and
it keeps the provider value stable.)

```ts
// apps/web/src/lib/contexts/report-context.tsx
type ReportStatus = "no-scope" | "loading" | "missing" | "running" | "stale" | "fresh";

interface ReportContextValue {
  scope: ReportScope;                          // { kind: "repo"|"scan"; path; period? }
  status: ReportStatus;
  /** retained across `running` — widgets may render last-known content under a progress strip */
  exportData: ReportExport | null;
  byPath: Map<string, ReportExportProject>;   // indexProjectsByPath(exportData)
  entry(path: string): ReportExportProject | null;
  key: string | null;
  command: string | null;                      // copyable CLI (reports.command)
  commandError: string | null;
  generatedAt: string | null;
  /** scope-level staleness input: max updatedAt of projects in scope (latestUpdatedAtOf) */
  latestUpdated: string | null;
  /** bento's per-tile rule, resolved once: staleness of ONE project inside a scan export */
  isEntryStale(path: string): boolean;
  period: ReportPeriod | undefined;
  setPeriod(period: ReportPeriod | undefined): void;
  generate(options?: { force?: boolean }): void;   // default force:false (join/cached)
  generating: boolean;                          // mutation pending || job running
  /** meadow's normalizer, computed once — see §4.4 */
  view: ReportView | null;
}
```

```ts
// apps/web/src/lib/contexts/project-context.tsx
interface ProjectContextValue {
  path: string;
  project: Project | null;                     // scan.data.projects.find(p => p.path === path)
  now: number;                                 // same clock rule as Workspace
  git: {
    busy: boolean;                             // any quintet mutation pending
    diverged: boolean;                         // ahead>0 && behind>0
    fetchRemote(): void; pull(): void; push(): void;
    fetchBranch(branch: string): void;
    switchBranch(branch: string): void;        // each: mutate → invalidate scan + commitLog
  };
  open(target: "editor" | "terminal" | "folder"): void;   // projects.open
  copyPath(): Promise<void>;                   // navigator.clipboard + toast
  touch(): void;                               // projects.touchLastOpened, once
  note: {
    value: string;                             // persisted project.note
    draft: string;                             // local edit state, seeded by effect, keyed remount
    setDraft(value: string): void;
    save(): void;                              // projects.setNote + invalidate scan
  };
  /** ONE cached entry per path (limit 200) shared by graph/heatmap/table widgets */
  commitLog: UseQueryResult<CommitLogEntry[]>;
  ide: {
    status: UseQueryResult<IdeStatus | null>;  // poll 5s only while installing/starting
    open(): void;                              // projects.open {target:"editor"} + intent-ref choreography
    installingLabel: string | null;
  };
}
```

### 2.3 How widgets declare requirements

Widget definitions (architect's declarative layout data) carry:

```ts
interface WidgetDef {
  // ...
  requires: readonly ("workspace" | "project" | "report" | "settings")[];
}
```

Enforcement is two-layered:
1. **Build-time (static)**: the page-shell builder validates `layoutDef.widgets[*].requires`
   against the provider stack the page scope mandates; a violation fails `check-types` (the
   builder's return type is branded per satisfied context) — exact mechanism is the
   architect's call, this is the contract from my side.
2. **Runtime**: `useWorkspace()` / `useProject()` / `useSettings()` **throw** with a
   "XProvider missing — widget Y requires it" error against a null-default context.
   `useReport()` also throws when no provider is mounted, but a *mounted* provider with an
   empty/unresolvable scope reports `status: "no-scope"` (a legitimate runtime state — the
   first-run dashboard with no roots). `<ReportGate>` renders null for `no-scope`.

This is deliberately stricter than mb's `NullState` pattern: silent null-states hid wiring
mistakes for a year of design prototyping; declarative layouts deserve loud failures.

### 2.4 react-query reconciliation + the query-key convention module

New module `apps/web/src/lib/queries/` — **the only place allowed to call
`trpc.<proc>.queryOptions(...)` for the shared procedures**. One hook per procedure:

```ts
// apps/web/src/lib/queries/scan.ts
export function useScanQuery(): UseQueryResult<ScanResult>
export function useRootsQuery(): UseQueryResult<Root[]>        // staleTime: 5 min

// apps/web/src/lib/queries/reports.ts   (absorbs meadow report-data.ts + mb provider internals)
export interface ReportScope { kind: "repo" | "scan"; path: string; period?: ReportPeriod }
export function useReportCommand(scope: ReportScope, enabled = true)
// → { key, command, commandError, isPending }   staleTime: 10 min (meadow's value, promoted)
export function useReportExport(key: string | null)
// → UseQueryResult<ReportExport | null>          staleTime: 60 s; enabled: key !== null
export function useReportJob(jobKey: string | null)
// poll via function refetchInterval: 1500 ms while running, else false
export function useReportGenerate(scope: ReportScope)
// mutation + job tracking + settle-invalidation + toast-on-failure (mb's toasts, meadow's reset)
export function useReportExportsIndex()          // reports.jsonExports, for scan-fallback

// apps/web/src/lib/queries/commit-log.ts
export function useCommitLogQuery(path: string, limit = 200)
```

Key conventions (documented in the module README-comment):
- **Scopes, not keys**: consumers address reports by `{kind, path, period}`; only
  `useReportCommand` resolves keys. Nobody hand-builds a report key client-side.
- **`enabled` gating with placeholder inputs** (`key: ""`) — the existing pattern, standardized.
- **Identical input ⇒ identical key ⇒ automatic dedupe** across provider/hook/widget. This is
  why ProjectProvider re-calling `useScanQuery` is free: dashboards already populated the
  entry when the user navigated from a tile.
- **Function-form `refetchInterval`** for every poll (job, IDE, scaffold) — stops when settled.
- **Invalidation ownership**: only the query module invalidates; contexts/widgets never call
  `queryClient.invalidateQueries` directly (except settings/project mutation wrappers).

`apps/web/src/lib/use-report.ts` (`useReportRun` — open-HTML-in-tab flow) survives as a thin
consumer of `useReportGenerate`-adjacent mutation, unchanged behavior.

---

## 3. ReportContext = THE state machine (catalog DRY win #1)

### 3.1 States and transitions

```
                 ┌──────────┐  scope.path resolves
   (no provider) │ no-scope │────────────┐
                 └──────────┘            ▼
                    ┌──────┐  command/export pending  ┌────────┐
                    │loading│◄────────────────────────┤        │
                    └──┬───┘                          │        │
        export null    │      export present          │        │
             ┌─────────▼──┐   isReportStale(gen,      │        │
             │  missing   │   latestUpdated)?         │        │
             └─────┬──────┘    ┌───────┐  ┌───────┐   │        │
                   │           │ stale │  │ fresh │   │        │
                   │           └───┬───┘  └───┬───┘   │        │
                   │  generate()  │           │       │        │
                   └──────────────┴─────┬─────┴───────┴────────┘
                                        ▼
                                   ┌────────┐  job settles → invalidate export(s) + index
                                   │running │──────► recompute (→ loading/fresh/stale)
                                   └────────┘  job lost (null) → toast + leave running state
```

Priority when several conditions hold (mb's order, kept verbatim — it is the most complete):

```
no-scope   : scope.path empty
running    : jobKey !== null            (generate in flight or job polling)
loading    : command.isPending || (key !== null && export.isPending)
missing    : exportData === null
stale/fresh: isReportStale(exportData.generatedAt, latestUpdated)
```

**Deviation from mb (explicit):** during `running`, `exportData`/`byPath` are **retained**
(mb nulled them). Bento already renders last-known content under a progress strip; wiping to
skeleton causes a flash when regenerating an existing report. `<ReportGate>` decides
visually; the state machine keeps the data.

### 3.2 Staleness rules (resolves catalog ambiguity B4)

Two distinct rules, both owned by the provider:

1. **Scope status** — `isReportStale(exportData.generatedAt, latestUpdated)` where
   `latestUpdated = latestUpdatedAtOf(projects in scope)`:
   - `kind: "repo"` → the project's scan `updatedAt` (single value);
   - `kind: "scan"` → max `updatedAt` across projects under the root (mb already filters by
     `path.startsWith(rootPath)` — kept).
2. **Per-entry (`isEntryStale(path)`)** — bento's tile rule:
   `isReportStale(exportData.generatedAt, projectByPath.get(path)?.updatedAt ?? null)`.
   Only meaningful inside scan reports; repo reports have exactly one entry whose staleness
   equals the scope status.

Both wrap the existing, unchanged `@workspace-welcome/api/lib/report-staleness`
(`isReportStale`, `latestUpdatedAtOf`, `REPORT_STALE_TOLERANCE_MS` = 24 h). This also fixes
catalog B2 (MC's `useReportExport` staleness quirk) — there is no other staleness computation
left in the codebase.

### 3.3 Generate mutation + polling + invalidation (one implementation)

Merge of meadow's `useReportRunner` (cleanest lifecycle) + mb's UX details:

```ts
const generate = useMutation(trpc.reports.generate.mutationOptions());
const jobKey = generate.data?.key ?? null;
const job = useReportJob(jobKey);              // 1500 ms poll while running
useEffect(() => {
  if (jobKey === null || job.data === undefined) return;
  if (job.data !== null && job.data.status === "running") return;
  if (job.data === null) toast.error("Report job lost — the server probably restarted.");
  else if (job.data.status === "failed")
    toast.error(job.data.stderrTail.split("\n").filter(Boolean).at(-1) ?? "Report run failed.");
  invalidateReports(jobKey);                   // jsonExport{key} + jsonExports index
  generate.reset();
}, [jobKey, job.data]);
```

`generate({ force })`: `force: false` joins/returns the cached report (the router's backfill
path), `force: true` voids and re-runs. Mapping for UI: **missing → `generate()` (no force —
a cached report may exist server-side), stale → `generate({ force: true })`**. `generating =
mutation.isPending || jobKey !== null`.

`period` + `setPeriod` are provider state (mb precedent); changing period re-keys the command
query → the whole pipeline re-resolves. Periods list (`REPORT_PERIODS` UI preset array)
moves from mb's `report-data.tsx` into the queries module.

### 3.4 `<ReportGate>` — defined once, parts render it

Contract (pixels belong to the parts specialist; the contract is mine):

```ts
interface ReportGateProps {
  /** rendered for stale AND fresh; receives the staleness flag */
  children?: (state: { stale: boolean; view: ReportView | null }) => ReactNode;
  /** override slots; defaults are the shared common parts */
  missing?: ReactNode;   // default: GenerateCTA (button + copyable CLI + commandError)
  running?: ReactNode;   // default: progress strip + last-known children when exportData exists
  loading?: ReactNode;   // default: skeleton matched to content min-height
  quiet?: boolean;       // loading/no-scope render null instead (for micro/1x1 placements)
}
```

Behavior matrix: `no-scope` → null · `loading` → skeleton (or null when `quiet`) ·
`missing` → CTA · `running` → running slot (or progress over `children({stale:true})` when
`exportData` retained) · `stale` → children + stale chip + regenerate action · `fresh` →
children. Every report part consumes the `status` enum, never booleans (naming contract).

### 3.5 `ReportView` — meadow's `toReportView` promoted to THE normalizer

Moves from `apps/web/src/components/designs/meadow/report-data.ts` to
`apps/web/src/lib/report-view.ts`, unchanged in spirit, two additions: `stale` becomes
`staleAt: string | null` (the winning updatedAt, for tooltips) and it stops importing
staleness itself (the provider passes `latestUpdated` in). bento/mb aggregations
(`aggregateCadence`, `tallyAlerts`, `languageRows`, `indexReportExport`) become consumers of /
merge into the scan-metrics module (§5) with `ReportView` as the single render-ready shape.

---

## 4. Canonical severity (settled decision #8)

### 4.1 Where the mapper lives: **packages/api, at emission — no runtime mapper survives**

```ts
// packages/api/src/lib/types.ts
export type AlertSeverity = "critical" | "warning" | "info";   // was "error" | "warn" | "info"
```

`packages/api/src/lib/scan.ts` changes its 4 emission sites (`severity: "error"` →
`"critical"`, `severity: "warn"` → `"warning"`). Report exports are already canonical
(`reportExportSeveritySchema`). After this, **one vocabulary exists on the wire**; the four
client-side hand-maps (`SEV_FILL`, `SEVERITY_COLOR`, `severityColor`, `projectLed` tone
tables) collapse into one tone table in the parts/theme layer keyed by the canonical union.

Why not a client adapter: the settled decision says "one mapper at the data boundary" — with
scan emitting canonical there is nothing left to map; an adapter would keep the second
vocabulary alive forever and force every future consumer to remember the adapter.

### 4.2 Migration surface (verified)

- **No persisted-data migration**: `scan-cache.ts` keeps `CacheEntry` in memory only
  (verified — no disk payload); `store.json` persists overrides only (no severity);
  report JSONs on disk are already canonical.
- **Blast radius**: `packages/api` = `types.ts` + `scan.ts` (4 sites). `apps/web` =
  16 files match severity literals: 5 production/shared
  (`components/needs-attention.tsx`, `components/summary-cards.tsx`,
  `components/git-badges.tsx`, `components/designs/*` are designs) + 12 design files
  (mc/bento/meadow/mb/swiss/ledger metrics + tiles). The design files are scheduled for
  deletion (settled #10) — the sweep is mechanical (`"error"`→`"critical"`,
  `"warn"`→`"warning"` in alert contexts; `--sev-error/--sev-warn` CSS vars →
  `--sev-critical/--sev-warning` in `mission-control.css` + production styles).
- **CSS tokens**: `--sev-error|--sev-warn|--sev-info` → `--sev-critical|--sev-warning|--sev-info`
  (this is the parts/theme seam; flagged to peers — catalog §4 lists these as the part API).
- `AlertCode` is unchanged; `HealthAlert` consumers switch comparisons only.

### 4.3 Severity helpers in scan-metrics (canonical)

`worstSeverity(p): AlertSeverity | null`, `severityRank(p): 0|1|2|3`
(critical < warning < info < clean), `severityCounts`, `severityLedger` — all canonical.
The 4 duplicated implementations + meadow's `flaggedProjects` + mb's `channelProjects(...,
"triage")` converge on `attentionProjects(projects)` (worst-first, freshest tiebreak).

---

## 5. The shared scan-metrics module (catalog DRY win #4)

**Location**: `apps/web/src/lib/scan-metrics/` — client-side pure TS, no React, no CSS vars,
no theme tokens (color ramps belong to parts; `alertsPieRows`/`stackPieRows`/`STACK_RAMP`
fill logic dies — parts map data rows onto theme ramps). SSR-safe (no `Date.now()` at module
scope; `now` is always a defaulted parameter).

File layout (each ≤ ~150 lines; barrel `index.ts` re-exports):

```ts
// apps/web/src/lib/scan-metrics/severity.ts    — §4.3 above (+ attentionProjects)
// apps/web/src/lib/scan-metrics/activity.ts
updatedMs(p) · activityInstantMs(p, now?)        // max(updatedAt,lastOpenedAt) clamped to now
lastTouchMs(p, now?)                            // ALSO max(git.lastCommit.date) — bento's semantics
byUpdatedDesc(a,b) · isHot(p, now?)              // 48 h rule
activityCounts(projects, now?) · activityGridFromCounts(counts, weeks?, now?)
heatLevel(count) · dayKey(ms)                    // MC heatmap, promoted verbatim
weeklyActivity(projects, weeks?, now?)           // bento histogram (uses lastTouchMs)
dailyActivity(projects, days, now?)              // meadow spark series (uses updatedAt)
touchedWithinDays(projects, days, now?)
freshnessCounts(projects)                        // meadow tier census

// apps/web/src/lib/scan-metrics/pulse.ts
PulseCell · pulseCells(p, cells = 24, now?)      // ONE copy (MC/mb today)

// apps/web/src/lib/scan-metrics/fleet.ts
FleetVitals { total, activeWeek, attention, pinned, dirtySum, aheadSum, behindSum }
fleetVitals(projects, now?)                      // MC field names; superset of mb's
partitionFleet(projects)                         // MC: pinned/flagged/current/archive
channelCounts/channelProjects(projects, channel) // mb channels — kept, built on attentionProjects

// apps/web/src/lib/scan-metrics/stacks.ts
StackSlice { id, label, count }
stackDistribution(projects, max = 5)             // bento/mb shape (Other-folding) wins;
                                                 // MC stackBreakdown + meadow stackBreakdown die
dirtyLeaders(projects, limit = 5): { name, path, dirty }[]   // MC's recency tiebreak kept

// apps/web/src/lib/scan-metrics/report.ts       — over ReportExport (canonical severity)
CadencePoint · aggregateCadence(data, maxPeriods?)            // cap optional, default uncapped
AlertTally { severityCounts, rows: { label, worst, count, value, summary }[], total }
alertTally(data)                                 // merges mb aggregateAlertLabels +
                                                 // bento tallyAlerts + meadow's fold:
                                                 // source = projects[].alerts else totals.alerts
LanguageRow · languageRows(data, limit?) · projectLanguages(entry, limit?)
indexProjectsByPath(data) · entryAsExport(entry) // mb adapter kept
aiUsageLeaders(data, max?)
healthSummary(projects, now?)                    // bento's gauge input
```

Reconciliation notes (differences resolved, explicitly):
- `activityInstantMs` vs `lastTouchMs` are **two different concepts** (MC's pulse/vitals vs
  bento's health/histogram) — both kept, named apart, documented in one comment block.
- `dirtyLeaders`: MC returned `updated: number`; dropped (parts re-derive from project if
  needed — one less copy of the timestamp), but MC's recency tiebreak in *sorting* is kept.
- `stackDistribution` naming: bento/mb's (returns folded slices); MC's
  `stackBreakdown`/`stackPieRows` and meadow's `stackBreakdown` are deleted.
- Chart feeds (PieRow with `fill`) are NOT metrics — parts own fills.

## 6. Format helpers (win #5) — extend the existing module

`apps/web/src/lib/format.ts` already owns `relativeTime/absoluteDate/dateTooltip/formatBytes`.
Add the unified set, one signature each (design copies deleted):

```ts
formatCompact(n: number): string        // mb ladder: ≥1B 6.8B · ≥1M 210.4M · ≥10k 21k · else locale
formatTokens(n: number): string         // meadow ladder: 618.8M · 61.9k · 942 (1-decimal from 1k)
formatCost(cost: number): string        // meadow's superset wins: $0 · <$0.01 → $0.0001 (4dp) ·
                                        //   <$1000 → $1.24 · else $1,234 (rounded, locale)
compactAge(ms: number, now = Date.now()): string
                                        // ms-elapsed signature (bento's); meadow's week rung kept:
                                        // now · Nm · Nh(<60m) · Nd(<14d) · Nw(<10w) · Nmo(<24mo) · Ny
ageMs(iso: string, now = Date.now()): number   // the ISO bridge; meadow call sites do
                                        //   compactAge(ageMs(iso)) — no second age signature
formatElapsed(ms: number): string       // job timers: 12s · 1m 03s · 2h 14m (MC/bento/mb trio dies)
```

The 5 micro-duplicates of "minutes→hours→days" (`relativeScanned`, `relativeTimeShort`,
`formatElapsed` variants) migrate onto `relativeTime` (exists) + `compactAge` + `formatElapsed`.

## 7. ProjectContext consolidation (win #3)

Replaces the ~150-line near-verbatim block in
`routes/designs/mission-control/project.$.tsx`, `components/designs/bento/project-page.tsx`,
`routes/designs/meadow/project.$.tsx`, `routes/designs/mission-bento/project.$.tsx`
(verified: `IDE_POLL_MS` / `invalidateScan` / quintet mutations / `gitBusy` / `diverged` /
`saveNote` / `copyPath` appear in all four):

- **git quintet**: five `useMutation`s + `invalidateScan` (scan + commitLog) + `gitBusy`
  (OR of pendings) + `diverged` — once, in the provider. `BranchSwitcher` /
  `GitActionsToolbar` (shared parts) switch from receiving mutation-slice props to reading
  `useProject().git` — with a compat prop path during migration (parts peer).
- **IDE choreography**: `ide.open()` runs `projects.open {target:"editor"}`, sets the intent
  ref, `ide.status` polls at 5 s *only* while installing/starting (function
  `refetchInterval`), `installingLabel` derives from status. One copy.
- **note**: draft state seeded from `project.note` via effect, `save()` on blur +
  invalidation; keyed remount on `path` change.
- **copyPath / touch**: trivial, but they exist 4×; owned once.
- **commitLog**: one provider-level query (limit 200); widgets slice. A widget wanting a
  different limit uses `useCommitLogQuery` directly (documented escape hatch).

Shared parts that already do this pattern (`FileBrowser`, `ArtifactsPanel`,
`CommitHistoryCell`, `IdeationPanel`) keep their internal queries — they are leaf parts with
container-independent fetches; only `CommitHistoryCell` should switch to the provider's
cached entry to stop its per-mount refetch (catalog notes it fetches per-mount today).

## 8. Phases

All phases: type Sequential unless marked Parallel; validation = `pnpm run check-types` AND
`pnpm build` green (the flock/build verify loop when a running service must reflect changes;
execution agents have no vision — DOM assertions only).

| # | Phase | Files (create ● / edit ✎) | ~LoC | Deps | Validation criteria |
|---|---|---|---|---|---|
| D1 | **Canonical severity (api + sweep)** | ✎ `packages/api/src/lib/types.ts`, `packages/api/src/lib/scan.ts` (4 sites), ✎ 16 web files (5 prod/shared + designs until deleted), ✎ css tokens | ~200 | none (but see conflict note: prefer landing immediately before design deletion) | `check-types` + `build` green; grep proves zero `"warn"`/`"error"` severity literals outside the canonical union; production dashboard renders alerts (DOM check) |
| D2 | **scan-metrics module** | ● `apps/web/src/lib/scan-metrics/{index,severity,activity,pulse,fleet,stacks,report}.ts` | ~600 (7 files) | D1 (canonical types) | `check-types` green; module imports nowhere except new contexts/parts (designs untouched); pure (no React import) verified by grep |
| D3 | **format unification** | ✎ `apps/web/src/lib/format.ts` (+5 helpers) | ~120 | none — **Parallel** with D1/D2 | `check-types`; each new helper has JSDoc naming its replaced duplicates |
| D4 | **queries module** | ● `apps/web/src/lib/queries/{scan,reports,commit-log}.ts`; ✎ absorb `apps/web/src/lib/use-report.ts` internals (keep public API) | ~300 | D1 | `check-types` + `build`; no `trpc.reports.*.queryOptions` call sites outside the module (grep) except `use-report.ts` internals |
| D5 | **SettingsProvider + WorkspaceProvider** | ● `apps/web/src/lib/contexts/{settings,workspace}-context.tsx` | ~250 | D4, D2 | `check-types`; provider unit-mounted in one design-neutral test page (temporary route, deleted in D8) |
| D6 | **ReportProvider + state machine + ReportGate contract** | ● `apps/web/src/lib/contexts/report-context.tsx`, ● `apps/web/src/lib/report-view.ts` (moved+extended from meadow) | ~350 | D4 | `check-types` + `build`; status machine table (§3.1) documented in-file; no other file computes `isReportStale` (grep) |
| D7 | **ProjectProvider** | ● `apps/web/src/lib/contexts/project-context.tsx` | ~300 | D4, D5 (workspace types only) | `check-types`; quintet/IDE/note blocks greppable only inside the provider |
| D8 | **Wire into new pages + delete dead code** (execution with migration peer) | ✎ new page shells mount providers; ✎ `CommitHistoryCell` to provider entry; delete `components/designs/*/metrics*`, `meadow/report-data.ts`, `mb/report-utils.ts`, `bento/bento-metrics.ts` (mosaic wrapper stays until parts migrate), temporary test route | ~0 new | D1–D7 + peers | `check-types` + `build`; full verify loop (`flock … build && systemctl restart` + DOM script) |

D2–D7 totals ≈ 1,900 lines of new shared code replacing ~3,500+ duplicated lines across
designs + production.

## 9. Dependencies on peers

- **architect**: (a) layout-definition schema must carry `requires: ContextKey[]` per widget
  (§2.3) and a page-scope → provider-stack mapping; (b) confirm contexts live in
  `apps/web/src/lib/contexts/` within their tree plan; (c) who owns `useConsoleKeys` /
  filter — I claim filter state in WorkspaceContext, keys hook can live with architect.
- **parts**: (a) parts consume contexts (`useWorkspace()` etc.) and scan-metrics — never
  re-derive; (b) color ramps (`STACK_RAMP`, `alertsPieRows` fills) move into the
  theme/parts layer keyed by canonical severity; (c) `--sev-*` token rename (§4.2);
  (d) `<ReportGate>` default visuals per §3.4; (e) `BranchSwitcher`/`GitActionsToolbar`
  prop surface change (§7).
- **migration**: (a) sequencing — D1 severity sweep vs design deletion (see conflict);
  (b) new pages mount the provider stack (D5–D7) — the page-shell wiring is executed
  together; (c) production routes (`routes/index.tsx`, `routes/projects.$.tsx`) migrate onto
  contexts as part of the final cutover, not before.

## 10. Risks, conflicts, alternatives

**Conflicts I expect:**
1. **Severity sweep vs design deletion ordering.** My D1 wants to rename literals in 12
   design files that migration will delete. Alternative (cleaner if migration agrees): land
   D1 *in the same phase as design deletion* so designs are never swept. I default to
   sweeping (keeps every intermediate commit green) but defer to migration's sequencing.
2. **`exportData` retained during `running`** (§3.1) — mb's provider nulled it. If parts
   prefer the simpler wipe-to-skeleton, the state machine keeps the data either way; the
   decision only affects ReportGate defaults. I take bento's behavior; flag for parts.
3. **Throwing context hooks vs mb's NullState** — stricter than any current design. If the
   architect's layout validation makes silent-null impossible anyway, both work; I argue
   throwing is the better dev-time failure and ask architect to align.

**Risks:**
- **Context re-render blast radius**: any scan data change re-renders the whole widget tree
  (one page-level provider). This is identical to today's route-level state; accepted, but
  widgets must select narrowly and derivations must be memoized in the provider.
- **SSR hydration**: `now` must come from `dataUpdatedAt` (stable across server/client for
  the same data) — never `Date.now()` during render; same rule as today's designs.
- **`startsWith(rootPath)` scope filtering** (mb) assumes roots don't nest. True today;
  documented as a provider precondition.

**Alternatives rejected:**
- Contexts that copy query data into plain state (breaks the expose-not-duplicate rule;
  re-introduces cache divergence).
- Client-side severity adapter (keeps two wire vocabularies; contradicts settled #8's intent).
- Per-widget providers (incompatible with declarative layouts; defeats dedupe).
- Zustand/Redux global store (settled: context + react-query).
- Moving scan-metrics into `packages/api` (it depends on web-side `@/lib/recency` and is
  presentation derivation; api package is server logic).
