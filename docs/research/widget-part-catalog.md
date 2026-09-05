# Widget & Part Catalog — the four dashboard concepts

Raw material for the widget-system redesign (blank canvas + widgets + parts architecture).
Everything below was read out of the code on branch `redesign/dashboard-concepts`; every
entry carries file paths so the planner can jump straight to the source. Design keys used
throughout: **MC** = mission-control, **bento** = bento, **meadow** = meadow, **mb** = mission-bento,
**S** = swiss, **L** = ledger (the last two exist on the same branch and are catalogued in
[Appendix A](#appendix-a-the-other-two-concepts) — they are additional consumers any common
part must not break conceptually, though they are not part of the four-concept brief).

Scope note / honesty: the brief said "four design dirs"; the branch actually carries **six**
(`apps/web/src/components/designs/{mission-control,bento,meadow,mission-bento,ledger,swiss}/`).
The four named ones are catalogued exhaustively; ledger + swiss are sketched. Two files contain
dead code (flagged inline). One component (`MeadowReport`) is the only widget that already works
at both workspace and project scope unchanged.

---

## 1. PARTS CATALOG

A PART = a content unit composable inside widgets or other parts. Grouped by family.
For each: where it appears, what it renders, props, data deps, size behavior, theme coupling.
Parts implemented 2+ times across designs are flagged **COMMON-PART CANDIDATE** with a proposed
unified name + prop surface.

### 1.1 Charts

#### Cadence area (commits-per-period time series) — COMMON-PART CANDIDATE ⭐ top DRY win
Proposed: `<Chart variant="area" data={CadencePoint[]} color? dots? label? maxPeriods? />`
(Pure-SVG mode for tile sizes < ~180px height; recharts mode when the box allows axes/tooltip.
The split today is exactly "tiny box → hand SVG, big box → recharts".)

| Design | Implementation | File |
|---|---|---|
| MC | recharts `AreaChart` (monotone, gradient `mc-report-cadence`), h-64 box | `apps/web/src/components/designs/mission-control/report-widgets.tsx` (`ReportActivityWidget`, graph tab) |
| bento | **two**: pure-SVG polyline area `CadenceArea` (viewBox 100×32, no axis, period labels under) for tiles; recharts `AreaChart` in `ReportPanel` ActivityTab | `apps/web/src/components/designs/bento/cadence-area.tsx`; `apps/web/src/components/designs/bento/report-panel.tsx` |
| meadow | hand-rolled `CadenceArea` — Fritsch–Carlson monotone cubic, gradient wash, per-point `<circle><title>`, hairline guides; plus simpler `AreaTrend` (h-14 sparkline w/ same path code) | `apps/web/src/components/designs/meadow/charts.tsx` |
| mb | recharts `CadenceChart` (monotone + dots + custom `CadenceTooltip`), `height` prop (`"100%"` or px) | `apps/web/src/components/designs/mission-bento/charts.tsx` |

- Props today: bento `cadence` (series), meadow `{data, label, color?, maxPeriods?, className?}` (fixed viewBox 280×92), mb `{series, height?, accent?}`.
- Data deps: `ReportExport.projects[].cadence` (or one project's cadence), always pre-aggregated by a *duplicated* `aggregateCadence`-style helper (see §3.4).
- Size behavior: needs a definite-height box (recharts `ResponsiveContainer`); meadow/bento SVG variants stretch via `preserveAspectRatio="none"`.
- Theme coupling: MC `--mc-accent`; bento `--bento-c1`; meadow `--recency-fresh` (+`--border` guides); mb `--mb-accent`. All are "accent" semantics.

#### Donut / distribution ring — COMMON-PART CANDIDATE
Proposed: `<Donut slices={{label,value,fill}[]} size={px} center?={{value,label}} />` (SVG
implementation wins: meadow/`bento StackTile` already do it in ~40 lines, no library, exact
control of gaps; recharts version buys nothing the parts need).

| Design | Implementation | File |
|---|---|---|
| MC | `DonutChart` — recharts PieChart, inner 66%/outer 96%, numeral in hole; used for alerts, stack mix, language mix | `apps/web/src/components/designs/mission-control/analytics-zone.tsx` (also imported by `report-widgets.tsx`) |
| bento | `StackTile` hand-rolled SVG donut (strokeDasharray w/ 2.5px gaps, total in center); `ReportPanel` CodeTab recharts Pie (inner 44/outer 72) | `apps/web/src/components/designs/bento/stack-tile.tsx`; `apps/web/src/components/designs/bento/report-panel.tsx` |
| meadow | `Donut` hand-rolled SVG, `size` prop (default 148), center value+label | `apps/web/src/components/designs/meadow/charts.tsx` |
| mb | `SplitDonut` (recharts, 2-segment in/out split) + `StacksInstrument` recharts donut; project page reuses `SplitDonut` for language share | `apps/web/src/components/designs/mission-bento/charts.tsx`, `instruments.tsx`, `report-data.tsx`→routes `project.$.tsx` `LanguageDonut` |

- Data deps: scan (`stackDistribution`) or report (`languages`, severity counts, token in/out).
- Size behavior: MC `size: string` Tailwind class on outer box (`h-28`, `h-24`, `h-full min-h-32 flex-1`); meadow fixed px; bento 112px / 190px; mb 150×150. **Donut needs ≥~110px to keep a readable hole**; center numeral needs ≥~130px for 2 digits.
- Theme coupling: slice fills come from per-design ramps: MC `--chart-1..6`, bento `--bento-c1..c6`, meadow `--chart-1..5`, mb inline oklch literals + `--mb-*` (mb's `STACK_RAMP` in `instruments.tsx` has **hardcoded oklch colors**, a theme-system hole).

#### Horizontal ranked bars — COMMON-PART CANDIDATE
Proposed: `<HBars rows={{label,value,display?,color?}[]} label />` — meadow's `HBars` is the
cleanest shape; the CSS-class versions (bento `b-dirtybar` row, mb `mb-bar-row`) are the same
part with markup baked into CSS.

- meadow `HBars` — `apps/web/src/components/designs/meadow/charts.tsx` (label+display+proportion bar).
- bento — `b-dirtybar` rows in `severity-tile.tsx` (dirty leaders), `stack-tile.tsx` legend proportion bars, `report-panel.tsx` health-tab rows and AI-leaders rows.
- mb — `mb-bar-row` + `mb-bar-track`/`mb-bar-fill` in `instruments.tsx` (`LabelRows`, `LanguagesPane`, `DirtyInstrument`) and `report-widgets`-like bars in `routes/designs/mission-bento/project.$.tsx` (`LanguagesCarousel` graph slide).
- MC — the only *chart-library* version: recharts vertical-layout `BarChart` in `analytics-zone.tsx` `DirtyLeadersNav` (clickable bars → open project).
- Data deps: `dirtyLeaders(projects)` (scan) or report alert/language tallies.

#### Gauge (semi-circular score) — single implementation
- bento `HealthTile` — 240° SVG arc, `RollNumber` score 0–100 in the middle, band color from score thresholds. `apps/web/src/components/designs/bento/health-tile.tsx`. Data: `healthSummary(projects)` (bento-metrics.ts). Min width ~170px for the arc + numerals.

#### Heatmap (weeks × weekdays activity grid) — single implementation, reused across scopes
- MC `HeatmapInstrument` — `apps/web/src/components/designs/mission-control/analytics-zone.tsx`; grid via inline `gridTemplateColumns` (`1fr` or capped `cellMax` px), 5-step fill ladder from `--mc-accent` color-mixes, footer legend. Props `{counts: Map<dayKey,number>, weeks?, now, ariaLabel, cellMax?}`. Used for fleet touches (dashboard) AND single-repo commit days (project page). Data: `activityCounts(projects)` or `commitLog` day bucketing (`metrics.ts`, route).
- Only MC has it; a common `<Heatmap>` would immediately serve all four.

#### Sparkline / pulse strip (freshness decay replay) — COMMON-PART CANDIDATE
Proposed: `<PulseStrip project now cells? />` — MC `PulseStrip` and mb `PulseLine` are the same
part (24–64 cells, tick marks last activity, intensity = `freshness()` sampled); only the color
token and cell class differ. Both derive from a **duplicated** `pulseCells()` (see §3.4).
- MC: `pulse-strip.tsx` (+ `pulseCells` in `metrics.ts`).
- mb: `pulse-line.tsx` (+ `pulseCells` in `metrics.ts` — near-verbatim copy).
- bento/meadow equivalents: meadow `AreaTrend` (soft area sparkline) and bento tile `CadenceArea` (SVG) play the same role but chart real data instead of the freshness model.

#### Segmented ratio/stacked bar — COMMON-PART CANDIDATE (minor)
Proposed: `<SegBar segments={{value,color}[]} />`.
- meadow `RatioBar` (2-part, `charts.tsx`), meadow `RhythmCard` inline segment bar and `attention.tsx` header chips.
- bento `.b-segbar` (severity split in `severity-tile.tsx` and `report-panel.tsx` HealthTab).
- mb AI token split bar in `AiPane` (`instruments.tsx`).

#### Bar histogram (activity per window)
- swiss "Last touched" ink-slab histogram (`swiss-panels.tsx` ChartBand) and ledger weekly comb (`ledger-figures.tsx`) — hand-rolled; bento `ActivityTile` is recharts. Only bento's is in the four-concept set.
- bento `ActivityTile` — recharts AreaChart over `weeklyActivity(projects, 16)`, custom `ActivityTooltip`. `apps/web/src/components/designs/bento/activity-tile.tsx`.

### 1.2 Tables

#### TanStack table shells — COMMON-PART CANDIDATE (shell), MC-only today
- `McTable` — `apps/web/src/components/designs/mission-control/mc-table.tsx`. Sorting-only feature set (`rowSortingFeature`, `columnVisibilityFeature`, `columnSizingFeature`, `createSortedRowModel`), fixed layout, ratio widths, `minWidth` px floor, empty slot, `onRowClick`. Props: `{columns, data, initialSort?, onRowClick?, minWidth=420, ariaLabel, empty?, className?}`.
- `FleetTable` — `apps/web/src/components/designs/mission-control/fleet-table.tsx`. Full features (+filtering, resizing, `tableMeta.now`), module-scoped session-persisted column sizing, command-bar filter wired through `columnFilters`, 10 column defs with rich cells. This is the "fleet table as widget" reference.
- Column sets built on `createMcColumnHelper`: roots (`analytics-zone.tsx` `RootsTable`), report units / commits / languages / alerts (`report-widgets.tsx` `UnitsTable`, `CommitsTable`, `ReportCodeWidget`, `ReportHealthWidget`).
- **No other design uses TanStack table** — bento/meadow/mb render plain HTML tables (bento `ReportPanel` activity "table" card; mb `CadenceCarousel`/`LanguagesCarousel` table slides in `routes/designs/mission-bento/project.$.tsx`), and ledger/swiss hand-roll CSS-grid tables. A common `<DataTable>` part would replace all of them.

#### Commit table / commit list
- MC `CommitsTable` (tanstack; date/author/subject/hash) — `report-widgets.tsx`.
- bento project page "right behind it" list (`project-page.tsx`, 4 rows, plain `<ul>`).
- Shared `CommitHistoryCell` (commit *graph*, see §1.5) used by all four project pages.

#### Signal/unit ledgers (per-project rows outside the fleet table)
- MC `UnitsTable` (scan-report rows), `FleetTable` cells.
- L `LedgerIndex` (`ledger-index.tsx`) — typeset CSS grid columns (`c-no/c-entry/c-branch/c-sync/c-files/c-commit/c-updated/c-actions`), folio numbering.
- S `SwissSectionTable` (`swiss-table.tsx`) — plain hand table per section.

### 1.3 Stat / readout parts

#### Animated numeral — COMMON-PART CANDIDATE `<AnimatedNumber value tone? />`
Three near-identical implementations differing only in motion flavor:
- MC `AnimatedNumeral` (`command-bar.tsx`) — motion spring chase, `padStart(2,"0")`.
- bento `RollNumber` (`roll-number.tsx`) — roll up/out slide.
- meadow `SoftNumber` (`bits.tsx`) — gentle fade, reduced-motion aware.

#### Stat pair (label-under-numeral) — COMMON-PART CANDIDATE `<Stat label value tone? />`
- MC `MiniStat` (`report-widgets.tsx`), mb `MiniStat` (`instrument-tile.tsx`) and `BigStat` (`instruments.tsx`), meadow `BigFact` (`report.tsx`) and `StatCell` (`report-section.tsx`), bento `TileStat`/`HealthStat`/`SeverityStat`/`AiStat` (`project-tile.tsx`, `health-tile.tsx`, `severity-tile.tsx`, `report-panel.tsx`), S `StatBand` cells (`swiss-panels.tsx`), L `LedgerFigures` (`ledger-figures.tsx`).

#### Vitals band (fleet-wide numeral row) — COMMON-PART CANDIDATE `<VitalsBand vitals />`
- MC `VitalsBoard` (`command-bar.tsx`, spring numerals, 6 cells) and mb `VitalsBand` (`instruments.tsx`, static padded numerals, 6 cells) are the same part reading a **duplicated** `fleetVitals()` (§3.4). S `StatBand` is the same concept with poster-scale numerals.

#### LED row / status lamp — COMMON-PART CANDIDATE `<Led tone label? />`
- mb `Led` + `projectLed()` + `LED_TAG` (`led.tsx`) — full system: error/warn/info/live/nominal tones, blink/breathe animations.
- MC `StatusLed` (inline in `fleet-table.tsx`) — same five states, no animation.
- Severity dots everywhere: shared `AlertIcons`/`AlertBadge` (`apps/web/src/components/git-badges.tsx`), meadow `AlertDots` (`bits.tsx`, tooltips), swiss dot matrix.

#### Git sync glyphs (↑ahead ↓behind ~dirty ✓clean) — COMMON-PART CANDIDATE `<GitGlyphs git large? />`
- bento `GitGlyphs` (`git-glyphs.tsx`) — bordered chips, `large` variant.
- meadow `Chip` + tone map (`bits.tsx`) used for the same signals (+ host chip).
- mb `gitLine` mono spans (↑N ↓N N◇) in `instrument-tile.tsx`; MC `SyncCell`/`N` in `fleet-table.tsx`; MC project page sync row; L sync cell; S `aheadBehindLabel`.
- Shared `GitBadges` exists (`apps/web/src/components/git-badges.tsx`) but only the production dashboard uses it — the designs each re-invented it.

#### Chips / pills
- meadow `chipStyle(tone)` + `Chip` (`bits.tsx`) — token-driven tone system (green/honey/sky/quiet).
- bento stack pill in tile header; mb `mb-chip` (period chips, tabs); MC severity code chips in `AlertsPie` legend.

### 1.4 Git parts (interactive)

- **BranchSwitcher** + **GitActionsToolbar** — SHARED already, all four project pages import from `apps/web/src/components/project-git-actions.tsx`. Props are mutation-slice objects (`{isPending, mutate}`) + `gitBusy`; the pages all own the same mutation block (§3.3). These are the model for "part receives actions, page owns mutations" — but see the context proposal for inverting that.
- **Recency ring** — bento `RecencyRing` (`recency-ring.tsx`): sweep = mosaic `score`, color = tier (`TONE_COLOR`), age text inside; `px` prop 26–48. mb `ScoreRing` (`instrument-tile.tsx`) is a 14px micro version of the same part. meadow `ScoreChip` (`tile.tsx`) is a linear variant. COMMON-PART CANDIDATE `<RecencyRing score tier agePx?>`.

### 1.5 Lists

- **FileBrowser** — shared `apps/web/src/components/file-browser/index.tsx` (`{project: string}`); consumes `files.list/rename/delete/createFolder/upload`; react-arborist-style tree + resizable split (70vh hard-wired; MC overrides via `.mc-files [class*="h-[70vh]"]` in `mission-control.css` — a coupling wart to fix in the widget world).
- **ArtifactsPanel** — shared `apps/web/src/components/artifacts/index.tsx`; `artifacts.config/list/setConfig`.
- **CommitHistoryCell** — shared `apps/web/src/components/project-commit-history.tsx`; `projects.commitLog({path,limit:200})` + `CommitGraph` from `@workspace-welcome/ui/components/commit-graph`.
- **IdeationPanel** — shared `apps/web/src/components/ideation/ideation-panel.tsx`; large ideation.* surface; `key={path}` remount convention; `?ideation=new` deep link.
- **Attention list** — COMMON-PART CANDIDATE `<AttentionList projects onOpen>`:
  - MC `AttentionBoard` (`attention-board.tsx`) — row list, sev tag, PulseStrip, updated, actions.
  - bento `AttentionTile` (`attention-tile.tsx`) — RollNumber header + expandable rows + alert chips.
  - meadow `AttentionBand` (`attention.tsx`) — one-line pill strip, expandable "+N more".
  - mb — triage *channel* (same data via `channelProjects(...,"triage")`), no dedicated part.
  - L `LedgerAttention`, and the triage row of MC's nav-rail counts.
  All read the same derivation ("projects with error|warn alerts, errors first, freshest tiebreak" — duplicated 4×, §3.4).
- **Dirty-leaders list** — MC bars (`DirtyLeadersNav`), bento severity tile lower half, mb `DirtyInstrument`; all read `dirtyLeaders()`.
- **Roots ledger** — MC `RootsTable` (tanstack), meadow `DirectoriesCard` (`context.tsx`), S `RootStrip`, bento/mb root pickers inside report dialogs.
- **Report signals list with summaries** — meadow `ProjectAlertsPanel` cards (`report-section.tsx`), bento `HeroQuality` list (`project-tile.tsx`), mb `SignalsList` (`routes/.../project.$.tsx`), MC `ReportHealthWidget` table — four renderings of `ReportExport.totals.alerts | projects[].alerts`.
- **Report missing / running / stale / fresh states** — COMMON-PART CANDIDATE `<ReportGate>`:
  - MC `ReportMissing` + `ReportStatusLine` (`report-widgets.tsx`).
  - bento `MissingState`/`RunningState`/`SkeletonState` + stale badge + fresh dot (`report-panel.tsx`).
  - meadow `MissingState` + `GeneratedBadge` + stale strip (`report.tsx`, `report-section.tsx` `ProjectReportRequire`).
  - mb `MissingNote`/`PanelState`/`PanelBusy`/`PanelSkeleton`/`PanelMissing` + `SnitchStatusStrip`/`StatusTag` (`instruments.tsx`, `routes/.../project.$.tsx`).
  All four implement the identical 4-state contract (generate button + copyable CLI + staleness chip + html link).

### 1.6 Form parts

- **Create-project wizard** — SHARED, container-independent: `apps/web/src/lib/forms/create-project.tsx` exports `CreateProjectFlow`, `ScaffoldFormBody`, `useScaffoldForm`, `useScaffoldJob`, `buildScaffoldFormFields`, `SCAFFOLD_FORM_PAGES`. Four dialog containers wrap it: MC `CreateProjectDialog` (`console-forms.tsx`), bento `CreateProjectDialog` (`bento-dialogs.tsx`), meadow `MeadowCreateDialog` (`flows.tsx`), mb `CreateConsoleDialog` (`console-dialogs.tsx`). This is the **pattern template** for parts: logic in a hook, chrome per theme.
- **Add-root form** — SHARED `useAddRoot` (`apps/web/src/lib/forms/add-root.ts`); four two-field dialog containers (same files as above).
- **Clone-script picker** — COMMON-PART CANDIDATE `<CloneScriptPicker projects>`: 4 near-identical dialogs (MC `CloneScriptDialog`, bento `CloneScriptDialog`, meadow `MeadowCloneDialog`, mb `CloneConsoleDialog`); shared `buildCloneScript` from `packages/api/src/lib/clone-script.ts`; each re-implements selection state, all/none, copy/download.
- **Report-run picker** (root + period + force → new tab) — bento `ReportRunDialog`, mb `ReportDialog`; both drive the shared `useReportRun()` (`apps/web/src/lib/use-report.ts`, popup-blocker-aware `window.open` choreography). meadow has inline period chips instead (`report.tsx`); MC has no picker (widget-level only).
- **Note editor** ("where I left off") — a `Textarea` + `setNote` mutation wired in 4 project pages (MC ideation tab, bento identity tile, meadow overview, mb ideation channel) — duplicated, trivially extractable.

### 1.7 Layout primitives

- **Tabs** — 4+ implementations: MC `McTabs` + `.mc-tabs/.mc-tab` (segmented); bento uses ui-package `Tabs` (`@workspace-welcome/ui/components/tabs`) styled via `.b-tabs`; meadow pill tabs via `.meadow-tab-active`; mb `MiniTabs` (`.mb-chip`), channel switch (`.mb-channel`) and per-tile `HeroTabs`. COMMON-PART CANDIDATE `<WidgetTabs>`: all render `{id,label}[] + active + onChange`.
- **Carousel** — ui package `@workspace-welcome/ui/components/carousel.tsx` (embla). bento wraps it in `DataCarousel` (`data-carousel.tsx`: label pills + arrows + deterministic auto-advance seeded by `hashSeed(path)`, hover/focus pause, reduced-motion off) — the model for "widget renders different content per size/time". mb uses the raw Carousel for graph↔table slides in `project.$.tsx`. COMMON-PART CANDIDATE `<ViewCarousel cards>` (bento's is the superset).
- **Dialogs** — per-theme shells: MC `ConsoleDialog` (adds `mc` class for portal scoping), bento `BentoDialog` (`.bento-dialog` re-declares tokens), meadow dialogs (relies on `body:has(.meadow)` portal guard), mb dialogs (`.mb-scope`). All wrap the ui `Dialog`.
- **Resizable panels** — `react-resizable-panels@4` `Group/Panel/Separator`: MC route (3 panels stage/context/analytics, session-persisted layout at module scope) and meadow route (mosaic/context, same trick). Custom separator CSS per theme (`.mc-separator`, `.meadow-separator`).
- **Panel/widget shells** — the *widget chrome* parts, see §2 (each design has one: `Widget`/`ReportWidgetShell` (MC), `BentoTile` (bento), `meadow-panel`+`ContextCard` (meadow), `InstrumentShell`/`Panel` (mb)).
- **Keyboard chrome** — `/` focus filter, `1-4` views/channels, Escape clear: duplicated in MC route, mb route, bento route, meadow route (4×, with the same typing-guard logic). `useMediaQuery` duplicated (MC route inline + `meadow/use-media-query.ts`); mb re-implements it as an effect.
- **Key/value row** — MC `Row`, meadow `VitalRow`, mb `Row`, bento `Meta` — trivial COMMON-PART `<KeyValueRow>`.

### 1.8 Derivation helpers mistaken for parts
`compactAge` (bento `bento-metrics.ts` takes ms; meadow `derive.ts` takes ISO — different windows: bento 48h→"d", meadow 14d→"d" then weeks), `formatCost` (3 variants: bento/meadow/mb each differ at <$1 and ≥$1000), `formatCompact`/`formatTokens` (3 variants), `relativeAge`/`relativeScanned`/`relativeTimeShort`/`formatElapsed` (MC console-forms, bento route, mb route, meadow header, mb signal-line — 5 micro-duplicates of "minutes→hours→days"). These belong in one `format.ts` family.

---

## 2. WIDGETS CATALOG

A WIDGET = container unit with chrome hosting parts (or child widgets). For each: parts hosted,
child-widget hosting, resize/breakpoint behavior today, data scope (workspace-wide **W** vs
single-project **P** — this is the axis the future "organized by context" builds on).

### 2.1 Dashboard-level widgets

| Widget | Design | File | Hosts | Nested widgets? | Resize/size behavior | Scope |
|---|---|---|---|---|---|---|
| `Widget` (generic shell) | MC | `mission-control/analytics-zone.tsx` | title+meta+action header over arbitrary part | no (flat) | fills side panel column; grid 1→2 cols ≥560px | W |
| `ReportZone` / report widgets (`ReportActivityWidget`, `ReportAiWidget`, `ReportHealthWidget`, `ReportCodeWidget`) | MC | `mission-control/report-widgets.tsx` | McTabs, area chart, McTables, DonutChart, MiniStat, TokenBar, ReportStatusLine, ReportMissing | Activity contains a table *view*; zone composes 4 widgets | `columns: 1\|2` prop switches stacking vs `1.45fr_1fr` grid (the only widget today with a real "layout per width" prop) | W (scan, first root) **and** P (repo) — same component, `kind` prop |
| `AnalyticsZone` | MC | `mission-control/analytics-zone.tsx` | HeatmapInstrument, AlertsPie(DonutChart), StackPie, DirtyLeadersNav, RootsTable | yes — it is a widget containing 5 `Widget`s | inside resizable Panel; stacks under stage <lg | W |
| `AttentionBoard` | MC | `mission-control/attention-board.tsx` | sev rows, PulseStrip, ProjectActions, updated cells | no | fixed max 6 rows + overflow button | W |
| `FleetTable` (the stage) | MC | `mission-control/fleet-table.tsx` | tanstack table with StatusLed, UnitCell, StackCell, BranchCell, SyncCell, PulseStrip, AlertIcons, ProjectActions | no | ratio widths + 720px floor + column resize persisted in-session | W |
| `VitalsBoard` | MC | `mission-control/command-bar.tsx` | AnimatedNumeral ×6 | no | wraps | W |
| `NavRail` | MC | `mission-control/nav-rail.tsx` | icon buttons + live counts | no | vertical ↔ horizontal prop | W |
| `BentoTile` (shell) + band tiles: `HealthTile`, `ActivityTile`, `StackTile`, `AttentionTile`, `SeverityTile` | bento | `bento/{bento-tile,health-tile,activity-tile,stack-tile,attention-tile,severity-tile}.tsx` | gauge arc+RollNumber+HealthStat; recharts area; SVG donut+legend bars; attention rows; segbar+SeverityStat+dirty bars | no | fixed CSS spans (`.sp-health` 3/12 etc.) + shared band height `.b-band-h` 300–320px | W |
| `ReportPanel` (pulse band) | bento | `bento/report-panel.tsx` | ui Tabs ×4, DataCarousel(graph↔table), recharts area/donut, HBar-ish rows, AiStat grid, Missing/Running/Skeleton states | DataCarousel nests alternative *views* (proto-`2x2=…` pattern) | `.sp-pulse` 12/12 + `.b-pulse-h` 340–360px; inner `lg:grid-cols-[2fr_3fr]` | W **and** P (same component, `kind`) |
| `ProjectTile` ×5 tiers | bento | `bento/project-tile.tsx` | per tier: hero=DataCarousel(CadenceArea/HeroQuality/HeroAi)+GitGlyphs+RecencyRing; feature=DataCarousel(graph/table)+TileStat; large=LastCommitLine+TileStatLine; medium=TileStatLine; compact=ring+AlertIcons | DataCarousel = nested view-widget | **the** size-breakpoint exemplar: `tier`-keyed if-chain = un-extracted `3x3={…} 2x1={…} 1x1={…}`; motion layout-animates between placements | W tile, P via project-page reuse of parts |
| `AttentionBand` | meadow | `meadow/attention.tsx` | chips, SoftNumber counts | no | single row, expands | W |
| `ContextPanel` (+ `ContextCard` shell) | meadow | `meadow/context.tsx` | MeadowReport, MomentumCard(AreaTrend+SoftNumber), RhythmCard(segbar), StacksCard(chips), DirectoriesCard | yes — a *widget column* containing 5 cards; `fill` prop switches scroll-inside vs natural height | resizable Panel 15–34%; `fill` bool = height behavior switch | W |
| `MeadowReport` | meadow | `meadow/report.tsx` | pill Tabs ×4, period chips, CadenceArea, HBars, Donut-less code tab, RatioBar, BigFact, MissingState, GeneratedBadge | no | natural height in rail | W **and** P — reused verbatim on project page (the only widget already doing this cleanly) |
| Project tile ×5 tiers | meadow | `meadow/tile.tsx` | numeral (`compactAge`), ScoreChip, Chip git row, CadenceArea, FactsTable, HeroTileBody tabs | mini tab panel nested in hero | tier if-chain; medium switches to *horizontal* layout (row!) — the only design that changes orientation per size | W |
| `SignalLine` | mb | `mission-bento/signal-line.tsx` | ReportStrip (periods, StatusTag, regenerate, html link) + `mb-line` grid of AlertsInstrument, ActivityInstrument, StacksInstrument, DirtyInstrument | yes — an instrument row widget hosting 4 instrument widgets | `.mb-line` 12-col grid: 12/12/6/6 <1280px → 2/6/2/2 ≥1280px (pure CSS breakpoints, no JS) | W |
| `InstrumentTile` ×5 tiers | mb | `mission-bento/instrument-tile.tsx` | Led+tag, ScoreRing, SnitchStats(MiniStat), HeroTabs(CadenceChart/signals list/language bars), PulseLine fallback, gitLine, AlertIcons | HeroTabs again = nested view-widget | tierIndex if-chain; compact/medium collapse to name+LED | W |
| `WorkspaceReportProvider` | mb | `mission-bento/report-data.tsx` | (data widget — no chrome) | provides `byPath` to SignalLine + all tiles | n/a | W — **the only React context in any design** |

### 2.2 Project-page widgets

| Widget | Design | File | Hosts | Notes / scope |
|---|---|---|---|---|
| State band (4 `PanelBlock`s + alerts footer) | MC | `routes/designs/mission-control/project.$.tsx` | BranchSwitcher, GitActionsToolbar, sync rows, last commit + Issues/PRs links, CommitHistoryCell, AlertBadge row | xl: `1.15fr_0.75fr_1fr_1.1fr` grid |
| Commit-pulse + Recent-commits shells | MC | same route | HeatmapInstrument, MiniStat, CommitsTable | `lg:grid-cols-2` |
| Tab channels (overview/activity/code/ai·health/files/artifacts/ideation) | MC | same route | Report widgets per tab; FileBrowser; ArtifactsPanel; IdeationPanel+note | whole page = one big tab widget |
| Identity tile / state tile / pulse-summary tile | bento | `bento/project-page.tsx` | RecencyRing, Meta rows, action buttons, note, GitGlyphs, BranchSwitcher+GitActionsToolbar, recent commits list, CadenceArea, cost numeral | `.sp-id/.sp-state/.sp-summary` spans, min-h 320→460px |
| Git panel + report widget + last-commit + note | meadow | `routes/designs/meadow/project.$.tsx` | MeadowReport, VitalRows, ProjectReportStats, ProjectCadencePanel, ProjectLanguagesPanel(Donut+HBars), ProjectAlertsPanel, ProjectAiBand, MomentumCardBase, CommitHistoryCell | every report panel wrapped in `ProjectReportRequire` gate |
| Overview channel | mb | `routes/designs/mission-bento/project.$.tsx` | **InstrumentTile re-rendered as a hero** (placement rewritten to 12×3 hero — a widget hosting the dashboard's project widget), GitPanel, merged Signals panel (AlertsCensus + SignalsList), LanguageDonut, Pulse panel (PulseLine cells=64 + TouchRows) | The single clearest precedent for "dashboard widget reused on project page" |
| Activity / Code / AI channels | mb | same route | CadenceCarousel (graph↔table), LanguagesCarousel, SignalsList, AiChannel (BigStat + SplitDonut variant), PulseLine cells=48 | `[&>*]:h-[420px]` fixed-height wrappers |

### 2.3 Widget shell census (the future `Widget` chrome)

| Design | Shell | Header pattern |
|---|---|---|
| MC | `.mc-panel` via `Widget` / `ReportWidgetShell` | mono caps title + optional meta (right) + optional action |
| bento | `BentoTile` (`span`, `action`, `pinned`) | content-owns-header (no fixed header slot) |
| meadow | `.meadow-panel` + `ContextCard` / inline `<section>` | icon chip + title (+ optional trailing) — `SectionIntro` variant in `bits.tsx` |
| mb | `InstrumentShell` / `Panel` (`.mb-panel` + `.mb-inst-head`) | `.mb-label` + meta |

All four are "titled box with optional meta/action and a content slot" — one `Widget` with
`title/meta/action/tabs` slots covers them.

---

## 3. DATA LAYER MAP

### 3.1 tRPC surface consumed by the designs

**Queries**
- `projects.scan` — every dashboard + project page; the workspace payload (`projects[]`, `rootErrors[]`).
- `roots.list` — every dashboard; bento/mb report dialogs; meadow context panel.
- `reports.command` `{kind, path, period?}` — resolves key + copyable CLI (never runs). All four.
- `reports.jsonExport` `{key}` — the chart payload (`ReportExport`). All four.
- `reports.jsonExports` — index; only mb's `useProjectSnitchReport` (scan fallback).
- `reports.job` `{key}` — poll while running (`refetchInterval` fn: 1000–2000ms while running, else false). All four.
- `projects.commitLog` `{path, limit}` — MC project (200, shared by graph+widget+heatmap), bento project (4), CommitHistoryCell (200, per-mount).
- `projects.branches` / `projects.switchSafety` — inside shared `BranchSwitcher`.
- `ide.status` — 4 project pages, poll 5s only while installing/starting (intent ref keeps it alive).
- `files.*`, `artifacts.config/list`, `settings.get`, `ideation.*` — inside the shared list parts (§1.5/§1.6).

**Mutations**
- `reports.generate` `{kind,path,force,period?}` — 5 call sites (MC useReportExport, bento ReportPanel + route dataset, meadow useReportRunner, mb provider + useProjectSnitchReport + shared useReportRun).
- `projects.setPinned`, `projects.setHidden` (with undo toast), `projects.open` `{path,target}`, `projects.touchLastOpened`, `projects.setNote` — repeated per design.
- `projects.fetchRemote / pull / push / fetchBranch / switchBranch` — the git quintet, one block per project page.
- `roots.add`, `scaffold.start` (+ `scaffold.job` query poll), `ide.open`.

### 3.2 react-query patterns (what to keep)

- **Key-chain dedup, not state lift (yet)**: every report consumer builds `command → key → jsonExport` with identical query keys, so react-query dedupes; bento's comment says it explicitly ("the query keys match ReportPanel's internal ones exactly"). meadow adds `staleTime` (10min command / 1min export) — the only design that does.
- **`enabled` gating for lazy fetch**: meadow `useReportJson(scope, enabled)` fetches only for warm-front tiles; bento gates on `firstRoot !== undefined`; MC gates jsonExport on `key !== null`.
- **Function-form `refetchInterval`** everywhere (job poll, IDE poll, scaffold poll) — stops when settled.
- **One clock per data epoch**: `const now = scan.dataUpdatedAt || Date.now()` shared by pulse strips/rings/heatmap so numerals and sparklines agree (all four).
- **Session-persisted geometry at module scope**: MC panel layout + MC fleet column sizing; meadow panel layout. Survives navigation, resets on reload.
- **MutationCache mining**: bento + mb routes recover the scaffold wizard input (`scaffold.start` variables) to seed ideation — duplicated helper `latestScaffoldStartInput`.
- mb `WorkspaceReportProvider` — the one place data flows via context; its shape (`status`, `exportData`, `byPath`, `key`, `period`, `setPeriod`, `regenerate`, `regenerating`, `latestUpdated`) is a working draft of the future Report context.

### 3.3 The "context" today is duplication

No contexts exist except mb's report provider. Concretely duplicated per project page (4×,
near-verbatim, ~150 lines each in `routes/designs/mission-control/project.$.tsx`,
`components/designs/bento/project-page.tsx`, `routes/designs/meadow/project.$.tsx`,
`routes/designs/mission-bento/project.$.tsx`):
git mutation quintet + `gitBusy`/`diverged`, IDE open choreography (`ideUrl`, `installingLabel`,
`IDE_POLL_MS`, `ideOpening`/`ideTab` refs), `copyPath`, `saveNote` + note draft effect,
`touchLastOpened` effect, `invalidateScan` (scan + commitLog). And per dashboard route (4×):
`/`+Escape keyboard handler, `matchProject` filter wiring, rescan handler, dialog open state.

### 3.4 Duplicated derivations (the metrics twins)

| Derivation | Copies | Files |
|---|---|---|
| `pulseCells` (freshness replay) | 2 | `mission-control/metrics.ts`, `mission-bento/metrics.ts` |
| `fleetVitals` | 2 | `mission-control/metrics.ts`, `mission-bento/metrics.ts` (slightly different fields: attention/triage, aheadSum/unshared) |
| `worstSeverity` / `severityRank` | 4 | mc `metrics.ts`, bento `bento-metrics.ts`, mb `metrics.ts`, + inline `severityRankOf` in `fleet-table.tsx`; meadow's `flaggedProjects` is the same idea |
| `stackDistribution`/`stackBreakdown`/`stackPieRows` | 4 | mc, bento, meadow (`derive.ts`), mb `metrics.ts` (+ swiss `swiss-data.ts`) |
| `dirtyLeaders` | 4 | mc, bento, mb metrics; swiss data |
| `updatedMs`/`activityInstantMs`/`isHot`/`byUpdatedDesc` | 2 | mc + mb metrics |
| `aggregateCadence` (sum per-period commits) | 4 | mc `flattenCadence`, bento `aggregateCadence`, meadow `toReportView` (scan branch), mb `report-utils.aggregateCadence` |
| alert tally by label | 3 | bento `tallyAlerts`, meadow `toReportView`, mb `aggregateAlertLabels` |
| language rows top-N | 4 | mc inline, bento `topLanguages`, meadow view, mb `languageRows` |
| report-by-path index | 2 | bento `indexReportExport`, mb `indexProjectsByPath` |
| `severityCounts` | 2 | bento `bento-metrics.ts`, meadow `derive.ts` (mc `severityLedger` close cousin) |
| `compactAge` | 2 incompatible | bento (ms arg), meadow (ISO arg, different windows) |
| `formatCost` / `formatCompact` / `formatTokens` | 3 each | bento `project-tile.tsx`+`report-panel.tsx`, meadow `report-data.ts`, mb `report-utils.ts` |
| `formatElapsed` | 3 | mc `console-forms.tsx`, bento route, mb route |
| useOpenProject per design | 4 (+1 shared) | mc/bento/meadow/mb hooks — identical except route string; shared `@/lib/open-project` targets production route |
| `useMediaQuery` | 2 (+mb effect variant) | mc route, meadow lib |
| latest scaffold seed recovery | 2 | bento route, mb route |

### 3.5 Proposed COMMON CONTEXT NAMING CONTRACT

Matches what parts actually read today; every key below is already a de-facto prop name in at
least two designs.

```
WorkspaceProvider            // scope: the whole app scan
  projects: Project[]        // scan.data.projects (filter applied via useWorkspaceFilter, NOT by re-providing)
  roots: Root[]
  rootErrors: ScanError[]
  now: number                // scan.dataUpdatedAt || Date.now() — the shared clock
  scanState: 'loading'|'error'|'empty'|'ready'
  refresh(): void            // invalidate projects.scan (+roots.list)
  vitals: FleetVitals        // one implementation of the merged fleetVitals
  filter / setFilter         // matchProject text, owned here so every widget narrows together

ProjectProvider { path }     // scope: one project page
  project: Project | null
  git: { busy, diverged, fetch, pull, push, fetchBranch, switchBranch }   // the quintet, ONCE
  open(target:'editor'|'terminal'|'folder'); copyPath(); touch()
  note { draft, setDraft, save }
  commitLog(limit): query    // ONE cached entry per path+limit shared by graph/heatmap/table
  ide { status, open(), installingLabel }
  report: ReportProvider value scoped kind='repo'   // see below

ReportProvider { kind:'repo'|'scan', path, period? }   // superset of mb's WorkspaceReportState
  status: 'no-root'|'loading'|'missing'|'running'|'stale'|'fresh'
  export: ReportExport | null
  byPath: Map<string, ReportExportProject>
  entry(path): ReportExportProject | null    // tiles' lookup
  key: string | null
  command: string | null; commandError: string | null
  period; setPeriod()
  generate(force=false): void
  generating: boolean
  view: ReportView                          // meadow's toReportView — make it THE normalizer
```

Naming rules for parts (the "common naming contract"): parts read `project`, `placement`,
`report`/`snitch entry`, `vitals`, `alerts`, `now` — never route state; actions arrive as
`onOpen(path)`, `generate()`, `refresh()`; every report part consumes the `status` enum, not
booleans. This is exactly the vocabulary mb standardized internally; promoting it app-wide
deletes the most code.

---

## 4. THEME COUPLING INVENTORY

| | MC | bento | meadow | mb |
|---|---|---|---|---|
| Scope class | `.mc.mc` (doubled to beat `.dark`) on page root | `.bento-root` | `.meadow` (light theme overriding app `.dark`) | `.mb.mb` page root + `.mb-scope.mb-scope` for portals |
| CSS load | route `head: links` `mission-control.css?url` | `import ".../bento.css"` in route + project-page component | `import ".../meadow.css"` in route + project page | `import ".../mission-bento.css"` |
| Token strategy | full shadcn token re-declare + `--mc-*` structure + `--chart-1..6` | full re-declare + `--bento-c1..6`, `--tone-*` recency ramp, `--bento-radius` | full light re-declare + `--recency-*`, `--pinned-accent`, `--chart-1..5` | full re-declare + `--mb-*` (accent/amber/red/blue/panel/line/radius) |
| Component classes | `.mc-panel/-input/-label/-th/-row/-tabs/-tab/-kbd/-separator/-resize-handle/-sort-tick/-chart-bar/-stale-dot/-dialog/-pulse-cell/-scroll` | `.b-tile(±action/pinned)/-num/-label/-glyph/-age/-legend/-skel/-segbar/-dirtybar/-kbd/-tabs/-data-carousel` + `.sp-*` spans + `.b-cell` custom-prop placement | `.meadow-panel/-lift/-focus/-hero/-soft-block/-tab-active/-mosaic/-scroll/-context/-separator` | `.mb-panel/-tile(±action/pinned)/-num/-label/-input/-kbd/-led(±tone)/-pulse-cell/-channel/-chip/-act/-bar-row/-track/-fill/-skel/-scroll/-inst-head` + `.mb-mosaic/-line(±variant)` |
| Portal handling | `mc` class added to `DialogContent` (`mc-dialog` styles) | `.bento-dialog` class re-declares all tokens on the portal | **`body:has(.meadow)` guards** re-declare tokens on `[data-slot=dialog-content]`, dropdown/select/tooltip/sheet/popover contents + sonner toaster | `.mb-scope` class on DialogContent **and** DropdownMenuContent/SelectContent |
| recharts coupling | `.mc-chart text`, `.mc-chart-bar` | `.bento-root .recharts-*` token-fills | none (no recharts in meadow) | `.mb .recharts-*` |
| Hardcoded colors | none found (all vars) | `oklch(1 0 0 / x)` neutrals inline (fine) | none found | **`STACK_RAMP` oklch literals** in `instruments.tsx` + `LanguageDonut` in `project.$.tsx` |

**What a theme-preset system must cover** for parts/widgets to render without custom classes:
1. The base shadcn token set (background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring) — re-declarable per scope.
2. Semantic tokens used directly by parts: `--sev-error|--sev-warn|--sev-info`, `--state-positive`, `--recency-fresh|-stale|-wash`, `--pinned-accent|-wash`, `--chart-1..6`, `--font-mono`, `--eyebrow`. These are the *real* part API; every design defines them, values differ.
3. Portal strategy as infrastructure, not per-theme CSS: meadow's `body:has()` and mb's `.mb-scope` should become one mechanism (theme provider sets a body-level scope or portals render inside the theme root).
4. Chrome tokens (radius, hairlines, panel bg): MC/mb want 0–6px + hairline; bento 20px glazed; meadow rounded elevated. Parts must only consume semantic tokens + accept a chrome slot/class from the widget shell — the current `mc-panel/b-tile/meadow-panel/mb-panel` four-way split is exactly the "theme preset" seam.
5. Kill list for unification: mb's oklch literals; MC's `.mc-files [class*="h-[70vh]"]` escape hatch (FileBrowser must take a height prop); per-theme separator/tabs/kbd/skeleton classes that are visually 90% identical.

---

## 5. DUPLICATION MATRIX

Concept → each design's version → DRY recommendation.

| Part family | MC | bento | meadow | mb | Recommendation |
|---|---|---|---|---|---|
| Cadence chart | recharts area | SVG spark (tiles) + recharts area (panel) | hand-rolled monotone SVG (+`AreaTrend`) | recharts area + dots | ONE `<Chart variant="area">` with `compact` SVG renderer for <~180px boxes; adopt meadow's monotone path for the SVG mode |
| Donut | recharts DonutChart | SVG donut (stack) + recharts (code) | SVG `Donut` | recharts (stacks, split) | ONE SVG `<Donut>` (meadow/bento shape); parameterize slice count/gap/center |
| Ranked bars | recharts v-layout bars | CSS `b-dirtybar` rows | `HBars` | CSS `mb-bar-row` | ONE `<HBars>`; keep clickable-row option (MC dirty bars open projects) |
| Heatmap | `HeatmapInstrument` | — | — | — | Promote MC's as the common `<Heatmap>` unchanged |
| Pulse strip | `PulseStrip` | — | (AreaTrend surrogate) | `PulseLine` | Merge onto one `pulseCells` in a shared metrics module |
| Seg bar | — (donut instead) | `.b-segbar` | `RatioBar` + rhythm bar | AI split bar | `<SegBar segments>` |
| Recency ring/score | — (no ring) | `RecencyRing` | `ScoreChip` (linear) | `ScoreRing` (14px) | `<ScoreRing size>` + `<ScoreChip>` on one score source |
| Gauge | — | `HealthTile` arc | — | — | Keep bento's as `<Gauge>` if the concept survives |
| Table shell | `McTable`+`FleetTable` (tanstack) | plain HTML table | `FactsTable` dl | plain HTML tables | ONE `<DataTable>` (tanstack core, sorting default-on, `minWidth`, ratio widths) + `<KVList>` for the dl variants |
| Vitals band | `VitalsBoard` (springs) | — (health tile instead) | — (header counts) | `VitalsBand` | ONE `<VitalsBand cells>` + merged `fleetVitals` |
| Animated numeral | `AnimatedNumeral` | `RollNumber` | `SoftNumber` | — (static) | ONE `<AnimatedNumber variant="spring|roll|fade">` or just settle on roll/fade |
| Stat cell | `MiniStat` | `TileStat`/`HealthStat`/`AiStat` | `StatCell`/`BigFact` | `MiniStat`/`BigStat` | `<Stat label value tone size?>` |
| LED/status | `StatusLed` | (AlertIcons) | `AlertDots` | `Led`+`projectLed`+`LED_TAG` | `<Led tone>` + one `statusOf(project)` (today 3 names: StatusLed/projectLed/worstSeverity) |
| Git glyphs | `SyncCell`/N | `GitGlyphs` | `Chip` row | `gitLine` | `<GitGlyphs git large?>` (bento's prop surface) |
| Attention list | `AttentionBoard` | `AttentionTile` | `AttentionBand` | triage channel | `<AttentionList density="rows|tile|strip">` on one derivation |
| Report gate (missing/running/stale/fresh) | `ReportMissing`+`ReportStatusLine` | `Missing/Running/Skeleton`+badges | `MissingState`+`GeneratedBadge`+`ProjectReportRequire` | `MissingNote`/`PanelState`+`SnitchStatusStrip` | ONE `<ReportGate status …>` + `<ReportStatusLine>` — biggest state-machine duplication |
| Tabs | `McTabs` | ui Tabs (`.b-tabs`) | pill tabs (`.meadow-tab-active`) | `MiniTabs`/`mb-channel` | `<WidgetTabs>` (ui tabs underneath, per-theme skin via chrome token) |
| Carousel | — | `DataCarousel` | — | raw Carousel ×2 | Promote bento's `DataCarousel` (label pills + seed-staggered auto-advance) |
| Clone picker | `CloneScriptDialog` | `CloneScriptDialog` | `MeadowCloneDialog` | `CloneConsoleDialog` | One container-independent flow hook + per-theme dialog (mirror `lib/forms`) |
| Report pipeline hook | `useReportExport` | route chain + panel chain | `useReportJson`/`useReportRunner` | provider + `useProjectSnitchReport` | ONE provider (§3.5) + `useReportRun` for tab-open |
| Project-page git/IDE/note block | ✔ 1st copy | ✔ 2nd | ✔ 3rd | ✔ 4th | `ProjectProvider` — single largest LOC win |
| Keyboard/search chrome | route handler | route handler | route handler | route handler | `useConsoleKeys()` in Workspace context |
| `openProject` | hook | hook | hook | hook | one hook with design-agnostic href builder param |

---

## 6. SIZE / PLACEMENT FACTS

### 6.1 What `mosaic-layout` provides (`apps/web/src/lib/mosaic-layout/index.ts`)

- `computeMosaicLayout(projects: MosaicInputProject[], {now, gridColumns=12, sizes=DEFAULT_MOSAIC_SIZES}) → {columns, rows, placements}`.
- `MosaicPlacement = {path, cols, rows, x, y, order, score, tierIndex, tier, pinned}` —
  **score** is the log-scaled set-relative recency 0..1 (rings/gauges render it),
  **tierIndex/tier** map to the ladder (`3×3 hero, 2×3 feature, 2×2 large, 2×1 medium, 1×1 compact`;
  custom sizes fall back to `"w×h"` labels), **order** is reading order (pinned first, freshest
  first, path tiebreak). Tier cuts blend log-score with set-relative quantile rank 50/50; pinned
  forces tier 0. Packing is a fill-the-line skyline on level foundations; deterministic; pure TS.
- Options let designs shrink the ladder (meadow phones: 2 cols, sizes 2×2/2×1/1×1; mb phones:
  1 col, sizes 1×3/1×1).
- **Limit for the widget system**: the packer sizes *projects by recency*. A generic widget grid
  needs the same placement math but with user/semantic sizing — the `sizes` ladder + `pinned`
  override is the seam to generalize (widget weight instead of recency tier).

### 6.2 How each design consumes it

- **MC**: doesn't (tables instead) — the anti-mosaic data point.
- **bento**: wraps in `buildMosaic` (`bento-metrics.ts`, adds `byPath` + attention list), 12 cols, default ladder, placement flows into CSS custom props `--x/--y/--cols/--rows` consumed by `.b-cell` (768px+; below = full-width stack), motion `LayoutGroup` animates tiles between boxes.
- **meadow**: direct `computeMosaicLayout` in route with breakpoint-adaptive `{columns, sizes}` (`useMosaicConfig`: 12/8/2); placement applied as **inline** `gridColumn/gridRow` on each tile; motion `layout` on the tile itself. Below md the ladder is physically smaller.
- **mb**: route recomputes per breakpoint (12/6/1, effect-driven), inline placement, `AnimatePresence popLayout`; **project page recomputes the whole workspace layout just to find this project's placement, then rewrites it to `{cols:12, rows:3, tier:"hero"}`** — i.e. "host the dashboard's tile widget at forced size" (precedent for widget reuse + size override).
- Row units: bento `.bento-mosaic` auto-rows 92→96px; meadow 84→100→104px; mb 88→96px. So a
  1×1 tile is ~84–96px + gap; a 3×3 hero ~280–300px tall on a 12-col desktop.

### 6.3 What a `<Widget 2x2={…} 1x1={…}>` breakpoint system must account for

Observed minimum content sizes (from the tier if-chains — the de-facto `min-content` per part):

| Part | Min observed box | Notes |
|---|---|---|
| Donut (with center numeral) | ~112px (bento StackTile)–148 (meadow); MC uses h-24/h-28 (96–112px) | below ~110px the hole numeral illegible → switch to `SegBar` |
| Cadence area (compact/SVG) | ~40px tall (meadow tile `min-h-10`–`min-h-12`, bento spark flex-1) | SVG variant only; no axes/tooltips |
| Cadence area (recharts) | ~112px (mb HeroTabs `height={112}`)–h-64 (MC) | needs definite px height — ResponsiveContainer will not size to content |
| Bars row (HBar) | ~18px/row + labels; mb caps at 4–8 rows with `justify-evenly` | rows×(bar 5–6px + label 11px text) + padding |
| Heatmap | weeks×(cell+3px gap) width; 12 weeks ≈ 12×~14px; MC caps `cellMax=26` and centers on wide cards | height fixed at 7 rows + legend |
| Tables | `minWidth` floors: McTable 420 default (roots 140, health 260, units 380, commits 400), FleetTable 720 | tables below floor must scroll-x or shed columns; ledger/swiss instead fold to cards on phones |
| Pulse strip | w-32 (MC attention row) / w-full; height h-3–h-3.5; mb stretches cells to 48–64 on project page | pure decoration, any width |
| Vitals numeral | ~64×34px each (MC 28px font at 2200px+ → 34px) | wraps to 2 rows when narrow |
| Tab pills + content | tabs ~24px + panel min ~48px | every design hides tabs below tierIndex≥3 |
| Led + name row (compact tile) | ~84×84px total (1×1 cell) | compact tiles drop everything but name+LED/ring |

Breakpoint facts to encode:
1. The tier ladder is already a size vocabulary: 3×3/2×3/2×2/2×1/1×1 — a widget breakpoint API
   should reuse tier names, not raw cells, so themes can remap cells.
2. Per-tier content shedding observed: hero = carousel/tabs + stats + git + ring; feature = chart
   OR stats; large = stats + last commit; medium = one stat line (or horizontal orientation —
   meadow); compact = name + LED/ring only. This is the default content ladder per widget kind.
3. Orientation flips exist (meadow medium = row layout) — breakpoint system needs to allow
   row/column switch, not just show/hide.
4. Resizable-panel widgets (MC/meadow) mean width can change *without* a tier change → parts
   need CSS-driven responsiveness (grid-cols collapse at 560/900/1280px, as MC/bento already do)
   in addition to tier breakpoints.
5. Motion: placement changes animate (motion layout) — widget system must keep tiles as direct
   grid children (mb notes AnimatePresence renders no wrapper DOM; bento achieves the same via
   CSS-prop placement on the motion.div itself).

---

## Appendix A — the other two concepts

- **swiss** (`apps/web/src/components/designs/swiss/`, route `routes/designs/swiss.tsx`): poster-scale `StatBand`, hand-rolled ink histogram + severity dot-matrix + stack ink bars (`ChartBand`), `RootStrip`, `SwissSectionTable` (plain HTML). Reads `projects.scan` + `roots.list` only — no report integration. Theme: `swiss.css` (single red accent `--swiss-red`, hairline modular grid).
- **ledger** (`apps/web/src/components/designs/ledger/`, route `routes/designs/ledger.tsx`): typeset index — `LedgerMasthead`, `LedgerFigures` (oversized numerals + weekly comb + hatched stack bar + alert tally), `LedgerIndex` (folio-numbered CSS-grid ledger with the standard pin/hide/open actions), `LedgerAttention`, `LedgerAppendix`. Same two queries. Theme: `ledger.css` (serif display + rules).
- Both consume the same scan derivations (worst severity, stacks, activity buckets) in yet more
  copies (`swiss-data.ts`, `ledger-*`) — include them in the shared-metrics consolidation even
  though they're outside the four-concept brief.

## Appendix B — honesty notes / ambiguities

1. **Dead code**: `tilePlan`/`TiledProject` in `apps/web/src/components/designs/meadow/derive.ts`
   (an earlier hero/big/wide/dot ladder) is exported but consumed nowhere — `tile.tsx` uses
   `computeMosaicLayout`. Similarly `MosaicLayout`/`MosaicPlacement` re-exports in
   `bento/bento-metrics.ts` are aliases of the shared types.
2. **`useReportExport` staleness quirk** (MC `report-widgets.tsx`): its own `stale` flag calls
   `isReportStale(generatedAt, null)` (never stale); the *route* computes real staleness via
   `useStaleAgainst`/`latestUpdatedAtOf`. The provider contract (§3.5) must own this, or every
   widget re-derives it differently — as today.
3. **Two severity vocabularies**: scan alerts use `error|warn|info`; report alerts use
   `critical|warning|info`. Every design hand-maps between them (`SEV_FILL`, `SEVERITY_COLOR`,
   `severityColor`, `projectLed`…). The common parts must pick one wire vocabulary + one mapping.
4. **bento tile `reportStale`** is computed per-tile from the workspace scan export's
   `generatedAt` vs *that project's* `updatedAt` — a per-project staleness inside a workspace
   report; other designs compute staleness only against the scope's max updatedAt. Which rule
   applies per widget-scope is a real design decision for the Report context.
5. **Carousel heights**: embla carousels need the `.b-data-carousel`/`.mb [data-slot=carousel-content]`
   CSS height-chain hacks to fill flex panels — the ui Carousel component should own that.
6. **The brief's claim "charts may be ONE chart part with a variant property"** is confirmed
   viable: all four cadence implementations consume the same `{period, commits}[]` shape; the
   only real variance is renderer (SVG vs recharts), dots, and axis density.
