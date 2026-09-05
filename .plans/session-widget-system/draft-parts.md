# PARTS specialist — draft (round 1)

Domain: the common parts library — taxonomy → concrete parts, prop conventions, portal theming
infrastructure, min-content specs, naming, library location, motion conventions.
Everything here is written against `docs/research/widget-part-catalog.md` (the 18 candidates,
duplication matrix §5, theme coupling §4, min-content facts §6.3) and the settled decisions in
`context.md`.

---

## 0. Approach and positions (summary)

1. **Two-layer library.** Presentational primitives (props-in, tokens-only, zero app imports) live
   in `packages/ui/src/components/`; context-consuming parts (read the four contexts, wrap shared
   components) live in `apps/web/src/parts/`. The rule is mechanical: if a file imports
   `@workspace-welcome/api`, `@/lib/*` app code, or a context hook, it cannot be in packages/ui.
   ui parts declare their own minimal structural prop types (e.g. `GitGlyphs` takes
   `{ isRepo, ahead?, behind?, dirtyCount? }`, NOT `GitInfo`) so ui never depends on api.
2. **One chart ENGINE, plus engine-less geometry primitives.** Settled #9 says recharts everywhere,
   no second engine. I read "engine" = axis/coordinate/tooltip machinery. So: ONE `Chart` part
   (recharts, `variant: "area" | "bars"`, auto-compact SVG mode below the recharts floor — meadow's
   monotone path). `Donut`, `SegBar`, `HBars`, `PulseStrip` are proportional geometry — no engine
   involvement — and stay hand-SVG/div (meadow/bento proved ~40 lines each; recharts PieChart buys
   nothing). This collapses all 5 chart-family candidates into one engine + four cheap shapes.
   **This is my explicit interpretation of settled #9; if the owner meant donut-on-recharts too, it
   is a 1-file swap inside `chart.tsx` — object, not architecture.**
3. **Portal theming = `ThemeScope` infrastructure** (§3 below): one mechanism replacing all four
   per-design hacks (`.mc.mc` doubling + `mc` class on DialogContent, `.bento-dialog` re-declare,
   `body:has(.meadow)`, `.mb-scope`). Tokens declare once under `[data-ww-theme="x"]` on a scope
   div that ALSO hosts the portals.
4. **Parts are headerless.** Title/meta/action chrome belongs to the Widget shell (architect's
   domain). Parts take `ariaLabel` for accessibility, never a visible title. One exception
   documented below (`ViewCarousel` label pills).
5. **Canonical severity everywhere in the part API** (`critical | warning | info`, settled #8) —
   including a one-time token rename `--sev-error|--sev-warn` → `--sev-critical|--sev-warning`
   (base `globals.css` + each theme CSS re-declares them anyway during migration). Flagged as a
   decision for the synthesizer; it removes a second vocabulary from the token layer.
6. **Parts don't self-swap below min-content, with one exception.** Every ui part exports a
   `MIN_CONTENT` constant; the widget's size-class ladder substitutes fallbacks (feeds architect's
   nearest-defined fallback, settled #6). The single exception is `Chart`, which MUST flip
   recharts→compact internally because `ResponsiveContainer` degenerates rather than failing
   visibly under continuous resize (panel dragging).

---

## 1. THE COMMON-PART INVENTORY

18 catalog candidates + 6 additions (Heatmap, Gauge, SeverityDots, Chip, KVList, ProjectPulse —
each justified below). "Unifies" lists the design implementations deleted at adoption.

### 1.1 Chart family — `packages/ui/src/components/`

| Part (file) | Unifies | Prop surface | MIN_CONTENT (w×h) | Below-min fallback |
|---|---|---|---|---|
| `Chart` (`chart.tsx`) | MC recharts AreaChart; bento `CadenceArea` (SVG) + ReportPanel recharts area; meadow `CadenceArea` + `AreaTrend`; mb `CadenceChart`; bento `ActivityTile` | `{ variant: "area" \| "bars"; points: { label: string; value: number }[]; color?: string /* var(--chart-1) */; maxPoints?: number /* 16 */; dots?: boolean; formatValue?: (v: number) => string; ariaLabel: string; className?: string }` | full: 200×160 (recharts, client-mounted only); compact: 120×40 (SVG, meadow monotone path, `preserveAspectRatio="none"`) | Internal flip at 200×160; widget ladder substitutes `Stat` (last/max value + label) below 120×40 |
| `Donut` (`donut.tsx`) | MC `DonutChart` (recharts); bento `StackTile` SVG donut + ReportPanel Pie; meadow `Donut`; mb `SplitDonut` + `StacksInstrument` + `LanguageDonut` | `{ slices: { label: string; value: number; color?: string /* defaults ramp --chart-1..6 */ }[]; size?: number /* 148 */; center?: { value: string; label: string }; ariaLabel: string; className?: string }` — 2-slice split = 2 slices (mb SplitDonut is just N=2) | 110×110 with center; 64×64 without | below 110 → `SegBar` (widget ladder) |
| `HBars` (`h-bars.tsx`) | meadow `HBars`; bento `b-dirtybar` rows + stack legend bars + health/AI rows; mb `mb-bar-row` rows; MC `DirtyLeadersNav` (clickable) | `{ rows: { label: string; value: number; display?: string; color?: string }[]; maxRows?: number /* clamp + "+N" footer */; onRowClick?: (label: string) => void; ariaLabel: string; className?: string }` | 140×(rows×18) | below → clamp rows to 3 (part-internal, data-safe) → top-1 as `Stat` (ladder) |
| `SegBar` (`seg-bar.tsx`) | meadow `RatioBar` + rhythm bar + header chips; bento `.b-segbar`; mb AI token split; (MC's donut-instead) | `{ segments: { value: number; color?: string; label?: string }[]; height?: 8 \| 10; ariaLabel: string; className?: string }` | 40×8 | never (any width renders); zero total → muted full bar |
| `Heatmap` (`heatmap.tsx`) | MC `HeatmapInstrument` (promoted unchanged-ish) | `{ counts: Map<string, number>; weeks?: number /* 18 */; now: number; cellMax?: number /* 26 */; ariaLabel: string; className?: string }` | (weeks×(cell+3))×(7×(cell+3)+14 legend); min 4 weeks ≈ 68px wide | below → `Stat` "N active days" (ladder) |
| `Gauge` (`gauge.tsx`) | bento `HealthTile` arc (240° + RollNumber) | `{ value: number /* 0–100 */; label: string; formatValue?: (v: number) => string; ariaLabel: string; className?: string }` | 170×110 | below → `Stat` with tone from threshold (ladder) |
| `PulseStrip` (`pulse-strip.tsx`) | MC `PulseStrip`; mb `PulseLine`; (meadow `AreaTrend` surrogate stays a chart) | `{ cells: { intensity: number /* 0..1 */; tick?: boolean }[]; tone?: "accent" \| "sev" /* token set */; ariaLabel: string; className?: string }` | 64×12 | below → `Led` (live/nominal) (ladder) |

`chart.tsx` internals worth specifying now: the compact renderer adopts meadow's
Fritsch–Carlson `monotonePath` (moved to `packages/ui/src/lib/curve.ts` — one home); recharts mode
mounts client-only (`useEffect` gate) so SSR HTML shows compact SVG and there is no hydration
window mismatch; `isAnimationActive={false}` under `useReducedMotion()`.

### 1.2 Table family

| Part (file) | Unifies | Prop surface | MIN_CONTENT | Below-min fallback |
|---|---|---|---|---|
| `DataTable` (`data-table.tsx`, packages/ui) | MC `McTable` + `FleetTable` + column sets; bento/meadow/mb plain HTML tables; ledger/swiss hand tables | McTable's API plus controlled-optional extras: `{ columns; data; initialSort?; sorting?; onSortingChange?; columnFilters?; onColumnFiltersChange?; columnSizing?; onColumnSizingChange?; meta?; onRowClick?; minWidth?: number /* 420 */; ariaLabel: string; empty?: ReactNode; className?: string }`. Feature set = McTable's proven `tableFeatures({ rowSortingFeature, columnVisibilityFeature, columnSizingFeature, sortedRowModel })` + optional `columnFiltersFeature`. Uncontrolled by default; the Fleet widget passes the session-persisted sizing/filters. | width = `minWidth` (default 420; fleet passes 720); height = header 28 + 3×30 rows | below `minWidth` → **never scrolls internally** (settled: no inner scroll): widget ladder renders `KVList` of first 2 columns, top-N rows |
| `KVList` (`kv-list.tsx`, packages/ui) | MC `Row`; meadow `VitalRow`/`FactsTable` dl; mb `Row`; bento `Meta` | `{ rows: { label: string; value: ReactNode; tone?: Tone; mono?: boolean }[]; density?: "compact" \| "normal"; className?: string }` | 120×(rows×20) | clamps rows with "+N" (internal) |

### 1.3 Stat / readout family

| Part (file) | Unifies | Prop surface | MIN_CONTENT | Below-min fallback |
|---|---|---|---|---|
| `AnimatedNumber` (`animated-number.tsx`) | MC `AnimatedNumeral` (spring); bento `RollNumber`; meadow `SoftNumber` | `{ value: string \| number; motion?: "fade" \| "roll" \| "spring" /* default fade */; className?; style? }` — reduced-motion = instant swap (all three modes) | ~48×20 | never |
| `Stat` (`stat.tsx`) | MC `MiniStat`; mb `MiniStat`/`BigStat`; meadow `BigFact`/`StatCell`; bento `TileStat`/`HealthStat`/`SeverityStat`/`AiStat`; swiss `StatBand` cell; ledger `LedgerFigures` | `{ label: string; value: ReactNode; tone?: Tone; size?: "sm" \| "md" \| "lg"; hint?: string /* title */; className? }` | sm 64×34 | never (size ladder covers) |
| `VitalsBand` (`vitals-band.tsx`) | MC `VitalsBoard`; mb `VitalsBand`; swiss `StatBand` concept | `{ cells: { label: string; value: string \| number; tone?: Tone }[]; onCellClick?: (label: string) => void; className? }` — pure layout over `Stat`+`AnimatedNumber` | wraps (flex-wrap); 64×34 min cell | never |
| `Led` (`led.tsx`) | mb `Led`+`projectLed`+`LED_TAG`; MC `StatusLed`; (severity dots separate, below) | `{ tone: "critical" \| "warning" \| "info" \| "live" \| "nominal"; label?: string /* tooltip */; tag?: boolean /* ERR/WRN/INF/LIV/NOM mono tag */; pulse?: boolean /* breathe anim, reduced-motion off */; className? }` | 10×10 (+28px with tag) | never |
| `SeverityDots` (`severity-dots.tsx`) | meadow `AlertDots`; shared `AlertIcons`/`AlertBadge` usage; swiss dot matrix | `{ dots: { severity: Severity; message: string }[]; max?: number /* clamp + "+N" */; className? }` | 8×8 + dot | never |
| `Chip` (`chip.tsx`) | meadow `Chip`+`chipStyle`; bento stack pill; mb `mb-chip`; MC severity code chips | `{ tone: Tone; title?: string; children: ReactNode; className? }` where `type Tone = "positive" \| "info" \| "warning" \| "critical" \| "accent" \| "neutral"` mapped to `--state-positive/--sev-info/--sev-warning/--sev-critical/--pinned-accent/--muted-foreground` | ~36×20 | never |

### 1.4 Git family

| Part (file) | Unifies | Prop surface | MIN_CONTENT | Below-min fallback |
|---|---|---|---|---|
| `GitGlyphs` (`git-glyphs.tsx`, packages/ui) | bento `GitGlyphs`; meadow `Chip` row; mb `gitLine`; MC `SyncCell`; ledger sync cell; swiss `aheadBehindLabel`; shared `git-badges.tsx` | `{ git: { isRepo: boolean; ahead?: number; behind?: number; dirtyCount?: number }; size?: "sm" \| "lg"; className? }` (structural type — no api import) | 48×20 (nonzero chips only) | below → single worst `Chip` (ladder); `!isRepo` → "—" glyph (internal) |
| `ScoreRing`/`ScoreChip` (`score-ring.tsx`, packages/ui) | bento `RecencyRing`; mb `ScoreRing` (14px); meadow `ScoreChip` (linear) | `{ score: number /* 0..1, mosaic log-score */; tone?: "auto" \| Tone /* auto = tier thresholds */; age?: string /* center/hint text */; size?: number /* 14–48 */; className? }`; `ScoreChip` = linear variant, same props minus size | ring 14×14 (micro), readable 26+; chip 64×20 | 14px floor is absolute (ladder: Led) |

### 1.5 List family — `apps/web/src/parts/` (context-consuming)

| Part (file) | Unifies | Prop surface | MIN_CONTENT | Below-min fallback |
|---|---|---|---|---|
| `ReportGate` (`report-gate.tsx`) | MC `ReportMissing`+`ReportStatusLine`; bento `Missing/Running/Skeleton`+stale badge; meadow `MissingState`+`GeneratedBadge`+`ProjectReportRequire`; mb `MissingNote`/`PanelState`/`SnitchStatusStrip`/`StatusTag` | `{ entry?: string /* project path; default = scope export */; mode?: "gate" \| "banner" \| "line"; children: ReactNode /* rendered when fresh */ }` — consumes `useReport()` (status machine, command, generate, period); `gate` = full missing/running/stale states, `banner` = stale strip + children, `line` = one-line status strip | gate 200×120 (missing: button + copyable CLI); line 160×24 | running/missing skeletons render at any size (skeleton + label) |
| `AttentionList` (`attention-list.tsx`) | MC `AttentionBoard`; bento `AttentionTile`; meadow `AttentionBand`; mb triage channel; ledger `LedgerAttention` | `{ density?: "rows" \| "strip" /* rows default */; max?: number; onOpen?: (path: string) => void }` — consumes `useWorkspace()` → `attentionProjects(projects)` (ONE derivation, data specialist's shared metrics) | rows 220×(n×28); strip 160×24 | strip mode below → count `Stat` (ladder) |
| `ProjectPulse` (`project-pulse.tsx`) | MC `PulseStrip` wiring; mb `PulseLine` wiring | `{ project: Project; cells?: number /* 24–64 */ }` — consumes `useWorkspace().now` + shared `pulseCells()` → renders ui `PulseStrip` | = PulseStrip | = PulseStrip |
| `ListFiles` (`list/files.tsx`) | shared `components/file-browser` + MC's `.mc-files [class*="h-[70vh]"]` override hack | `{ height?: "fill" \| number }` — thin wrapper over shared FileBrowser; **the wrapper requires the shared component to take a height prop (one-line fix at `file-browser/index.tsx:199`)** killing the escape hatch | full: 280×240 (tree + pane); below → last-commit `KVList` (ladder) | |
| `ListArtifacts` (`list/artifacts.tsx`) | shared `components/artifacts` | `{ height?: "fill" }` | 240×200 | below → count Stat |
| `ListCommits` (`list/commits.tsx`) | MC `CommitsTable`; bento 4-row `<ul>`; shared `CommitHistoryCell` | `{ limit?: number; view?: "table" \| "graph" \| "list" }` — consumes `useProject().commitLog(limit)` (ONE cached query, shared by graph/heatmap/table) | table 400×(3×30+28); list 200×(n×24); graph 240×160 | below → top-4 list (internal) → last-commit KVList (ladder) |
| `NoteEditor` (`note-editor.tsx`) | 4× duplicated note textarea+save blocks | `{ rows?: number }` — consumes `useProject().note { draft, setDraft, save }` | 200×80 | below → one-line input (internal) |
| `DirtyLeaders` — NOT a new part | MC bars, bento severity lower half, mb `DirtyInstrument` | All three are `HBars` (clickable, MC) fed by shared `dirtyLeaders()` — app-side composition, no part | = HBars | = HBars |

### 1.6 Form family — `apps/web/src/parts/form/` (over `@/lib/forms`)

All follow the proven `lib/forms` pattern (logic in container-independent hooks, ONE dialog part
per flow — themed by tokens only, no per-theme dialog files):

| Part (file) | Unifies | Prop surface |
|---|---|---|
| `FormCreateProject` (`form/create-project.tsx`) | MC/bento/meadow/mb `CreateProjectDialog` ×4 | `{ open; onOpenChange }` — ui Dialog + existing `CreateProjectFlow` |
| `FormAddRoot` (`form/add-root.tsx`) | 4× add-root dialog containers | `{ open; onOpenChange }` — ui Dialog + existing `useAddRoot` |
| `FormCloneScript` (`form/clone-script.tsx`) | MC/bento/meadow/mb clone dialogs ×4 | `{ open; onOpenChange; projects: Project[] }` — NEW shared hook `useCloneScript` in `apps/web/src/lib/forms/clone-script.ts` (selection state, all/none, copy/download around `buildCloneScript` from `packages/api/src/lib/clone-script.ts`) mirroring `add-root.ts` |
| `FormReportRun` (`form/report-run.tsx`) | bento `ReportRunDialog`; mb `ReportDialog`; meadow inline period chips; MC widget-level | `{ open; onOpenChange; kind: "repo" \| "scan"; path?: string }` — root + period + force, drives shared `useReportRun()` (popup-blocker-aware `window.open`); period presets from meadow `report.tsx` (`"all" | ReportPeriod`) |

### 1.7 Layout family — `packages/ui/src/components/`

| Part (file) | Unifies | Prop surface | MIN_CONTENT | Below-min fallback |
|---|---|---|---|---|
| `WidgetTabs` (`widget-tabs.tsx`) | MC `McTabs`; ui Tabs + `.b-tabs`; meadow pill tabs; mb `MiniTabs`/`mb-channel`/`HeroTabs` | `{ tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void; size?: "sm" \| "md"; className? }` — built ON ui `Tabs` primitives | tabs×56×24 + panel 48 | below → hide tabs, render first tab content (ladder; matches today's tierIndex≥3 behavior) |
| `ViewCarousel` (`view-carousel.tsx`) | bento `DataCarousel` (superset); mb raw Carousel ×2 | `{ cards: { id: string; label: string; node: ReactNode }[]; autoAdvance?: boolean /* default true: deterministic stagger seeded by hash of card ids, hover/focus pause, OFF under reduced motion */; className? }` — requires ui `carousel.tsx` to own its content-height chain (kill `.b-data-carousel` / `[data-slot=carousel-content]` CSS hacks — bento catalog note B5) | 120×40 + pills | below → first card only, no pills (internal) |
| `ThemeScope` (`theme-scope.tsx`) | §3 infra | see §3 | n/a | n/a |

### 1.8 NOT parts (explicit)

- Format helpers (`compactAge`, `formatCost`, `formatTokens`, `formatElapsed`, … 12 variants) →
  one `apps/web/src/lib/format.ts` family — **data specialist's** deliverable; parts consume.
- Derivations (`pulseCells`, `fleetVitals`, `worstSeverity`/`statusOf`, `attentionProjects`,
  `dirtyLeaders`, `aggregateCadence`, `stackDistribution`, language top-N) → ONE shared metrics
  module (data specialist, proposed `apps/web/src/lib/metrics/`); parts only render.
- Keyboard chrome (`useConsoleKeys`), `useMediaQuery`, `openProject` — data/architect territory.
- Widget chrome (title/meta/action shell) — architect. Parts stay headerless.

### 1.9 Candidate scorecard (18 catalog candidates → disposition)

| # | Catalog candidate | Disposition |
|---|---|---|
| 1 | Cadence area | `Chart variant="area"` (ui) — 4 designs collapse |
| 2 | Donut ring | `Donut` (ui, SVG) |
| 3 | Ranked bars | `HBars` (ui) |
| 4 | Sparkline/pulse | `Chart` compact mode + `PulseStrip` (ui) + `ProjectPulse` (app) |
| 5 | Segmented bar | `SegBar` (ui) |
| 6 | Table shell | `DataTable` (ui, tanstack v9) + `KVList` |
| 7 | Animated numeral | `AnimatedNumber` (ui, 3 motion modes) |
| 8 | Stat pair | `Stat` (ui) |
| 9 | Vitals band | `VitalsBand` (ui) over shared `fleetVitals` (data) |
| 10 | LED row | `Led` (ui) + `statusOf(project, now)` (data) |
| 11 | Git glyphs | `GitGlyphs` (ui, structural prop type) |
| 12 | Recency ring | `ScoreRing` + `ScoreChip` (ui) |
| 13 | Attention list | `AttentionList` (app) on shared derivation |
| 14 | Report gate | `ReportGate` (app) consuming Report context |
| 15 | Tabs | `WidgetTabs` (ui) |
| 16 | Carousel | `ViewCarousel` (ui) |
| 17 | Clone picker | `FormCloneScript` (app) + `useCloneScript` (lib/forms) |
| 18 | Key/value row | `KVList` (ui) |

All 18 land; 6 additions justified: `Heatmap` (MC-only today but instantly serves all themes —
catalog says so), `Gauge` (bento concept survives as a part available to all themes per settled #5),
`SeverityDots` + `Chip` (two more tone-carriers merged), `ProjectPulse` (the context wrapper that
makes #4 DRY), `NoteEditor` (4× trivial duplication).

---

## 2. PART PROP CONVENTIONS (the contract)

1. **Children**: any part may host parts. Canonical compositions: `ReportGate` hosts anything
   report-derived; `ViewCarousel` cards host `Chart`/`DataTable`/`KVList`; `WidgetTabs` panels host
   parts; `VitalsBand` hosts `Stat`s.
2. **Context**: settled four contexts. App parts consume via `useWorkspace() / useProject() /
   useReport() / useSettings()` and NEVER call tRPC hooks directly. packages/ui parts consume NO
   context except `ThemePortalContext` (infra). Naming follows catalog §3.5 verbatim: parts read
   `project`, `now`, `vitals`, `alerts`, `entry`; actions arrive as `onOpen(path)`, `generate()`,
   `refresh()`.
3. **Theming = tokens only, with fallbacks**. Baseline token contract (each part must render
   acceptably in the BASE theme because the base `globals.css` already defines all of these —
   verified):
   - series: `--chart-1..6` (parts cycle+clamp; 6 max)
   - severity: `--sev-critical | --sev-warning | --sev-info` (renamed from `--sev-error/--sev-warn`)
   - state: `--state-positive`, `--recency-fresh`, `--recency-stale`, `--pinned-accent`
   - surface: `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`
   - type: `--font-mono` (numerals, tags, glyphs); default font otherwise
   Parts use `var(--token, fallbackLiteral)` so a theme missing a token still renders. Custom
   `className` is always allowed (merged via `cn`), never required. **Chrome tokens (radius,
   hairlines, panel bg) are NOT part of the part contract** — they belong to the Widget shell /
   theme preset seam (catalog §4.4).
4. **`ariaLabel: string` required** on every chart/list/table part (meadow's pattern). Visible
   titles are the Widget shell's job.
5. **MIN_CONTENT export**: every size-sensitive ui part exports
   `export const MIN_CONTENT = { w: number; h: number }` (charts also export their renderer-flip
   threshold). The grid (architect) imports these to clamp drag/resize floors; the widget ladder
   uses them for nearest-defined fallback content. Dynamic floors (rows×18) are computed by the
   part via props and exposed as helper `minContentFor(props)` where it matters (`HBars`,
   `DataTable`, `KVList`).
6. **Values are pre-formatted** where display matters (`Stat.value: ReactNode`; `AnimatedNumber`
   takes `string | number`). Formatting lives in `lib/format.ts` (data), not in parts — except
   `formatValue` opt-ins on charts for tooltips.

---

## 3. PORTAL THEMING AS INFRASTRUCTURE (hard problem #2)

### The mechanism: `ThemeScope` + portal-host context

```tsx
// packages/ui/src/components/theme-scope.tsx
export type ThemeName = "mission-control" | "bento" | "meadow"; // + future presets

const ThemePortalContext = createContext<Element | null>(null);
export const useThemePortal = (): Element | null => useContext(ThemePortalContext);

export function ThemeScope({ theme, children }: { theme: ThemeName; children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setHost} data-ww-theme={theme} className="ww-scope">
      <ThemePortalContext value={host}>{children}</ThemePortalContext>
    </div>
  );
}
```

Rules that make it work (each kills one of today's hacks):

1. **The scope div is the portal host.** ui's portal-based components — `dialog.tsx`, `sheet.tsx`,
   `dropdown-menu.tsx`, `select.tsx`, `popover.tsx`, `tooltip.tsx`, `context-menu.tsx`, `sonner.tsx`
   — get a one-line change: their `*Portal` wrapper passes
   `container={useThemePortal() ?? undefined}` (Base UI `Portal` supports `container`; if the
   installed `@base-ui/react@^1.6.0` prop shape differs, fall back to `createPortal(node, host ?? document.body)`).
   Portals land INSIDE the scope → inherit tokens. Kills `.bento-dialog`, `body:has(.meadow)`,
   `.mb-scope`, and MC's `mc` class on `DialogContent` in one stroke.
2. **Tokens declare once under `[data-ww-theme="x"]`** (plain attribute selector — specificity
   (0,1,0), same as `.dark`; scope is a child of the `.dark` shell so it wins by proximity, no
   `.mc.mc` doubling needed). Kills the doubling hack and the per-component re-declares.
3. **The scope div must not create a containing block or stacking context**: no transform, filter,
   perspective, contain, backdrop-filter, z-index, position, overflow (page scrolls as one body —
   settled #2 — so the scope never clips). Portal content keeps `position: fixed` semantics.
   Documented as a CSS contract comment in `theme-scope.tsx` + enforced by the parts-preview
   measurement script (asserts dialog fixed-box == viewport).
4. **SSR-clean, zero scripts**: the attribute is in server HTML (no flash, no head scripts, no
   `body:has()`). Client theme navigation = mount new scope.
5. **Global surfaces** (sonner toaster): app shell mounts `<Toaster>` INSIDE the ThemeScope so
   toasts theme too; outside any scope, components fall back to `document.body` + base tokens
   (behavior unchanged for docs site / tests).
6. **recharts coupling** collapses into the same mechanism: theme CSS keeps ONE recharts block
   scoped under `[data-ww-theme="x"]` (fills from tokens) instead of four per-theme selector sets.

### Migration (concrete, per theme — sequenced with migration specialist)

1. Add `ThemeScope` + ui portal patches (P1 below) — no behavior change until a theme opts in.
2. Per theme: route root wraps content in `<ThemeScope theme="…">`; theme CSS replaces its scope
   selector (`.mc.mc` / `.bento-root` / `.meadow` / `.mb.mb`) with `[data-ww-theme="…"]`; delete
   `.bento-dialog` / `body:has(.meadow)` / `.mb-scope` / `.mc-dialog` blocks; delete per-design
   dialog wrapper classes (dialogs are now `Form*` parts, §1.6).
3. Kill list from catalog §4.5 additionally: mb's `STACK_RAMP` oklch literals → `--chart-1..N`
   ramp; MC `.mc-files [class*="h-[70vh]"]` → FileBrowser height prop (P4); per-theme
   separator/tabs/kbd/skeleton classes replaced by `WidgetTabs`/ui parts + chrome tokens on the
   Widget shell.

---

## 4. NAMING + LIBRARY LOCATION

- **Files kebab-case** (`h-bars.tsx`, `report-gate.tsx`); **exports PascalCase**; family prefixes:
  `Chart*`/chart shapes, `Stat*`/`AnimatedNumber`/`VitalsBand`/`Led`/`Chip` (readout),
  `Git*`/`Score*` (git/score), `List*` (lists), `Form*` (forms), `WidgetTabs`/`ViewCarousel`/
  `DataTable`/`KVList`/`ThemeScope` (layout).
- **The line**: `packages/ui/src/components/` = presentational, props-in, tokens-only, no
  api/context/tRPC imports, structural prop types only. `apps/web/src/parts/` = context-consuming
  and data-bound wrappers (import ui parts + shared components + contexts + metrics). ui keeps its
  per-file exports map (`./components/*` — verified) so docs site never bundles recharts
  (no barrel additions).
- New ui deps use catalog refs (verified in `pnpm-workspace.yaml`): `recharts: ^3.0.0`,
  `@tanstack/react-table: ^9.2.4`, `motion: ^13.2.0` — added to `packages/ui/package.json` as
  `catalog:`. ui gains NO other deps.
- App tree:

```
apps/web/src/parts/
  report-gate.tsx        attention-list.tsx    project-pulse.tsx    note-editor.tsx
  list/files.tsx         list/artifacts.tsx    list/commits.tsx
  form/create-project.tsx  form/add-root.tsx  form/clone-script.tsx  form/report-run.tsx
  index.ts               (barrel: the ONLY import surface for widgets/routes)
```

---

## 5. MOTION CONVENTIONS (motion@13)

- `packages/ui/src/lib/motion.ts` exports the standard set (one source, both packages via import):
  `EASE = [0.2, 0.9, 0.3, 1]` (bento's roll ease); `fade = { duration: 0.15 }`;
  `swap = { duration: 0.2 }`; `roll = { duration: 0.3, ease: EASE }`;
  `layout = { type: "spring", stiffness: 300, damping: 30 }`.
- **Reduced-motion rule (absolute)**: every animated part checks `useReducedMotion()` and swaps to
  instant/static (`AnimatedNumber` instant, `ViewCarousel` auto-advance off, `Led pulse` off,
  recharts `isAnimationActive={false}`). SoftNumber + DataCarousel are the reference behaviors.
- **Parts animate content only** (opacity/transform of their own nodes). **Placement/layout
  animation belongs to the Widget shell** (motion `layout` on grid children — catalog §6.3.5);
  parts never use `layout` to avoid nested-transform fights.
- Standard part transitions: numeral change → `roll`/`fade`; gate state change → `swap`
  cross-fade; carousel → embla scroll (no motion lib); nothing else moves.

---

## 6. PHASES (parts-domain; for the master plan)

### P1 — Theme infrastructure (Sequential, first; ~10 files)
Files: `packages/ui/src/components/theme-scope.tsx` (new); portal-container patches to
`dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `select.tsx`, `popover.tsx`, `tooltip.tsx`,
`context-menu.tsx`, `sonner.tsx`; `packages/ui/src/lib/motion.ts` (new);
`packages/ui/package.json` (motion dep). No theme opts in yet.
Validation: `pnpm run check-types`; `pnpm build`; existing routes unchanged (portal container is
null → body, identical behavior); grep gate: no `data-ww-theme` consumers outside theme-scope.

### P2 — ui chart family (Parallel with P3; ~9 files)
Files: `chart.tsx`, `donut.tsx`, `h-bars.tsx`, `seg-bar.tsx`, `heatmap.tsx`, `gauge.tsx`,
`pulse-strip.tsx`, `lib/curve.ts` (monotone path from meadow/charts.tsx), `package.json` (recharts
catalog dep). Port sources: meadow `charts.tsx` (Donut/HBars/SegBar shapes), MC
`analytics-zone.tsx` (Heatmap), bento `health-tile.tsx` (Gauge), meadow monotone path.
Validation: check-types; build; each part renders in base theme (fallback tokens) — smoke via P5
preview once it exists; Chart compact/full flip unit-checkable via ResizeObserver stub.

### P3 — ui readout/git/table/layout (Parallel with P2; ~14 files)
Files: `animated-number.tsx`, `stat.tsx`, `vitals-band.tsx`, `led.tsx`, `severity-dots.tsx`,
`chip.tsx`, `git-glyphs.tsx`, `score-ring.tsx`, `data-table.tsx`, `kv-list.tsx`, `widget-tabs.tsx`,
`view-carousel.tsx`, `lib/tokens.ts` (Tone type + token map), `carousel.tsx` (height-chain fix).
Deps: react-table catalog dep. Port sources: bento `roll-number.tsx`, meadow `bits.tsx`,
mb `led.tsx`, bento `git-glyphs.tsx`/`recency-ring.tsx`, MC `mc-table.tsx` (feature set),
bento `data-carousel.tsx`.
Validation: check-types; build; reduced-motion code paths present per part (grep
`useReducedMotion` in every animated part).

### P4 — app context parts (Sequential after data-phase contexts + P2/P3; ~13 files)
Files: `apps/web/src/parts/` tree from §4 (12 files) + `apps/web/src/lib/forms/clone-script.ts`;
plus one-line fix `apps/web/src/components/file-browser/index.tsx` (height prop, line ~199).
Validation: check-types; build; parts barrel exports compile; `FormCloneScript` copy/download
flows typecheck against `packages/api/src/lib/clone-script.ts` API.

### P5 — Preview + measurement gate (after P2–P4; 3 files)
Files: `apps/web/src/routes/parts-preview.tsx` (dev-only route rendering every part at ladder
boxes 1x1/2x1/2x2/2x3/3x3 using the grid's cell size, inside a ThemeScope per theme);
`scripts/measure-parts.mjs` (DOM assertions via headless browser: every part box ≥ MIN_CONTENT
at its declared rung, no horizontal overflow, `getComputedStyle` token resolution non-empty,
dialog fixed-box == viewport inside scope); `docs/research/parts-reference.md` (generated table:
part → props → MIN_CONTENT → fallback — the widget author's reference).
Validation: `pnpm run check-types`; `pnpm build`; measure script green for all three themes.

Dependencies (cross-specialist): P4 needs data's contexts + shared metrics module
(`statusOf`, `pulseCells`, `attentionProjects`, `fleetVitals`, `commitLog` caching) and architect's
context hook names. P5 needs architect's grid cell metrics. Theme adoption phases belong to the
migration specialist (per-theme: opt into ThemeScope, swap parts in, delete design-local copies).

---

## 7. RISKS

1. **Base UI `Portal` container prop shape** unverified against `@base-ui/react@^1.6.0` —
   mitigation specified (createPortal fallback); P1 validates first.
2. **recharts SSR**: ResponsiveContainer measures client-side → chart.tsx mounts recharts mode
   client-only (compact SVG in SSR HTML). Avoids hydration mismatch; documented in-file.
3. **Severity token rename** (`--sev-error|warn` → `--sev-critical|warning`) touches base
   globals.css + every theme CSS + shared `git-badges.tsx`. One-time, mechanical — but must be in
   the migration plan or parts will straddle two vocabularies.
4. **packages/ui dep growth** (recharts, react-table, motion): mitigated by per-file exports (no
   barrel); docs site unaffected.
5. **Measurement gate needs a headless browser** (agents have no vision) — script asserts boxes,
   not pixels; if no browser runtime is available at execution, fall back to jsdom-based mount
   tests (token resolution + MIN_CONTENT contract) and defer visual checks.
6. **Scope div CSS contract fragility**: any future `overflow`/transform on `.ww-scope` breaks
   fixed dialogs silently — guarded by measure script assertion + doc comment.
7. **DataTable v9 API drift**: pin to McTable's proven `tableFeatures` shape (already on v9).

---

## 8. OPEN QUESTIONS / POSITIONS FOR PEERS

- **architect**: (a) parts are headerless — confirm Widget shell owns title/meta/action/tabs slots;
  WidgetTabs exists for tabs INSIDE content. (b) Confirm the grid imports `MIN_CONTENT` for resize
  floors and the ladder owns below-min substitution. (c) `.ww-scope` = route root wrapper — yours
  or mine? I propose: architect's Page/Grid renders ThemeScope once per route; parts library only
  provides it.
- **data**: shared metrics module must export `statusOf(project, now) → { tone, label }`,
  `pulseCells`, `attentionProjects`, `fleetVitals`, `dirtyLeaders`, `aggregateCadence`,
  `stackRamp(n)`, plus `lib/format.ts` — I consume, you own. Severity mapper (scan error/warn →
  critical/warning) lives at YOUR boundary; parts never see scan vocabulary.
- **migration**: form dialogs are ONE token-styled set (no per-theme dialog files) — themes differ
  by tokens/chrome only (settled "themes = presets"). Push back if a theme needs structurally
  different dialogs.
- **everyone**: severity token rename (§0.5) — yes/no from synthesizer; it rides the migration
  either way.
