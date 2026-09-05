# Master Plan — Widget/Part System for workspace-welcome

Synthesized from the four refined specialist plans (`refined-{architect,data,parts,migration}-r1.md`),
their drafts, and the cross-reviews, under the orchestrator's consensus rulings. This document is
self-contained: an orchestrator can dispatch implementers from it without asking questions.

- Repo: `/home/didi/workspace/workspace-welcome` (run all commands from the repo root).
- Execution agents have NO vision. All verification is build/type gates, grep, DOM-measurement
  harness, or the owner's eyeballs at G1.
- Owner's settled decisions in `context.md` are binding constraints; the orchestrator's consensus
  rulings (§2) resolve every specialist disagreement and are equally binding.

---

## 1. Executive summary

The six exploration designs under `apps/web/src/routes/designs/` are replaced by a real widget/part
system: pages become blank grid canvases populated by widgets, widgets compose a DRY two-layer part
library, and themes become presets (layout data + token CSS) on one shared runtime. The system is
built in a **new namespace** (`apps/web/src/widgets/**` + routes under `/app/$theme`) while every
legacy route keeps running untouched; the three surviving themes (mission-control, bento, meadow)
migrate onto it in parallel waves behind a walking-skeleton gate; a no-vision compliance harness
(`scripts/widget-check/`) machine-checks every invariant; the owner signs off visually at G1; only
then are the old designs deleted (K1–K4). The `/` cutover (K5) is flagged out of default scope.

Build order (migration's refined spine, ratified): **ThemeScope infra → routes/skeleton →
foundations (severity, metrics, queries, contexts, runtime, parts) → walking-skeleton gate (M3) →
theme waves (tokens → dashboards → project pages, parallel per theme, validated per wave) →
compliance (C1) → owner gate (G1) → cleanup (K1–K4; K5 flagged)**.

The plan is 32 phases / 38 implementer dispatches (§4). Every phase carries type, requirements,
exact inputs/outputs, validation criteria, dependencies, and gatekeeping commands (§5).

---

## 2. Consensus decisions (binding — from the orchestrator, on top of context.md's settled 1–11)

1. **Directory tree: `apps/web/src/widgets/{runtime,contexts,parts,themes}`** (plus `lab/` and
   `registry.ts` at the `widgets/` root; pure TS stays in `apps/web/src/lib/`). This was unanimous
   in the refined plans — the architect's note calling migration's tree divergent was a stale read
   of migration's draft; migration's refined plan publishes the unified tree verbatim. One tree is
   shown in §3.1 and used by every phase, grep, and invariant.
2. **Widget registry = static core map + `import.meta.glob` theme merge.**
   `widgets/registry.ts` holds a static map of common widget kinds and eagerly globs
   `./themes/*/widgets/index.ts`, merged by a `mergeValidated()` that throws on duplicate ids.
   Parallel theme waves never edit a shared registry file.
3. **`ProjectProvider` nests `WorkspaceProvider`** (data's D7 implements it). Dashboard widget kinds
   stay composable on project pages; `useWorkspace()` works under any provider stack that includes
   Project.
4. **ledState home (data's compromise, ratified).** The 5-tone LED derivation lives in
   `apps/web/src/lib/scan-metrics/severity.ts` as a structurally-typed union:
   `interface LedState { tone: "critical" | "warning" | "info" | "live" | "nominal"; label: string }`
   and `ledState(project: Project, now: number): LedState` (live = `isHot` 48 h, nominal = clean,
   else worst severity). `packages/ui`'s `Led` keeps its own structurally-identical `tone` union —
   **no import between metrics and packages/ui in either direction**. The app part
   `widgets/parts/led-project.tsx` (`ProjectLed`) composes: `ledState(project, useWorkspace().now)`
   → ui `<Led>`. The third naming generation (StatusLed/projectLed/worstSeverity) retires.
5. **Charts — settled decision #9 enforced AS WRITTEN.** recharts everywhere, one engine; below
   documented min-size floors, charts fall back to **non-chart presentation** (numerals, LEDs,
   SegBar geometry) via the widget's `sizes` ladder. The specialists' "compact-SVG monotone flip
   below 200×160" is **NOT mainline**: mainline phases must not build it (P2 ships no compact
   renderer and no `lib/curve.ts`); it is recorded as an owner-flip option in Open Items (§8.2).
   Engine-less SVG geometry parts (Donut, SegBar, HBars, PulseStrip) are fine — they are not the
   recharts chart part.
6. **Size-breakpoint API.** The owner's sketch `<Widget 2x2={...}>` is invalid JSX — verified
   against the repo's own tsc: `<Widget 2x2={…} />` and `<A 2={…} />` both fail with
   `TS1003: Identifier expected`; quoted-string attributes are also illegal in JSX. Implement the
   object syntax `sizes={{ "2x2": <Content/>, "1x1": <Dot/> }}` with nearest-defined-rung fallback
   (settled #6). The syntax change is the FIRST item of the owner gate G1 (§5, G1).
7. **Owner gate G1 collects**: (1) `sizes` syntax sign-off; (2) FileBrowser/ArtifactsPanel
   `data-scroll="widget"` exemptions + ideation→Sheet; (3) default theme choice; (4) `no-scope`
   naming ratification; (5) catalog banner decision; (6) K5 `/`-cutover go/no-go.

Additional round-1 convergence carried into this plan (all four refined plans agree): routes
`/app/$theme` frozen after M1; `[data-ww-theme]` attribute scope + `data-theme-scope` probe marker;
`PageLayout` v1 / `WidgetNode` preset format (pure data); `requires: ContextKey[]` field name;
canonical severity at api emission with zero runtime mappers and the `--sev-*` token rename in the
same commit; registry-authored `min` clamps while `MIN_CONTENT` validates; ReportGate merged API
(plain `children: ReactNode`, `mode`, slots, `quiet`, `no-scope` → null); ONE harness
(`scripts/widget-check/`) with exactly two surviving dev routes; keyboard-first interaction;
`?bare=1` pass; escalation protocol (themes never hold local part copies); K5 flagged out.

---

## 3. Target architecture

### 3.1 The one directory tree

```
apps/web/src/widgets/                  # THE system namespace (React) — all grep invariants key here
  runtime/                             # architect W1–W4
    size-class.ts                      # SizeClass, SIZE_LADDER, parseSize, rankOf, resolveSizeClass
    layout-types.ts                    # PageLayout v1 / WidgetNode / RegionNode
    widget-shell.tsx                   # WidgetShell + WidgetSizeContext + useWidgetSize
    part.ts                            # PartDef + definePart (stamps data-part, data-part-min-w/h)
    grid-canvas.tsx                    # CSS-grid canvas, placement attributes, data-ready, useViewportColumns
    use-grid-drag.ts                   # snapped pointer+keyboard drag/resize controller (dnd-swappable seam)
    grid-session.ts                    # module-scope session placement store (settled #4)
    render-layout.tsx                  # PageLayout → regions → placements → widget tree; mounts ThemeScope
    flows.ts                           # flow registry seam ("projects" → scoreProjects → nodes)
    use-console-keys.ts                # "/" focus, 1–N views, Escape — consumes WorkspaceContext.filter
  contexts/                            # data D5–D7 (the four providers, settled #7 names)
    settings-context.tsx  workspace-context.tsx  report-context.tsx  project-context.tsx
  parts/                               # parts P4 app layer (context-consuming)
    report-gate.tsx  attention-list.tsx  project-pulse.tsx  note-editor.tsx  led-project.tsx
    git/branch-switcher.tsx  git/actions-toolbar.tsx
    list/files.tsx  list/artifacts.tsx  list/commits.tsx
    form/create-project.tsx  form/add-root.tsx  form/clone-script.tsx  form/report-run.tsx
    registry.ts                        # definePart wrappers (id + MIN_CONTENT + component)
    index.ts                           # barrel — the only import surface for widgets/themes
  themes/
    index.ts                           # preset registry: import.meta.glob("./*/preset.ts", { eager: true })
    <slug>/preset.ts                   # ThemePreset { id, label, dashboard: PageLayout, project: PageLayout }
    <slug>/tokens.css                  # full required-token set under [data-ww-theme="<slug>"]
    <slug>/custom.css                  # OPTIONAL additive chrome skin (omitted by ?bare=1)
    <slug>/widgets/index.ts            # theme widget KINDS — glob-composed into widgets/registry.ts
  lab/                                 # widget-lab components (dev-only /app/__lab)
  registry.ts                          # static core map + import.meta.glob("./themes/*/widgets/index.ts")
apps/web/src/lib/                      # pure TS / data infra ONLY (no React components)
  grid-layout/                         # pack-grid.ts, score-projects.ts (mosaic-layout successor)
  scan-metrics/                        # severity (incl. ledState), activity, pulse, fleet, stacks, report
  queries/                             # scan.ts, reports.ts, commit-log.ts — the only tRPC queryOptions site
  report-view.ts                       # the render-ready report normalizer
  format.ts  forms/  (existing: mosaic-layout shim, use-report.ts, recency.ts, …)
packages/ui/src/components/            # presentational parts (P2–P3) + ThemeScope (P1)
packages/ui/src/lib/{tokens,motion}.ts # Tone + chartColor(i); motion presets
scripts/widget-check/                  # THE harness (M2, extended by P5 + waves)
apps/web/src/routes/app/               # /app index + $theme routes (frozen after M1) + __lab (dev)
```

Rules baked into the tree: `widgets/**` is the grep-able system namespace; `lib/` is pure TS (no
React components); `packages/ui` parts are props-in/tokens-only (no api/context/tRPC imports, no
app imports, structural prop types only); theme agents write ONLY `widgets/themes/<slug>/**`.

### 3.2 Routes

```
apps/web/src/routes/app/index.tsx            # /app → redirect to /app/<default> (default = mission-control until G1)
apps/web/src/routes/app/$theme/index.tsx     # dashboard: ThemeScope → provider stack → renderLayout(preset.dashboard)
apps/web/src/routes/app/$theme/project.$.tsx # project page, same shape (splat = project path)
apps/web/src/routes/app/__lab.tsx            # dev-only widget-lab (import.meta.env.DEV-guarded)
apps/web/src/routes/parts-preview.tsx        # dev-only parts preview (P5)
```

Routes are theme-agnostic and **frozen after M1** — theme waves never touch route files. The URL is
the compliance test matrix: `/app/{mission-control,bento,meadow}` × `{dashboard, project}` = six
addresses. `$theme` resolves against the preset registry; an unknown slug renders an explicit
"theme not found" state (no fake success). `?bare=1` on a theme route omits `custom.css` from the
page head — the full interaction suite must still pass (owner's "works without custom classes",
tested not asserted). Exactly two dev-only routes survive migration: `/app/__lab` and
parts-preview. Legacy routes (`/`, `/projects/$path`, `/settings`, `/designs/*`) are untouched
until K1–K5.

### 3.3 Runtime contracts (architect)

**Size classes.** Ladder `1x1 < 2x1 < 2x2 < 2x3 < 3x3` (settled #6). `SizeClass` is a
`` `${number}x${number}` `` template-literal type; `rankOf = cols*rows*100 + rows` gives a total
order (custom classes slot in deterministically). `resolveSizeClass(defined, current)` returns the
largest defined class whose rank ≤ current, or the smallest defined class — **never throws, never
undefined**.

**Size-breakpoint content props (ruling 6).**

```tsx
<WidgetShell sizes={{ "3x3": <HeroBody/>, "2x2": <ChartBody/>, "1x1": <LedBody/> }}>
  {/* children = size-independent fallback of last resort */}
</WidgetShell>
```

**Self-degradation precedence:** authored size-class content wins within its declared rung; part
self-degradation (container queries) handles pixel variance WITHIN a rung (cell density 84–104 px,
viewport width). The ladder is the author's tool; the container query is the part's. ui-package
parts degrade via container queries ONLY (`useWidgetSize()` is never consumed inside `packages/ui`).

**WidgetShell.** Props: `title?/meta?/action?: ReactNode`; `tabs?: {id,label}[]` + `activeTab?` +
`onTabChange?` (rendered via the ONE `WidgetTabs` part — shell-level view switching and in-content
tabs are one component, two placements, documented distinct); `sizes?`; `children?`; `chrome?`;
`tone?: "critical" | "warning" | "info" | "neutral"`. The shell publishes
`WidgetSizeContext` (`useWidgetSize() → { cols, rows, sizeClass }`) for structural switches CSS
can't express; outside the grid the parent passes `size={{ cols, rows }}` explicitly. Nested
widgets are authored composite slots — child shells render `interactive={false}`, no handles
(settled #3). Shell content boxes stretch (`flex-1 min-h-0`) so the density probe is honest.

**Placement data-attribute contract** (probe surface, SSR-stable, never parsed from computed
style): widget root stamps `data-widget="<id>" data-x data-y data-cols data-rows
data-size="<resolved class>"`; affordances stamp `data-drag-handle` / `data-resize-handle`
(omitted when `interactive={false}`); board root stamps `data-ready` in a `useEffect` after
hydration + placement commit — NOT gated on query completion (report widgets legitimately render
ReportGate skeletons); ThemeScope root stamps `data-ww-theme="<slug>"` + `data-theme-scope`.

**Grid canvas.** Hand-rolled snapped drag/resize on CSS Grid — **no new dependency** (dnd-kit,
react-grid-layout, react-resizable-panels all evaluated and rejected in draft-architect §4; the
drag controller is isolated in `use-grid-drag.ts` so dnd-kit can replace it later without touching
widgets). Grid container: `grid-template-columns: repeat(var(--grid-cols), minmax(0,1fr));
grid-auto-rows: var(--cell-h); gap: var(--grid-gap)`; each widget is a direct child placed by
inline `gridColumn/gridRow` (no wrapper divs — motion `layout` works). Drag: pointer down →
`setPointerCapture` best-effort with a window-level move/up fallback (synthetic events work);
snapped ghost outline; commit → moved widget pinned, others re-packed by `packGrid()` in reading
order; authored `at` anchors shadowed for the session (manual wins until reload). **Keyboard path
is primary** (focus handle, arrow keys move/resize by one cell with live commit, Escape reverts,
`aria-live` announcement) and is the scripted test surface. Resize clamps to the registry `min`.
Placement persistence is session-only (settled #4), serializable so persistence bolts on later.
`react-resizable-panels` disappears from new pages entirely; removal from package.json is K3.

**Min-content negotiation (three layers).** (1) Registry `min` (authored cell floor, default =
smallest defined `sizes` key) is the runtime clamp. (2) Part px floors (`MIN_CONTENT` exports →
`data-part-min-w/h`) are advisory + validated by the harness. (3) Part self-degradation handles
in-rung variance. A theme's cell density making a floor unsatisfiable at its authored class is a
harness finding, not runtime behavior.

**Widget registry (ruling 2).**

```ts
interface WidgetDef {
  id: string; title: string;
  component: ComponentType<RegisteredWidgetProps>;   // receives { node, size } from the renderer
  requires: readonly ContextKey[];                   // ContextKey = "workspace" | "project" | "report" | "settings"
  defaultSize: SizeClass; min?: SizeClass;
  hosts?: readonly string[];                         // part ids — docs + compliance input
}
// widgets/registry.ts
const core: Record<string, WidgetDef> = { /* common widgets, static imports */ };
const themes = import.meta.glob("./themes/*/widgets/index.ts", { eager: true });
export const widgetRegistry: ReadonlyMap<string, WidgetDef> = mergeValidated(core, themes); // throws on dup ids
```

**Preset format (`PageLayout` v1 — pure data, registered kinds, JSON-shape by construction).**

```ts
interface WidgetNode {
  id: string;                          // stable instance id, kebab-case
  widget: string;                      // registry key
  size: SizeClass; at?: { x: number; y: number };
  props?: Record<string, JsonValue>;   // e.g. { "variant": "triage" } — never JSX
  slots?: Record<string, WidgetNode[]>;// authored composite children (settled #3)
}
type RegionNode =
  | { kind: "stack"; id: string; widgets: WidgetNode[] }
  | { kind: "flow"; id: string; from: string; template: { widget: string; ladders?: Record<string, SizeClass[]> } };
interface PageLayout {
  version: 1;
  context: "workspace" | "project";    // → provider stack (§3.4)
  report?: false;                      // omit ReportProvider entirely (default: on)
  columns: { desktop: number; tablet: number; phone: number };
  cell: { h: number };                 // theme density, 92–104 px observed
  regions: RegionNode[];
}
```

Flow generators are code receiving a structural `{ projects: Project[]; now: number }` input
(the full `WorkspaceContextValue` satisfies it structurally); `renderLayout` runs them INSIDE the
provider stack — flows never call tRPC (keeps the "themes/flows don't fetch" grep true). The
resolved page (flat `WidgetNode[]` with concrete placements) is the exact artifact a future
persistence layer would save.

**SSR/hydration.** Placements are data → server HTML is pixel-identical; no measurement before
hydration. One centralized `useViewportColumns` (`useState(desktop)` initializer, matchMedia synced
in `useEffect`) — renders desktop first paint everywhere, reflows once post-mount. Charts mount
client-only. Add `html { scrollbar-gutter: stable; }` to the new pages' base CSS (nothing sets it
today — verified) so page-length changes never shift the grid.

### 3.4 Contexts (data) — the four providers (settled #7 names)

Thin typed views over the react-query cache, mounted per page, never per widget. Providers stamp
`data-providers="<keys>"` on their root (space-separated lowercase context keys in mount order,
e.g. `data-providers="settings workspace report"`). Hooks `useWorkspace()/useProject()/useReport()/useSettings()`
**throw** against a null-default context ("XProvider missing — widget Y requires it"); a mounted
ReportProvider with an unresolvable scope reports `status: "no-scope"` instead.

**Provider-stack derivation (one sentence, per data's ask):** `PageLayout.context: "workspace"` →
`SettingsProvider > WorkspaceProvider > ReportProvider({ kind: "scan", path: roots[0]?.path })`;
`"project"` → `SettingsProvider > ProjectProvider({ path }) > ReportProvider({ kind: "repo", path })`
where **ProjectProvider internally nests WorkspaceProvider** (ruling 3); `report?: false` omits
the ReportProvider (default on). `SettingsProvider` is `/app`-scoped until K5 (never `__root.tsx` —
legacy routes stay machinery-free).

Key value shapes (full contracts live in the data plan; implementers follow these summaries):
- `WorkspaceContextValue`: `scan`, `roots` (raw `UseQueryResult`, exposed not copied), `projects`
  (hidden filtered out), `rootErrors`, `now` (`scan.dataUpdatedAt || Date.now()` — never
  `Date.now()` during render), `scanState: "loading"|"error"|"empty"|"ready"` (union type exported),
  `refresh(force?)`, `vitals` (memoized `fleetVitals`), `filter`/`setFilter` (one filter, every
  widget narrows together).
- `ProjectContextValue`: `path`, `project`, `now`, `git` (quintet + `busy`/`diverged`), `open`,
  `copyPath`, `touch` (once), `note { value, draft, setDraft, save }`, `commitLog` (ONE cached
  entry, limit 200; other limits via `useCommitLogQuery(path, limit)` direct hook — hook-safety
  rule), `ide { status, open, installingLabel }` (poll 5 s only while installing/starting).
- `ReportContextValue`: the state machine — `status: "no-scope"|"loading"|"missing"|"running"|"stale"|"fresh"`
  (priority order as drafted by data: no-scope → running → loading → missing → stale/fresh), retained
  `exportData`/`byPath` during `running`, `entry(path)`, `isEntryStale(path)` (both staleness rules
  owned here, wrapping the unchanged `@workspace-welcome/api/lib/report-staleness`), `command`/
  `commandError`, `generate({force})` (missing → no force, stale → force), `period`/`setPeriod`,
  `view: ReportView | null`.
- `SettingsContextValue`: `settings` query + convenience reads + `update(input)`.

**Queries module** (`lib/queries/`) is the ONLY place allowed to call
`trpc.<proc>.queryOptions(...)` for the shared procedures (grep-enforced). Scopes, not keys:
consumers address reports by `{ kind, path, period }`. `REPORT_PERIOD_PRESETS` (incl.
`All → undefined`) exports from here. `lib/use-report.ts` keeps its public API, internals absorbed.

**Enforcement of `requires`:** (a) runtime throw in the hooks (above) + (b) architect's
`validate-layout` script in the check phase — imports presets + registry, asserts
`requires ⊆ page provider stack`, every `widget` id resolves, every `size` exists on the ladder or
resolves down it.

### 3.5 Parts (parts) — two layers, one naming contract

**Layer 1 — `packages/ui/src/components/` (presentational):** props-in, tokens-only (`var(--*)`,
zero color literals), `ariaLabel` where meaningful, fill-box roots (`h-full w-full min-h-0`),
container-query degradation only, exported `MIN_CONTENT`, reduced-motion honored, headerless
(title/meta/action chrome belongs to the shell). Inventory: `chart`, `donut`, `h-bars`, `seg-bar`,
`heatmap`, `gauge`, `pulse-strip` (chart/geometry family, P2); `animated-number`, `stat`,
`vitals-band`, `led`, `severity-dots`, `chip`, `git-glyphs`, `score-ring` (+ScoreChip),
`data-table`, `kv-list`, `widget-tabs`, `view-carousel` (readout/table/layout, P3);
`theme-scope` (P1). New deps via catalog refs only: `recharts@^3.0.0`, `@tanstack/react-table@^9.2.4`,
`motion@^13.2.0` — ui gains nothing else, no barrel additions.

**Charts policy (ruling 5, settled #9 as written):** ONE recharts engine. `Chart` takes
`{ variant: "area" | "bars"; points: { label; value }[]; … }`, `MIN_CONTENT = 200×160`, mounts
recharts client-only (SSR renders a definite-box placeholder; grid rows are px-definite so the
box is always definite), `isAnimationActive={false}` under reduced motion. **No internal compact
renderer exists in mainline.** Below the floor, the widget's `sizes` ladder supplies non-chart
presentation (Stat numerals, Led, SegBar geometry). Donut (110×110 / 64×64), SegBar (40×8),
HBars, PulseStrip (64×12) are engine-less SVG/div geometry — legal, not the chart part.

**Layer 2 — `apps/web/src/widgets/parts/` (context-consuming):** consume
`useWorkspace()/useProject()/useReport()/useSettings()` and scan-metrics; never call tRPC directly
(leaf parts FileBrowser/Artifacts keep their container-independent internal queries — leaf parts
fetch, contexts provide scope). `ReportGate` final API:

```ts
interface ReportGateProps {
  children?: ReactNode;            // rendered for stale AND fresh (plain node, not a render-prop)
  entry?: string;                  // project path inside a scan-scope export; default = the scope itself
  mode?: "gate" | "banner" | "line";
  quiet?: boolean;                 // loading/no-scope render null (1x1 placements)
  missing?: ReactNode; running?: ReactNode; loading?: ReactNode;   // override slots
}
```

Behavior matrix: `no-scope` → null · `loading` → skeleton (null when quiet) · `missing` →
GenerateCTA (button + copyable CLI + commandError) · `running` → progress strip OVER retained
children (exportData never wiped) · `stale` → children + stale chip + regenerate(force) · `fresh`
→ children. `banner` = stale strip + children; `line` = one-line status strip (mb's
SnitchStatusStrip successor — this is the mission-bento "signal line" salvage).

`widgets/parts/registry.ts` wraps each ui primitive/app part with `definePart({ id, min, component })`
— one source of truth for `min` (the ui export); ui primitives never wrap themselves. DataTable
(tanstack v9, McTable's proven feature set, `minWidth` 420) **never scrolls internally**: below
minWidth the ladder swaps to KVList of the first 2 columns, top-N rows. Git interactive parts
(`git/branch-switcher`, `git/actions-toolbar`) read `useProject().git`. Forms are ONE token-styled
set over `@/lib/forms` (themes ship no dialog containers). Motion conventions live in
`packages/ui/src/lib/motion.ts`; parts animate content only — placement animation is the shell's.

### 3.6 Theme system (migration)

A theme = presets + tokens, inside `widgets/themes/<slug>/`:
1. **`tokens.css`** — the FULL required-token manifest (base shadcn set + semantic part tokens
   `--sev-critical|--sev-warning|--sev-info`, `--state-positive`, `--recency-fresh|-stale`,
   `--pinned-accent`, `--chart-1..6`, `--font-mono`, `--eyebrow`, chrome radius/hairline/panel-bg)
   under `[data-ww-theme="<slug>"]`, plus the one recharts token-fill block. Color literals only
   on custom-property declaration lines. Completeness is probe-enforced against
   `scripts/widget-check/required-tokens.json`.
2. **`preset.ts`** — `ThemePreset { id, label, dashboard: PageLayout, project: PageLayout }`;
   stack regions with authored `at`/`size`; dynamic tiles via `from: "projects"` flow references.
3. **`custom.css`** (optional) — additive skin only; never layout/visibility; dropped by `?bare=1`.
4. **`widgets/`** — theme widget KINDS (compositions of common parts/runtime/contexts + packages/ui
   ONLY — never recharts/tanstack-table/queries/tRPC, grep-enforced).

Themes do NOT ship: dialog containers, portals, flows, parts. Missing part → escalate (§6.3);
missing common-widget composition → write a kind here. ThemeScope is mounted once per route by
`renderLayout` (header + board inside); the scope div must not create a containing block
(no transform/filter/contain/overflow/z-index/position) — documented in-file and probe-enforced;
`useThemePortal()` stays exported (drag ghost portals into the same host).

### 3.7 Severity + ledState

Canonical `critical | warning | info` **at the packages/api emission boundary** — scan emits
canonical (`AlertSeverity` in `types.ts`, 4 sites in `scan.ts`); NO runtime mapper survives
anywhere; the CSS token rename (`--sev-error|--sev-warn` → `--sev-critical|--sev-warning`) rides
the SAME commit (D1). Grep invariant: zero `severity === "error"|"warn"` comparisons in
`widgets/**` + `packages/ui/src/components/**`. `ledState` per ruling 4 (§2.4).

### 3.8 Validation infrastructure

**ONE harness** (`scripts/widget-check/`, built M2, extended by P5 + waves):

```
run.mjs                     # --theme --page --viewport --suite {theme,lab,parts-preview} --bare --base-url --out
probes/  no-inner-scroll · density · token-completeness · portal-scope · placement · part-min
interactions/              # one keyboard-first script per matrix row
grep-invariants.mjs
required-tokens.json        # canonical --sev-* names
fixture.sh                  # deterministic git fixture; roots-hygiene guard (never mutates real projects)
legacy-sentinel.mjs         # legacy design route + production / render + one dialog opens
```

Output contract: `PASS|FAIL|WARN <check> <detail>` lines + JSON summary; exit ≠ 0 on FAIL. Probes
wait for `data-ready`. Probe semantics: **no-inner-scroll** — walk `[data-theme-scope]`, skip
`[data-slot]` portal subtrees (chrome exemption), FAIL any scroller beyond a 2 px tolerance unless
`data-scroll="widget"` AND allowlisted (allowlist ships EMPTY — see G1); **density** —
union-of-children bbox ÷ content box ≥ 0.70, `data-density-exempt` only for loading/error/empty,
skip widgets < 40 px; **token-completeness** — every manifest token resolves non-empty on the scope
element, theme values differ where intended; **portal-scope** — computed `--background` inside
portal content equals the scope's; **placement** — `data-x/y/cols/rows` match computed positions,
top-level bboxes pairwise disjoint, grid children count === widget count; **part-min** — every
rendered part box ≥ its `data-part-min-w/h` at its rendered rung, no horizontal overflow.

Grep invariants (per wave + C1): (1) `widgets/themes/**` has no recharts/tanstack-table/useTRPC/
`@/lib/queries`/`useQuery(`/`useMutation(` imports (context hooks allowed — that IS the
no-props-drilling path); (2) zero color literals in `apps/web/src/widgets/**` + new part files in
`packages/ui/src/components/**` (closed grandfather allowlist from M2's baseline scan); (3) theme
CSS literals only on custom-property declaration lines; (4) zero old severity vocabulary +
`"no-root"`; (5) theme widget-kind files import ≥ 1 of parts/runtime/contexts, no component name
collides with a registry part id, `d="M` path data in themes flagged; (6) validate-layout runs
here; (7) no `any`/`as any` anywhere.

Interaction matrix (keyboard-first): filter; sort via `data-sort-key`; drag (focus
`data-drag-handle`, arrows, assert `data-x/y` deltas + registry-min clamps + no-inner-scroll
re-probe); resize (re-ladder `data-size`); carousel (reduced-motion emulation); tabs/views
(keyboard 1..N); git on fixture (fetch/pull toasts, branch switch, busy-disable); note (save +
reload survival); report (`[data-report-status]` reaches `fresh`; backdated `generatedAt` asserts
the stale chip); files/artifacts/ideation; forms (open/cancel-safe); same-theme navigation. The
react-resizable-panels row is DROPPED (control no longer exists on new pages). A legacy-sentinel
row runs at every wave gate.

Deterministic fixture: `fixture.sh create` builds `$TMPDIR/ww-check-fixture/` (git repo, 3 commits
at pinned `GIT_AUTHOR_DATE`s, deterministic package.json, one dirty file); the suite adds/removes
it as a root THROUGH the add-root dialog and aborts unless `roots.list` is fixture-only — git
mutations never touch real projects.

---

## 4. Integrated phase graph

32 phases, 38 implementer dispatches. `S` = single-implementer sequential; `P` = runs concurrently
with its marked partners; waves = multi-agent. Stages are scheduling slots, not hard barriers —
a phase may start as soon as its dependencies are met.

```
STAGE 0 (concurrent, disjoint file sets)
  D1 severity ──┬──────────────┐
  P1 ThemeScope ┤              │
  W1 contracts ∥ W2 packing ───┤   (D3 format unification, parallel with D1/D2)
  D3 format ────┘              │
STAGE 1      M1 routes (←P1)   D2 scan-metrics (←D1)   D4 queries (←D1)
STAGE 2      M2 harness v0 (←M1) ∥ W3 canvas (←W1,W2) ∥ P2 charts ∥ P3 readouts (←P1,D1)
STAGE 3      D5 settings+workspace ∥ D6 report (←D2,D4) → D7 project (nests Workspace)
             W4 registry+renderer+lab (←W1–W3,P1,P3,D5)
             P4 app parts (←D2,D4–D7,P2,P3,W1)
STAGE 4      M3 WALKING SKELETON — GATE (←W4,D5,D6,P3,M2)
STAGE 5      T1 wave: T1-mc ∥ T1-bento ∥ T1-meadow (←M3)   P5 preview+part-min probe (←P2–P4,M2)
             D8 provider wiring (←D5–D7,W4,M1)             V1 wave-1 validator (←T1-*,P5)
STAGE 6      T2 wave: T2-mc ∥ T2-bento ∥ T2-meadow (←T1-*,P4,D8)   V2 wave-2 validator (←T2-*)
STAGE 7      T3 wave: T3-mc ∥ T3-bento ∥ T3-meadow (←T2-*,P4)      V3 wave-3 validator (←T3-*)
STAGE 8      C1 compliance (←V3) → G1 OWNER GATE (←C1) → K1 → K2 → K3 → K4
             K5 `/`-cutover: FLAGGED OUT of default scope (own mini-plan; needs G1 + owner go)
```

Per-theme chains are independent: the orchestrator may interleave (e.g. mc-T3 while bento-T2)
provided that theme's validator ran. Validators never skip. Commit convention (with dispatch
authorization): one commit per phase gate, `widget-system(<phase-id>): <summary>`; K1 commits per
theme; everything revertible in units.

---

## 5. Phase specifications

Notation: ● = create, ✎ = edit. **Standard gate for EVERY phase** (repeated per phase as its
Gatekeeping): `pnpm run check-types && pnpm build` from the repo root. Phases marked "live" also
run the deploy loop
`flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`
(resolve the port via `systemctl --user cat workspace-welcome.service`, then point harness scripts
at it with `--base-url`). Harness commands apply once `scripts/widget-check/` exists (M2+).

---

### D1 — Canonical severity (api + tokens + sweep)

- **Type:** S (Stage 0; concurrent with P1/W1/W2/D3).
- **Requirements:**
  1. ✎ `packages/api/src/lib/types.ts`: `export type AlertSeverity = "critical" | "warning" | "info";` (was `"error" | "warn" | "info"`). `AlertCode` unchanged.
  2. ✎ `packages/api/src/lib/scan.ts`: the 4 emission sites — `severity: "error"` → `"critical"`, `severity: "warn"` → `"warning"`.
  3. Rename CSS tokens IN THE SAME COMMIT: `--sev-error|--sev-warn|--sev-info` → `--sev-critical|--sev-warning|--sev-info`. Verified reality: the tokens are DECLARED only in the six design stylesheets — ✎ `apps/web/src/components/designs/{mission-control,bento,meadow,swiss,ledger,mission-bento}/*.css` — and CONSUMED as `var(--sev-error)`/`var(--sev-warn)` by production files (`routes/index.tsx`, `routes/projects.$.tsx`, `components/{needs-attention,summary-cards,git-badges,project-commit-history}.tsx`, `components/file-browser/index.tsx`, `components/ideation/*`, `components/artifacts/index.tsx`) plus design files. `apps/web/src/index.css` declares none today (verified) — no base edit needed; the new system's base-theme token set arrives with T1's `tokens.css` under `[data-ww-theme]` and the `required-tokens.json` manifest.
  4. Mechanical literal sweep of severity comparisons — ✎ the 12 design files that match severity literals (mc/bento/meadow/mb/swiss/ledger metrics + tiles) and the 3 legacy production files `apps/web/src/components/{needs-attention,summary-cards,git-badges}.tsx`. `"error"`→`"critical"`, `"warn"`→`"warning"` in alert contexts only — this is a type-forced, sed-able edit (~30 lines total). One commit: one rename, not two.
- **Inputs:** `packages/api/src/lib/{types,scan}.ts`; the six design CSS files (token declarations); the ~15 web files matching severity literals/token consumers (find with `grep -rln '"warn"\|"error"\|--sev-error\|--sev-warn' apps/web/src --include="*.tsx" --include="*.ts" | grep -v node_modules`).
- **Outputs:** the ✎ files above. No new files.
- **Validation:** check-types + build green; `grep -rn 'severity === "error"\|severity === "warn"\|--sev-error\|--sev-warn' apps/web/src packages/api/src` → zero hits; production `/` still renders alerts — deploy loop + DOM check (one legacy design route + `/` + one dialog open). This manual legacy check becomes the scripted `legacy-sentinel.mjs` at M2; from M2 on it gates every wave.
- **Dependencies:** none.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; then live: deploy loop + DOM assertions above.
- **Budget:** ~18 files touched, ~200 changed lines (mechanical). Within spirit of the ≤15-file/500-line budget as a single type-forced commit; do NOT split — straddling tokens and types creates two vocabularies.

### P1 — Theme infrastructure (ThemeScope + portal patches + motion lib)

- **Type:** S (Stage 0; concurrent with D1/W1/W2/D3). FIRST parts wave; no peer deps.
- **Requirements:**
  1. ● `packages/ui/src/components/theme-scope.tsx`: `ThemeScope({ theme, children })` renders a scope div stamping BOTH `data-ww-theme={theme}` and `data-theme-scope`, provides `ThemePortalContext` + exported `useThemePortal()`. CSS contract in-file: the scope div has NO transform/filter/perspective/contain/backdrop-filter/z-index/position/overflow (must not create a containing block — portal content keeps `position: fixed` semantics).
  2. ✎ portal `container` patches — each `*Portal` wrapper passes `container={useThemePortal() ?? undefined}` — in `packages/ui/src/components/{dialog,sheet,dropdown-menu,select,popover,tooltip,context-menu,sonner}.tsx`. If the installed Base UI `Portal` prop shape differs, fall back to `createPortal(node, host ?? document.body)`. No behavior change without a scope mounted (container null → body).
  3. ● `packages/ui/src/lib/motion.ts`: `EASE = [0.2, 0.9, 0.3, 1]`, `fade = { duration: 0.15 }`, `swap = { duration: 0.2 }`, `roll = { duration: 0.3, ease: EASE }`, `layout = { type: "spring", stiffness: 300, damping: 30 }`.
  4. ✎ `packages/ui/package.json`: add `motion` as a `catalog:` dependency (`motion: ^13.2.0` per `pnpm-workspace.yaml`).
- **Inputs:** `packages/ui/src/components/*.tsx` (portal components above); `pnpm-workspace.yaml` (catalog).
- **Outputs:** the 2 ● + 9 ✎ files (~11 total).
- **Validation:** check-types + build; legacy sentinel: one legacy design-route dialog opens and portals to `document.body` unchanged (deploy loop + DOM assert portal parent === body while no scope exists); `grep -rn "data-ww-theme" packages/ui/src apps/web/src --include="*.tsx"` → only theme-scope.tsx.
- **Dependencies:** none.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live for the sentinel.

### W1 — Runtime contracts

- **Type:** P (Stage 0; parallel with W2).
- **Requirements:**
  1. ● `apps/web/src/widgets/runtime/size-class.ts`: `SizeClass` template-literal type; `SIZE_LADDER = ["1x1","2x1","2x2","2x3","3x3"]`; `parseSize`; `rankOf` (cols·rows·100 + rows); `resolveSizeClass(defined, current)` — largest defined rank ≤ current else smallest defined; never throws. Ladder resolution cases documented in-file (single source of truth).
  2. ● `apps/web/src/widgets/runtime/layout-types.ts`: `WidgetNode`, `RegionNode` (stack | flow), `PageLayout` v1 exactly per §3.3.
  3. ● `apps/web/src/widgets/runtime/widget-shell.tsx`: `WidgetShellProps` per §3.3 (`sizes` object resolution + nearest-defined fallback; `children` fallback of last resort; header/meta/action/tabs slots rendering `WidgetTabs` — one tabs implementation); `WidgetSizeContext` + `useWidgetSize()`; root sets `container-type: inline-size`; content box stretches (`flex-1 min-h-0`); `GridItemContext` read; `size` prop override for out-of-grid use; `interactive={false}` for nested composites. Document the self-degradation precedence rule + the ui-purity rule (`useWidgetSize` never consumed in packages/ui) in-file.
  4. ● `apps/web/src/widgets/runtime/part.ts`: `PartDef<P>` (`id`, optional px `min`, `component`) + `definePart` wrapper that stamps `data-part="<id>"` and `data-part-min-w/h` on the rendered root.
- **Inputs:** `docs/research/widget-part-catalog.md` (§6 min-content table, §6.3 size classes); draft-architect §1–§3 (this plan §3.3).
- **Outputs:** 4 ● files (~450 lines).
- **Validation:** check-types + build; `resolveSizeClass` exercised by the lab route at W4.
- **Dependencies:** none.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### W2 — Packing generalization

- **Type:** P (Stage 0; parallel with W1).
- **Requirements:**
  1. ● `apps/web/src/lib/grid-layout/pack-grid.ts`: the skyline packer + reading order from `apps/web/src/lib/mosaic-layout/index.ts`, item-agnostic: input `{ id, cols, rows, pinned?, at? }`; `fixed`/pinned placements honored, rest pack around/below; recency scoring REMOVED. Determinism contract carried over (pure TS).
  2. ● `apps/web/src/lib/grid-layout/score-projects.ts`: the log-scale recency score + tier blend moved VERBATIM (byte-equal logic), `now` injected.
  3. ✎ `apps/web/src/lib/mosaic-layout/index.ts` → thin re-export shim of `grid-layout` so old design routes keep compiling until K1/K3.
  4. ● `apps/web/src/widgets/runtime/flows.ts`: flow registry seam — generators typed `(input: { projects: Project[]; now: number }) => WidgetNode[]` (structural; `WorkspaceContextValue` satisfies it), registered by `from` key; the `"projects"` generator maps `scoreProjects` output to tile nodes (score passed as tile weight). Flows never call tRPC.
- **Inputs:** `apps/web/src/lib/mosaic-layout/index.ts`; `apps/web/src/lib/recency.ts`.
- **Outputs:** 3 ● + 1 ✎.
- **Validation:** check-types + build; design routes still compile against the shim (covered by check-types); pure-TS (no React imports in `lib/grid-layout/`).
- **Dependencies:** none.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### D3 — Format unification

- **Type:** P (Stage 0; parallel with D1/D2).
- **Requirements:** ✎ `apps/web/src/lib/format.ts` — add, one signature each: `formatCompact(n)` (mb ladder), `formatTokens(n)` (meadow ladder), `formatCost(cost)` (meadow superset), `compactAge(ms, now?)` (ms-elapsed, meadow week rung), `ageMs(iso, now?)` (ISO bridge), `formatElapsed(ms)` (job timers). Each helper's JSDoc names the design duplicates it replaces (deletion of those duplicates happens with the designs at K1 — do not edit design files here).
- **Inputs:** `apps/web/src/lib/format.ts`; the design format helpers (read-only: `components/designs/*/` format utils).
- **Outputs:** 1 ✎ file (~120 added lines).
- **Validation:** check-types; JSDoc provenance present per helper.
- **Dependencies:** none.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### M1 — `/app` route scaffold + preset registry + theme shell

- **Type:** S (Stage 1).
- **Requirements:**
  1. ● `apps/web/src/routes/app/index.tsx`: `/app` → redirect to `/app/mission-control` (default theme constant; owner may override at G1 — one-line change).
  2. ● `apps/web/src/routes/app/$theme/index.tsx`: dashboard shell — validates `$theme` against the preset registry; mounts `ThemeScope`; renders `renderLayout(preset.dashboard)` (renderer arrives at W4; until then renders the scope + an explicit "renderer pending" state — no fake board); `?bare=1` omits the theme's `custom.css` from the page head.
  3. ● `apps/web/src/routes/app/$theme/project.$.tsx`: project page, same shape (`preset.project`; splat = project path).
  4. ● `apps/web/src/widgets/themes/index.ts`: preset registry via `import.meta.glob("./*/preset.ts", { eager: true })`, validated (duplicate ids throw).
  5. Unknown slug → explicit "theme not found" state (honest empty state; real presets land at T1/M3).
  Routes are FROZEN after this phase — no phase after M1 edits route files except M3's provider wiring, W4's `__lab` addition, and D8's provider-stack completion.
- **Inputs:** P1 outputs (ThemeScope); migration refined §3 (this plan §3.2).
- **Outputs:** 4 ● files (~250 lines).
- **Validation:** check-types + build; deploy loop; `/app` redirects (assert Location/final URL); unknown theme renders the not-found state; `?bare=1` and no-`bare` both 200.
- **Dependencies:** P1.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live.

### D2 — scan-metrics module (incl. ledState)

- **Type:** S (Stage 1).
- **Requirements:** ● `apps/web/src/lib/scan-metrics/` — 7 files, each ≤ ~150 lines, barrel `index.ts`:
  - `severity.ts`: `worstSeverity`, `severityRank`, `severityCounts`, `severityLedger`, `attentionProjects` (worst-first, freshest tiebreak) — canonical union; PLUS ruling 4: `interface LedState { tone: "critical" | "warning" | "info" | "live" | "nominal"; label: string }` and `ledState(project: Project, now: number): LedState`.
  - `activity.ts`: `updatedMs`, `activityInstantMs`, `lastTouchMs` (two activity concepts named apart, documented), `byUpdatedDesc`, `isHot` (48 h), `activityCounts`, `activityGridFromCounts`, `heatLevel`, `dayKey`, `weeklyActivity`, `dailyActivity`, `touchedWithinDays`, `freshnessCounts`.
  - `pulse.ts`: `PulseCell`, `pulseCells(p, cells = 24, now?)`.
  - `fleet.ts`: `FleetVitals`, `fleetVitals` (MC field names, superset of mb), `partitionFleet`, `channelCounts`/`channelProjects`.
  - `stacks.ts`: `StackSlice`, `stackDistribution` (Other-folding shape wins), `dirtyLeaders` (MC recency tiebreak kept).
  - `report.ts`: `CadencePoint`, `aggregateCadance`, `AlertTally` + `alertTally`, `LanguageRow` + `languageRows` + `projectLanguages`, `indexProjectsByPath`, `entryAsExport`, `aiUsageLeaders`, `healthSummary` — over `ReportExport`, canonical severity.
  - `index.ts` barrel re-export.
  Module rules: pure TS — no React, no CSS/color tokens (`chartColor` lives in packages/ui), no `Date.now()` at module scope (`now` always a defaulted parameter; SSR-safe).
- **Inputs:** `packages/api/src/lib/types.ts` (canonical severity, D1); the four designs' metrics implementations (read-only port sources — MC/bento/meadow/mb metrics files).
- **Outputs:** 7 ● files (~600 lines total).
- **Validation:** check-types; `grep -rn "from \"react\"\|oklch(\|--chart-" apps/web/src/lib/scan-metrics/` → zero hits; module imported nowhere yet (consumers land later).
- **Dependencies:** D1.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### D4 — Queries module

- **Type:** S (Stage 1).
- **Requirements:**
  1. ● `apps/web/src/lib/queries/scan.ts`: `useScanQuery()`, `useRootsQuery()` (staleTime 5 min).
  2. ● `apps/web/src/lib/queries/reports.ts`: `ReportScope { kind: "repo" | "scan"; path: string; period?: ReportPeriod }`; `useReportCommand(scope, enabled?)` (staleTime 10 min); `useReportExport(key)` (staleTime 60 s, enabled iff key ≠ null); `useReportJob(jobKey)` (function-form `refetchInterval` 1500 ms while running else false); `useReportGenerate(scope)` (mutation + job tracking + settle-invalidation + toast-on-failure); `useReportExportsIndex()`; `export const REPORT_PERIOD_PRESETS: readonly { value: ReportPeriod | undefined; label: string }[]` (mb's array + `All → undefined`). Absorbs meadow `report-data` + mb provider internals.
  3. ● `apps/web/src/lib/queries/commit-log.ts`: `useCommitLogQuery(path, limit = 200)`.
  4. ✎ `apps/web/src/lib/use-report.ts`: keep the public API (`useReportRun` open-HTML-in-tab flow); internals now delegate to the module.
  Key-convention doc-comment: scopes-not-keys; `enabled` gating with placeholder inputs; identical input ⇒ identical key; only the query module invalidates (settings/project mutation wrappers excepted).
- **Inputs:** `apps/web/src/lib/use-report.ts`; `apps/web/src/components/designs/meadow/report-data.ts` + mb provider internals (read-only port sources); `packages/api/src/routers/reports` (API surface).
- **Outputs:** 3 ● + 1 ✎ (~300 lines).
- **Validation:** check-types + build; `grep -rn "queryOptions(" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "lib/queries/"` → only `use-report.ts` internals (which now delegate).
- **Dependencies:** D1.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### M2 — Harness v0

- **Type:** P (Stage 2; runs alongside W3/P2/P3 — different files entirely).
- **Requirements:** ● `scripts/widget-check/` per §3.8:
  1. `run.mjs` with the full flag contract (`--theme --page --viewport --suite {theme,lab,parts-preview} --bare --base-url --out`); settles on `[data-ready]`; serial probe eval; `PASS|FAIL|WARN` lines + JSON summary; exit ≠ 0 on FAIL.
  2. `probes/{no-inner-scroll,density,token-completeness,portal-scope,placement,part-min}.mjs` with the §3.8 semantics (part-min assertions finalized jointly with P5). no-inner-scroll allowlist config ships EMPTY by design.
  3. `interactions/` runner + first scripts (filter, sort, tabs, navigation).
  4. `grep-invariants.mjs` (all 7, §3.8) + baseline color-literal scan producing the closed grandfather allowlist for legacy `packages/ui` files.
  5. `required-tokens.json` (canonical `--sev-*` names + full manifest from §3.6.1).
  6. `fixture.sh` (create/destroy; date-pinned commits; roots-hygiene guard: abort unless `roots.list` is fixture-only).
  7. `legacy-sentinel.mjs` (legacy `/designs/mission-control` + `/` render; one dialog opens, portals outside `[data-theme-scope]`).
  8. Self-test panel component (`scripts/widget-check/self-test/` or `apps/web/src/widgets/lab/self-test.tsx`) rendering known-bad elements (an inner scroller, a missing token, an under-dense widget) mounted on a temporary dev-only route `apps/web/src/routes/app/__check.tsx` — every probe MUST fail it (proves the probes). The panel folds into `/app/__lab` at W4 and `__check` is deleted then; end state = exactly two dev routes.
- **Inputs:** M1 outputs (a live `/app` to target); this plan §3.8.
- **Outputs:** ~10 ● files (~500 lines).
- **Validation:** check-types + build (the route file compiles; `.mjs` scripts are runtime); deploy loop; `run.mjs --suite self-test` → every probe reports FAIL on the known-bad panel (expected failures prove detection); `legacy-sentinel.mjs` green; `grep-invariants.mjs` green against the current tree with the baseline allowlist.
- **Dependencies:** M1.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live + `node scripts/widget-check/run.mjs --suite self-test --base-url <url>`.

### W3 — Grid canvas + interaction

- **Type:** S (Stage 2).
- **Requirements:**
  1. ● `apps/web/src/widgets/runtime/grid-canvas.tsx`: grid container per §3.3 (`--grid-cols`/`--cell-h`/`--grid-gap` vars from the preset); widgets as direct children with inline `gridColumn/gridRow`; placement data-attribute contract (`data-widget/x/y/cols/rows/size`); `data-ready` stamped in `useEffect` after hydration + placement commit; `useViewportColumns` (desktop-initializer + matchMedia effect) with narrow re-pack (authored placements clamp; flow regions re-pack); ghost element client-only.
  2. ● `apps/web/src/widgets/runtime/use-grid-drag.ts`: isolated snapped drag/resize controller — pointer capture best-effort + window-level move/up fallback (synthetic-event-safe); keyboard-primary path (focusable handles with `aria-label`s, arrows = 1 cell with live commit, Escape reverts to session-start, `aria-live="polite"` announcement); resize handles on E/S/SE; clamps to registry `min`; commit → pin moved widget + `packGrid` re-pack of the region. This hook is the dnd-kit-swap seam.
  3. ● `apps/web/src/widgets/runtime/grid-session.ts`: module-scope session placement store keyed by page id; serializable values; resets on reload (settled #4).
- **Inputs:** W1 + W2 outputs.
- **Outputs:** 3 ● files (~400 lines).
- **Validation:** check-types + build; interaction verified on the W4 lab via keyboard-event DOM script (focus handle → arrows → assert `gridColumn/gridRow` changed + floor respected). No live gate of its own — W4's lab exercises it.
- **Dependencies:** W1, W2.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### P2 — ui chart family (ONE recharts engine; NO compact renderer)

- **Type:** P (Stage 2; parallel with P3).
- **Requirements:** ● in `packages/ui/src/components/`:
  1. `chart.tsx` — the ONE chart part: recharts, `variant: "area" | "bars"`, generic `points: { label: string; value: number }[]`, `color?` (default `var(--chart-1)`), `maxPoints?` (16), `dots?`, `formatValue?`, `ariaLabel`, `className?`. `export const MIN_CONTENT = { w: 200, h: 160 }`. Client-only mount (`useEffect` gate; SSR = definite-box placeholder — no hydration window mismatch). `isAnimationActive={false}` under `useReducedMotion()`. **No second renderer: below its floor the widget's `sizes` ladder supplies non-chart presentation (Stat/Led/SegBar). Do NOT build the compact-SVG monotone flip or `lib/curve.ts`** (ruling 5; owner-flip option recorded in §8.2).
  2. `donut.tsx` — hand-SVG geometry: `slices: { label; value; color? }[]` (default ramp `--chart-1..6`), `size?` (148), `center?: { value; label }`; MIN_CONTENT 110×110 with center / 64×64 without.
  3. `h-bars.tsx` — `rows: { label; value; display?; color? }[]`, `maxRows?` (clamp + "+N" footer), `onRowClick?`; MIN_CONTENT 140×(rows×18).
  4. `seg-bar.tsx` — `segments: { value; color?; label? }[]`, `height?: 8 | 10`; MIN_CONTENT 40×8; zero total → muted full bar.
  5. `heatmap.tsx` — MC's promoted shape: `counts: Map<string, number>`, `weeks?` (18), `now`, `cellMax?` (26); min 4 weeks ≈ 68 px wide.
  6. `gauge.tsx` — bento's 240° arc: `value` 0–100, `label`, `formatValue?`; MIN_CONTENT 170×110.
  7. `pulse-strip.tsx` — `cells: { intensity: 0..1; tick? }[]`, `tone?: "accent" | "sev"`; MIN_CONTENT 64×12.
  8. ✎ `packages/ui/package.json`: add `recharts` as `catalog:` ref (`^3.0.0`).
  All parts: tokens-only (`var(--*)`, zero color literals), fill-box roots, container queries only, reduced-motion honored, exported `MIN_CONTENT`.
- **Inputs:** port sources (read-only): `components/designs/mission-control/analytics-zone.tsx` (Heatmap), `components/designs/meadow/charts.tsx` (Donut/HBars/SegBar shapes), `components/designs/bento/health-tile.tsx` (Gauge), MC/bento pulse strips.
- **Outputs:** 7 ● + 1 ✎.
- **Validation:** check-types + build; recharts mode client-only (grep the `useEffect` gate in chart.tsx); zero color literals in the new files; `useReducedMotion` present where anything animates; no `lib/curve.ts` created.
- **Dependencies:** P1 (motion lib).
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### P3 — ui readout / table / git / layout

- **Type:** P (Stage 2; parallel with P2).
- **Requirements:** ● in `packages/ui/src/components/`:
  1. `animated-number.tsx` — `value: string | number`, `motion?: "fade" | "roll" | "spring"`; reduced-motion = instant swap.
  2. `stat.tsx` — `{ label; value: ReactNode; tone?; size?: "sm"|"md"|"lg"; hint? }`.
  3. `vitals-band.tsx` — `{ cells: { label; value; tone? }[]; onCellClick? }` — pure layout over Stat + AnimatedNumber; flex-wrap.
  4. `led.tsx` — `{ tone: "critical" | "warning" | "info" | "live" | "nominal" }` (own structural union — NEVER imports scan-metrics), `label?`, `tag?`, `pulse?` (off under reduced motion).
  5. `severity-dots.tsx`, `chip.tsx` (`Tone` → token map), `git-glyphs.tsx` (structural `{ isRepo; ahead?; behind?; dirtyCount? }` — no api import), `score-ring.tsx` (`ScoreRing` + `ScoreChip`; mosaic log-score 0..1; 14 px micro floor).
  6. `data-table.tsx` — @tanstack/react-table@9 with McTable's proven `tableFeatures` shape (sorting, column visibility, column sizing, sorted row model; optional filters), `minWidth?` (420; Fleet passes 720), `onRowClick?`, `empty?`; rows stamp `data-sort-key={row.id}`; **never scrolls internally** — below minWidth is the ladder's job (KVList).
  7. `kv-list.tsx` — `{ rows: { label; value: ReactNode; tone?; mono? }[]; density? }`.
  8. `widget-tabs.tsx` — built ON ui `Tabs`; `{ tabs; active; onChange; size? }` — the ONE tabs implementation (shell `tabs` prop renders it too).
  9. `view-carousel.tsx` — `{ cards: { id; label; node }[]; autoAdvance? }` (deterministic stagger seeded by id hash, hover/focus pause, OFF under reduced motion); below-min → first card only, no pills.
  10. ● `packages/ui/src/lib/tokens.ts` — `Tone` type + `chartColor(i): string` cycling `--chart-1..6` (color cycling is ui's, NOT scan-metrics').
  11. ✎ `packages/ui/src/components/carousel.tsx` — height-chain fix (content height owned; kills the bento CSS hacks).
  12. ✎ `packages/ui/package.json`: add `@tanstack/react-table` as `catalog:` ref (`^9.2.4`).
- **Inputs:** port sources (read-only): bento `roll-number.tsx`, meadow `bits.tsx`, mb `led.tsx`, bento `git-glyphs.tsx`/`recency-ring.tsx`, MC `mc-table.tsx`, bento `data-carousel.tsx`.
- **Outputs:** 13 ● + 2 ✎ (~15 files; each part small — total ≤ ~500 lines of new logic).
- **Validation:** check-types + build; `grep -l "useReducedMotion" packages/ui/src/components/{animated-number,led,view-carousel,chart}.tsx` → all present; zero color literals; DataTable has no `overflow-auto` on its scroll body.
- **Dependencies:** P1, D1 (canonical severity names from day one).
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### D5 — SettingsProvider + WorkspaceProvider

- **Type:** P (Stage 3; parallel with D6).
- **Requirements:** ● `apps/web/src/widgets/contexts/{settings,workspace}-context.tsx` with the §3.4 value shapes (Settings: query + convenience reads + `update`; Workspace: `scan`/`roots` raw results, `projects` (hidden filtered), `rootErrors`, `now` clock rule, exported `scanState` union, `refresh(force?)`, memoized `vitals`, `filter`/`setFilter`). Throwing hooks; `data-providers` stamps (space-separated lowercase keys in mount order). Providers never copy cache data; invalidation stays in `lib/queries/`.
- **Inputs:** D2 (scan-metrics types), D4 (query hooks).
- **Outputs:** 2 ● files (~250 lines).
- **Validation:** check-types + build. Runtime mounting is exercised on the parts-preview dev route (P5) and the M3 walking skeleton — D5's own gate is static.
- **Dependencies:** D2, D4.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### D6 — ReportProvider + state machine + ReportView

- **Type:** P (Stage 3; parallel with D5).
- **Requirements:**
  1. ● `apps/web/src/widgets/contexts/report-context.tsx`: the full §3.4 state machine — status priority `no-scope → running → loading → missing → stale/fresh`; `exportData`/`byPath` RETAINED during `running`; both staleness rules owned here (`isReportStale(exportData.generatedAt, latestUpdated)` for scope; `isEntryStale(path)` per-entry) wrapping the unchanged api `report-staleness`; generate mutation + 1500 ms job poll + settle-invalidation + lost-job toast; `period`/`setPeriod`; `view`.
  2. ● `apps/web/src/lib/report-view.ts`: meadow's `toReportView` promoted to THE normalizer, moved from `components/designs/meadow/report-data.ts` (do not edit the design file — copy + extend): `staleAt: string | null`; provider passes `latestUpdated` in; carries directly-consumable rows — `cadence: CadencePoint[]`, `alerts` (label/severity/summary/count/value), `languageRows`, `alertTally.rows` — so parts never re-map.
- **Inputs:** D4 outputs; `@workspace-welcome/api/lib/report-staleness.ts`; meadow `report-data.ts` (read-only source).
- **Outputs:** 2 ● files (~350 lines).
- **Validation:** check-types + build; `grep -rn "isReportStale" apps/web/src --include="*.ts" --include="*.tsx"` → exactly one caller (the provider); state-machine table documented in-file.
- **Dependencies:** D2, D4.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### D7 — ProjectProvider (nests WorkspaceProvider)

- **Type:** S (Stage 3).
- **Requirements:** ● `apps/web/src/widgets/contexts/project-context.tsx` implementing §3.4's ProjectContextValue — **mounts WorkspaceProvider internally** (ruling 3: `useWorkspace()` works under any stack including Project; same react-query cache the dashboard warmed; memoized derivations reused). Git quintet (5 mutations + scan+commitLog invalidation + `busy`/`diverged`), IDE choreography (intent ref, 5 s poll only while installing/starting, `installingLabel`), note draft/save (keyed remount on path), `copyPath`, `touch` once, `commitLog` (single cached entry, limit 200) — each existing ~4× across designs, now ONCE.
- **Inputs:** D5 + D6 outputs; the four project-page blocks (read-only port sources: `routes/designs/{mission-control,meadow,mission-bento}/project.$.tsx`, `components/designs/bento/project-page.tsx`).
- **Outputs:** 1 ● file (~300 lines).
- **Validation:** check-types; `grep -rn "useMutation" apps/web/src/widgets/` → quintet mutations greppable ONLY inside project-context.tsx.
- **Dependencies:** D5, D6.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### W4 — Registry + renderer + widget-lab + validate-layout

- **Type:** S (Stage 3).
- **Requirements:**
  1. ● `apps/web/src/widgets/registry.ts`: layered composition per ruling 2 — static `core` map + `import.meta.glob("./themes/*/widgets/index.ts", { eager: true })` merged via `mergeValidated` (throws on duplicate ids). `WidgetDef` per §3.3 with `requires`.
  2. ● `apps/web/src/widgets/runtime/render-layout.tsx`: `renderLayout(preset)` → regions → placements (authored `at` | `packGrid`) → registry components in `GridCanvas`; mounts ONE `ThemeScope` per route (header + board inside); builds the provider stack from `PageLayout.context` per §3.4's one-sentence spec (`report?: false` escape honored); runs flow generators inside the provider stack; dev-mode assertion `requires ⊆ provider stack` (reads `data-providers`).
  3. ● `apps/web/src/widgets/runtime/use-console-keys.ts`: `/` focuses filter, 1–N switches views, Escape restores — consuming `WorkspaceContext.filter`.
  4. ● `apps/web/src/widgets/lab/` + ● `apps/web/src/routes/app/__lab.tsx` (dev-guarded): widget-lab renders every registry widget at every ladder class on a 12-col canvas; hosts the harness self-test panel (fold `__check` in; delete the temporary route).
  5. ● validate-layout script (wired into the check phase + `grep-invariants.mjs` #6): every preset node's `widget` id resolves; `requires ⊆ provider stack`; every `size` on the ladder or resolvable down it.
- **Inputs:** W1–W3 outputs; P1 (ThemeScope); P3 (first parts for the lab); D5 (real WorkspaceContext); M2 (self-test panel).
- **Outputs:** ~7 ● files.
- **Validation:** check-types + build; deploy loop + DOM script on `/app/__lab`: placement integrity, no-inner-scroll, no horizontal overflow (3 viewports), grid-children === widget count, part boxes ≥ `data-part-min-w/h` at every ladder class; keyboard drag/resize script passes (W3's payoff); self-test panel still fails every probe; validate-layout green; temporary `__check` route deleted.
- **Dependencies:** W1, W2, W3, P1, P3, D5, M2.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live + `node scripts/widget-check/run.mjs --suite lab --base-url <url>`.

### P4 — App context parts

- **Type:** S (Stage 3; after D7 + P2/P3).
- **Requirements:** ● `apps/web/src/widgets/parts/` per §3.5 Layer 2:
  1. `report-gate.tsx` — the merged §3.5 API + behavior matrix (mode densities, slots, quiet, retain-content-under-running).
  2. `attention-list.tsx` — `density?: "rows" | "strip"`, `max?`, `onOpen?`; consumes `useWorkspace()` → `attentionProjects`.
  3. `project-pulse.tsx` — `{ project; cells? }`; `useWorkspace().now` + `pulseCells()` → ui `PulseStrip`.
  4. `note-editor.tsx` — `{ rows? }`; `useProject().note`.
  5. `led-project.tsx` — `ProjectLed { project }` = `ledState(project, useWorkspace().now)` → ui `<Led>` (ruling 4 composition; retires StatusLed/projectLed).
  6. `git/branch-switcher.tsx`, `git/actions-toolbar.tsx` — read `useProject().git` (busy, diverged, quintet); legacy `components/project-git-actions.tsx` keeps working untouched until K5 (compat prop path).
  7. `list/files.tsx` (wrapper over shared FileBrowser; requires the height prop below), `list/artifacts.tsx`, `list/commits.tsx` (`{ limit?; view?: "table" | "graph" | "list" }` — uses the `useCommitLogQuery(path, limit)` direct hook; default 200 hits the provider's cached entry).
  8. `form/{create-project,add-root,clone-script,report-run}.tsx` — ui Dialog + existing `lib/forms` flows; `FormReportRun` consumes `REPORT_PERIOD_PRESETS`; `FormCloneScript` over the new `useCloneScript`.
  9. `registry.ts` — `definePart` wrappers (id + MIN_CONTENT + component; never restate px values) — and `index.ts` barrel (the ONLY import surface for widgets/themes).
  10. ● `apps/web/src/lib/forms/clone-script.ts` — `useCloneScript` (selection state, all/none, copy/download around `packages/api` `buildCloneScript`), mirroring `add-root.ts`.
  11. ✎ `apps/web/src/components/file-browser/index.tsx` — add the height prop (kills the `[class*="h-[70vh]"]` override hack; ~1 line at the style site).
- **Inputs:** D2 (metrics + ledState), D4–D7 (contexts + queries + presets), P2/P3 (ui parts), W1 (`definePart`); `components/file-browser/`, `components/artifacts/`, `lib/forms/`.
- **Outputs:** ~16 ● + 1 ✎ (~500 lines).
- **Validation:** check-types + build; barrel compiles; `FormCloneScript` copy/download typecheck against `packages/api/src/lib/clone-script.ts`; ReportGate matrix documented in-file; no tRPC calls outside `lib/queries/` + leaf list wrappers.
- **Dependencies:** D2, D4, D5, D6, D7, P2, P3, W1.
- **Gatekeeping:** `pnpm run check-types && pnpm build`.

### M3 — Walking skeleton (GATE)

- **Type:** S (Stage 4). **This is the integration gate: prove contexts → runtime → parts → harness compose before any theme wave.**
- **Requirements:**
  1. ● `apps/web/src/widgets/themes/mission-control/widgets/vitals-skeleton.tsx` — one workspace widget kind reading `useWorkspace()`, hosting `Stat` + `VitalsBand` via a `sizes` map (exercises the ladder; context-free P3 parts by design — ReportGate is P4 and NOT required here).
  2. ● `apps/web/src/widgets/themes/mission-control/widgets/index.ts` — exports the kind (picked up by the registry glob).
  3. ● `apps/web/src/widgets/themes/mission-control/preset.ts` — skeleton `ThemePreset`: dashboard = one stack region with one vitals node; project = empty shell (real presets replace this at T1/T2/T3-mc).
  4. ✎ `apps/web/src/routes/app/$theme/index.tsx` — mount the real workspace provider stack (SettingsProvider > WorkspaceProvider > ReportProvider{scan, roots[0]} via W4's builder) + `renderLayout`.
- **Inputs:** W4, D5, P3, M2 outputs.
- **Outputs:** 3 ● + 1 ✎ (~200 lines).
- **Validation (GATE):** check-types + build; deploy loop; harness green on `/app/mission-control`: probes (placement, no-inner-scroll, density, part-min at rendered rungs, token handling for base scope) + keyboard drag/resize interaction (arrows move `data-x/y`; clamps hold) + `data-ready` settles + `data-providers="settings workspace report"` asserted; legacy sentinel green. A red gate blocks ALL theme waves.
- **Dependencies:** W4, D5, D6, P3, M2.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live + `node scripts/widget-check/run.mjs --theme mission-control --page dashboard --base-url <url>` + `legacy-sentinel.mjs`.

### T1 — Theme wave 1: tokens + preset shells (×3, parallel)

- **Type:** P (Stage 5; three agents — T1-mc, T1-bento, T1-meadow — each writing ONLY `widgets/themes/<slug>/**`).
- **Requirements (each theme):**
  1. ● `widgets/themes/<slug>/tokens.css` — the FULL required-token manifest (§3.6.1) under `[data-ww-theme="<slug>"]` incl. the one recharts token-fill block; ported from the design's stylesheet values (`mission-control.css` / `bento.css` / `meadow.css`); literals only on custom-property declaration lines; canonical `--sev-*` names.
  2. ● `widgets/themes/<slug>/preset.ts` — real `ThemePreset` shells: `columns` per breakpoint + `cell.h` from the design's density (92–104 px range), dashboard/project as empty-region `PageLayout`s (mc may keep the M3 skeleton widget until T2).
  3. ● `widgets/themes/<slug>/widgets/index.ts` — the theme's widget-kind export (may start empty-ish; grows at T2/T3).
- **Inputs (per theme):** `components/designs/<slug>/<slug>.css` (token values); the design's column/density constants; M3 (runtime live).
- **Outputs (per theme):** 3–4 ● files (~250 lines).
- **Per-agent validation:** check-types + build; token completeness against `required-tokens.json` via harness on `/app/<slug>`.
- **Dependencies:** M3.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live via V1.
- **Phase-wide validation:** V1 (below). Theme agents never edit shared files (glob registries absorb them); routes frozen.

### P5 — Parts preview + part-min probe + reference doc

- **Type:** S (Stage 5; runs alongside the T1 wave).
- **Requirements:**
  1. ● `apps/web/src/routes/parts-preview.tsx` (dev-only, `import.meta.env.DEV`-guarded): renders every part at the ladder boxes (1x1/2x1/2x2/2x3/3x3 at a 96 px cell) inside a ThemeScope per theme; hosts data's provider-mount validation panel (D5–D7 providers mounted, `data-providers` visible).
  2. Author `scripts/widget-check/probes/part-min.mjs` final assertions (box ≥ declared `data-part-min-w/h` at every rendered rung; no horizontal overflow; token resolution non-empty; dialog fixed-box == viewport inside scope) wired as `run.mjs --suite parts-preview`.
  3. ● `docs/research/parts-reference.md` (generated): part → props → MIN_CONTENT → below-min fallback (document ladder swaps; the chart row states the non-chart fallback, no compact renderer).
- **Inputs:** P2–P4 outputs; M2 harness; D5–D7 (provider panel).
- **Outputs:** 1 ● route + probe assertions + 1 ● doc.
- **Validation:** check-types + build; `run.mjs --suite parts-preview` green on all three scopes.
- **Dependencies:** P2, P3, P4, M2.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live + `node scripts/widget-check/run.mjs --suite parts-preview --base-url <url>`.

### V1 — Wave-1 validator (phase-wide)

- **Type:** S (Stage 5; after T1-mc/bento/meadow AND P5).
- **Requirements:** Run, and report (stdout + `--out`): harness probes on all 3 boards; token completeness ×3; registry/preset greps; legacy sentinel; `--suite parts-preview`; cross-theme commonality section (e.g. "3/3 themes resolve tokens; 0 local part implementations"). Failures route to the owning phase (fix-dispatch loop) — the validator re-runs until green.
- **Inputs:** T1 outputs, P5, harness.
- **Outputs:** wave report only (no repo files).
- **Validation:** all checks PASS.
- **Dependencies:** T1-mc, T1-bento, T1-meadow, P5.
- **Gatekeeping:** harness commands above + `pnpm run check-types && pnpm build` (tree state).

### D8 — Wire provider stacks into `/app` shells (wiring ONLY)

- **Type:** S (Stage 5; before T2; concurrent-capable with T1/P5/V1).
- **Requirements:** ✎ `apps/web/src/routes/app/$theme/{index,project.$}.tsx` — complete both shells via W4's provider-stack builder: dashboard `Settings > Workspace > Report{scan, roots[0]}`; project `Settings > Project{path, nests Workspace} > Report{repo, path}`; `report?: false` honored. **NO deletions, NO design-file edits** (design deletions are K1; `CommitHistoryCell` rewiring is cancelled — it stays for legacy routes and dies at K1/K5 untouched; the new system's `ListCommits` supersedes it).
- **Inputs:** D5–D7, W4 outputs; M1 shells.
- **Outputs:** 2 ✎ files (small).
- **Validation:** check-types + build; deploy loop; `data-providers` asserted per page type; project page renders under fixture root.
- **Dependencies:** D5, D6, D7, W4, M1.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live.

### T2 — Theme wave 2: dashboards (×3, parallel)

- **Type:** P (Stage 6; three agents, each ONLY in `widgets/themes/<slug>/**`).
- **Requirements (each theme):** populate `preset.ts`'s `dashboard` (stack regions with authored `at`/`size`; per-project tiles via `from: "projects"` flow references) + theme widget kinds where the common set lacks a composition (mc nav rail, meadow context panel) + optional `custom.css`. Port widget-for-widget from the design dashboard; every design-local metric/format/part usage maps to the shared modules (scan-metrics / format.ts / parts barrel). Import surface: `widgets/parts/`, `widgets/runtime/`, `widgets/contexts/`, `packages/ui` ONLY. Below-floor chart placements get authored smaller rungs (non-chart) — no chart is placed under 200×160. If a part is missing: record in the wave report, STOP that widget, escalate — never a local copy.
- **Inputs (per theme):** `components/designs/<slug>/**` + `routes/designs/<slug>/index.tsx` (port sources); P4 parts barrel; the catalog's per-theme widget lists.
- **Outputs (per theme):** 6–8 files, ≤ ~500 lines. **Split rule:** if an estimate exceeds ~500 lines (mission-control is the likely one), split into two dispatches (e.g. fleet+command bar, then analytics zone) — V2 runs on partial boards.
- **Per-agent validation:** check-types + build; harness on own dashboard.
- **Dependencies:** T1-<slug>, P4, D8.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live via V2.
- **Phase-wide validation:** V2.

### V2 — Wave-2 validator (phase-wide)

- **Type:** S (Stage 6; after all T2s — or after each theme's T2 for early signal; final run covers all).
- **Requirements:** Full harness × 3 dashboards × 3 viewports (3440×1440, 1280×800, 390×844) + **bare pass** (`?bare=1`, full interaction suite must still pass) + grep invariants + legacy sentinel + cross-theme commonality ("N/3 themes import Chart from parts; 0 local chart implementations"). Fix-dispatch until green.
- **Dependencies:** T2-mc, T2-bento, T2-meadow.
- **Gatekeeping:** harness + `pnpm run check-types && pnpm build`.

### T3 — Theme wave 3: project pages (×3, parallel)

- **Type:** P (Stage 7; three agents; interleave legal — mc-T3 may run while bento-T2, provided bento's V2 ran).
- **Requirements (each theme):** populate `preset.ts`'s `project` + project widget kinds (hero tile — mb's InstrumentTile-as-hero precedent is legal because ProjectProvider nests Workspace; git toolbar/branch switcher via `git/` parts; note; commits; files/artifacts; report zones gated by `ReportGate`). Same import surface + escalation rules as T2.
- **Inputs (per theme):** `components/designs/<slug>/**` + `routes/designs/<slug>/project.$.tsx` (port sources); P4.
- **Outputs (per theme):** 5–7 files, ≤ ~450 lines (same split rule).
- **Dependencies:** T2-<slug> (same theme), P4.
- **Gatekeeping:** `pnpm run check-types && pnpm build`; live via V3.
- **Phase-wide validation:** V3.

### V3 — Wave-3 validator (phase-wide)

- **Type:** S (Stage 7).
- **Requirements:** harness × 3 project pages with the deterministic fixture (git mutations on fixture only) + navigation-consistency (every open-project affordance lands on the same theme's project route — never `/designs`, never legacy `/projects/`) + greps + legacy sentinel. Fix-dispatch until green.
- **Dependencies:** T3-mc, T3-bento, T3-meadow.
- **Gatekeeping:** harness + `pnpm run check-types && pnpm build`.

### C1 — Compliance agent (owner-mandated)

- **Type:** S (Stage 8).
- **Requirements:** run the FULL matrix — 6 addresses × 3 viewports × all probes + complete interaction suite + bare pass + grep invariants + fixture-driven report/git/note rows; produce the per-theme×page×viewport PASS/FAIL table, cross-theme commonality section, and a defects list with owner routing (runtime/parts/theme/contexts). Fix-dispatch loop until green or blocking. Green C1 is the entry condition for G1.
- **Inputs:** V3 tree; harness; fixture.
- **Outputs:** compliance report (pasted into the phase report; no report files committed).
- **Validation:** zero FAILs across the matrix.
- **Dependencies:** V3.
- **Gatekeeping:** all harness commands + `pnpm run check-types && pnpm build`.

### G1 — OWNER gate (visual + decisions)

- **Type:** S (Stage 8; the owner — not an agent).
- **Requirements:** owner click-through of the 6 pages vs the live `/designs/*` routes, PLUS the decision list (ruling 7, in order):
  1. **`sizes={{…}}` syntax sign-off** — FIRST item. The owner's verbatim `<Widget 2x2={...}>` is invalid JSX: verified against the repo's own tsc (`<Widget 2x2={…} />` and `<A 2={…} />` both fail `TS1003: Identifier expected`; quoted string attributes are also illegal). The implemented `sizes={{ "2x2": …, "1x1": … }}` object preserves the exact resolution semantics (nearest-defined rung, never an error).
  2. FileBrowser/ArtifactsPanel scroll exemptions — the no-inner-scroll allowlist ships EMPTY and those widgets FAIL by design until the owner signs the `data-scroll="widget"` part-level entries; ideation→Sheet ratification (mb's IdeationPanel relocates to a Sheet — chrome may scroll, it isn't a widget).
  3. Default theme for `/app` redirect (proposed: mission-control; one-line change).
  4. `no-scope` status-name ratification (context.md's sketch said `no-root`; one mechanical rename phase at worst if overturned).
  5. Catalog banner — keep `docs/research/widget-part-catalog.md` with a superseded banner (recommended) vs delete (one-command owner follow-up).
  6. K5 `/`-cutover go/no-go (§8.2).
- **Dependencies:** C1 green.
- **Gatekeeping:** owner eyeballs; no commands (agents have no vision by design).

### K1 — Delete migrated designs + mission-bento + design-metrics

- **Type:** S (Stage 8).
- **Requirements:** verify-then-delete, per-theme commits: (1) `grep -rn "components/designs" apps/web/src/widgets/` → MUST be zero; (2) verify mission-bento salvage parts exist and are imported by ≥ 1 theme or explicitly benched with a note (LED tiles → `Led` + `ProjectLed`; signal line → `ReportGate mode="line"`); (3) delete `components/designs/{mission-control,bento,meadow,mission-bento}/` + `routes/designs/{mission-control,bento,meadow,mission-bento}*` — one commit per theme; (4) same sweep deletes data's design-metrics files (`components/designs/*/metrics*`, `meadow/report-data.ts`, `mb/report-utils.ts`, `bento/bento-metrics.ts`).
- **Inputs:** G1 sign-off; V3/C1 green.
- **Outputs:** ~−60 files.
- **Validation:** check-types + build green after every per-theme commit; deploy loop; `/` + `/app/*` smoke.
- **Dependencies:** G1.
- **Gatekeeping:** `pnpm run check-types && pnpm build` after each commit; live smoke.

### K2 — Delete swiss + ledger + gallery

- **Type:** S. Delete `components/designs/{swiss,ledger}/`, `routes/designs/{swiss,ledger}*`, `routes/designs/index.tsx` (gallery); fix any inbound links. They stay recoverable in git history (settled #5 "benched on the branch"). Validation: check-types + build; `/designs` 404s cleanly. Deps: K1. Same gatekeeping.

### K3 — Dead-code sweep

- **Type:** S. Consumer-grep every export of deleted dirs; `/designs` string sweep repo-wide incl. the docs app; delete the `lib/mosaic-layout` re-export shim iff unconsumed; remove `react-resizable-panels` from `apps/web/package.json` IFF zero consumers remain (production routes may keep it until K5 — remove only what has none). Validation: check-types + build; deploy loop + `/`, `/app/*` smoke. Deps: K2.

### K4 — Docs triage

- **Type:** S. Banner on `docs/research/widget-part-catalog.md` (per G1 decision); keep generated `docs/research/parts-reference.md`; update `docs/research/workspace-welcome-architecture.md` (routes map: add `/app`, remove `/designs`) + `CONTEXT.md` (Widget/Part/Theme-preset vocabulary) + note the two dev routes. Validation: check-types + build. Deps: K3.

### K5 — `/` cutover — FLAGGED, OUT OF DEFAULT SCOPE

Redirect `/` → `/app/<default>`; retire `routes/projects.$.tsx` + legacy dashboard components + `project-git-actions.tsx`; promote SettingsProvider to the app root. Requires G1 sign-off + owner go; ships as its own mini-plan (production data surfaces differ from designs'). Not scheduled above.

---

## 6. Parallel-wave protocol (phase-wide validation, escalation, safety)

1. **Wave validators never skip.** T1/T2/T3 each get a per-theme harness run by the theme agent AND a phase-wide validator (V1/V2/V3) across themes with the cross-theme commonality section.
2. **Shared-file isolation.** Theme agents write ONLY `widgets/themes/<slug>/**`. The two glob registries (`themes/index.ts` presets, `registry.ts` theme kinds) absorb new themes with zero shared-file edits; routes frozen after M1. Violations are grep-visible (invariant #1/#5).
3. **Escalation.** Missing part → the theme agent records it in the wave report and STOPS that widget; the orchestrator dispatches a parts micro-phase (into `widgets/parts/`, available to all themes); the theme resumes. Temporary local copies are forbidden — they are how duplicates survive. A theme needing a new COMMON part proposes it into `widgets/parts/`; a new composition is a theme-local widget kind.
4. **Foundation concurrency sets** (Stage 0: D1/P1/W1/W2/D3; P2∥P3; D5∥D6; M2 alongside Stage 2) touch disjoint file sets by construction; after each set merges, one merge gate runs `pnpm run check-types && pnpm build` plus the legacy sentinel (from M2 on, scripted).
5. **Estimate overrun.** Any T2/T3 agent forecasting > ~500 lines splits its preset into two dispatches; the wave validator runs on the partial board.

---

## 7. Resolved conflicts

| # | Conflict (round-1 positions) | Resolution (binding) |
|---|---|---|
| 1 | Directory tree: `widgets/` system tree (architect, parts, data) vs migration's draft `components/widgets/` + `src/parts/` | **`apps/web/src/widgets/{runtime,contexts,parts,themes}`** (ruling 1). Migration's refined plan already publishes it — the architect's "3-vs-1 divergence" note was a stale read of the draft. One tree in §3.1, used everywhere. |
| 2 | Registry: static map (architect) vs glob merge (migration) | **Static core + `import.meta.glob("./themes/*/widgets/index.ts")` merge** (ruling 2) — parallel-wave safe; `mergeValidated` throws on duplicate ids. |
| 3 | ProjectProvider nesting WorkspaceProvider (architect asked; data initially silent) | **Nests** (ruling 3; data's R1 implements). Dashboard widgets compose on project pages. |
| 4 | ledState home: data's `ledState` in scan-metrics vs parts' `ledOf` composer | **`ledState`/`LedState` in `lib/scan-metrics/severity.ts`** as a structural union; packages/ui `Led` keeps a structurally-identical union with NO cross-import; app part `ProjectLed` composes (ruling 4). |
| 5 | Charts: compact-SVG monotone flip below 200×160 (parts' standing position) | **Settled #9 enforced as written** (ruling 5): one recharts engine; below floors → non-chart presentation via the ladder. Mainline builds no compact renderer and no `lib/curve.ts`; recorded as an owner-flip option (§8.2). This is the one specialist standing position overridden by the rulings. |
| 6 | Size-breakpoint syntax: owner's `<Widget 2x2=…>` | **`sizes={{ "2x2": … }}` object syntax**, nearest-defined fallback (ruling 6; TS1003 verified). G1 item #1. |
| 7 | Theme scope selector: `.theme-<slug>` class vs `[data-ww-theme]` attribute | Attribute `[data-ww-theme="<slug>"]` + `data-theme-scope` marker, stamped once by ThemeScope (all four converged). |
| 8 | MIN_CONTENT at runtime: grid clamps on px floors (parts) vs registry `min` (architect) | Registry `min` clamps; `MIN_CONTENT` is advisory + probe-validated (parts conceded). |
| 9 | ReportGate: render-prop children (data draft) vs ReactNode + modes (parts) | Merged: plain `children: ReactNode` + `mode` + data's slots/`quiet`; `no-scope` → null; running retains content under a progress strip. |
| 10 | Severity mapper: "single client mapper" (migration draft) vs api-emission canonical (data) | Canonical at `packages/api` emission; zero runtime mappers; token rename in the same D1 commit; strengthened zero-old-vocabulary grep. |
| 11 | Severity sweep timing: early incl. 12 design files (data) vs designs-untouched (migration) | Early sweep in D1 (type-forced); deletions stay at K1; "designs untouched" = functionally untouched, D1's literal sweep excepted; legacy sentinel guards behavior-neutrality from every gate. |
| 12 | SettingsProvider placement: `__root.tsx` (data draft) vs `/app`-scoped (migration) | `/app`-scoped until K5 (data's R7 accepted). |
| 13 | Staging routes: `/themes/{slug}` (architect sketch) vs `/app/$theme` (migration) | `/app/$theme` (architect withdrew; data + parts endorse). |
| 14 | Preset schema: `{kind, placement}` (migration draft) vs `WidgetNode` (architect) | `PageLayout` v1 / `WidgetNode` `{id, widget, size, at?, props?, slots?}` verbatim; pure data. |
| 15 | Validation tooling: three measurement stacks | ONE `scripts/widget-check/` harness; two dev routes (`/app/__lab`, parts-preview); parts' assertions live as `probes/part-min.mjs`. |
| 16 | `stackRamp` home (parts asked metrics) | Withdrawn — `chartColor(i)` in `packages/ui/src/lib/tokens.ts`; metrics stay color-free. |
| 17 | `commitLog(limit)` provider function (parts) vs hook-safety (data) | Provider = one shared entry (limit 200); other limits via `useCommitLogQuery` direct hook. |
| 18 | Build-time context enforcement: branded type (data draft) | validate-layout script (check phase) + runtime throwing hooks (both layers kept, branding dropped). |
| 19 | RRP on new pages: removed (architect) vs interaction-row asserted (migration draft) | Removed; matrix row dropped; dep removal at K3 iff zero consumers. |
| 20 | Drag testing: synthetic pointer events vs keyboard | Keyboard-first (primary scripted surface); pointer capture best-effort with window fallback. |
| 21 | Color-literal fallbacks `var(--token, literal)` (parts draft) vs zero literals (migration) | Zero literals — bare `var(--*)`; safety net = base token completeness + probe; grandfather allowlist for legacy ui files via M2 baseline. |

---

## 8. Open items

### 8.1 Owner gate G1 decision list (ruling 7 — all decided at G1 at the latest)

1. `sizes={{…}}` syntax sign-off (first; with the TS1003 verification note — §5 G1).
2. FileBrowser/ArtifactsPanel `data-scroll="widget"` allowlist entries (allowlist ships EMPTY; those widgets FAIL by design until signed) + ideation→Sheet ratification.
3. Default theme slug for `/app` redirect (proposed mission-control).
4. `no-scope` status-name ratification (vs context.md's `no-root` sketch; cosmetic — one mechanical rename at worst).
5. Catalog banner: keep `widget-part-catalog.md` superseded-bannered (recommended) vs delete.
6. K5 `/`-cutover go/no-go.

### 8.2 Flagged owner-flip option (NOT mainline)

**Micro-tile compact-SVG charts.** Micro tiles could keep true charts via a compact SVG renderer
(meadow monotone path, flip below 200×160) inside `chart.tsx` + `packages/ui/src/lib/curve.ts` —
the owner rejected this in planning (settled #9: no second hand-rolled engine; micro sizes fall
back to non-chart presentation). Mainline phases must not build it. Revisit ONLY on owner sign-off;
if flipped it is a 1-file swap inside `chart.tsx` plus the curve lib — object-level, not
architecture.

### 8.3 Genuine leftovers (noted, deliberately unsolved in this plan)

1. **Registry bundle growth:** the eager theme glob means every `/app` page imports all themes'
   widget kinds. Accepted at ~30-widgets scale; code-splitting by route is a post-migration
   revisit (both architect and data flagged it).
2. **Theme-choice persistence:** out of scope (consistent with settled #4); revisit at K5.
3. **Base UI `Portal` container prop shape** vs `@base-ui/react@^1.6.0` — P1 validates first;
   `createPortal(node, host ?? document.body)` fallback specified.
4. **Roots-nesting precondition:** scan-report scope filtering (`path.startsWith(rootPath)`)
   assumes roots don't nest. True today; documented provider precondition.
5. **Density-probe misfires:** shells must stretch content and empty states must be honestly
   `data-density-exempt` — W1 contract rule; watch at C1.
6. **K5 mini-plan** (§5 end): production-data surfaces differ from designs'; needs its own plan if
   the owner green-lights cutover.

---

## 9. Combined risk assessment

| # | Risk | Likelihood/Impact | Mitigation (owner phase) |
|---|---|---|---|
| 1 | Parts coverage gaps discovered mid-theme | high / schedule | MC-first part ordering (P2+P3 cover MC's set); escalation protocol — stop widget, parts micro-phase, no local copies (§6.3). |
| 2 | No-inner-scroll vs tables/files — top C1 failure source | high / rework | By design: DataTable → KVList ladder below minWidth; allowlist EMPTY so FileBrowser/Artifacts FAIL loudly until G1; decide at G1 at the latest. |
| 3 | Density-probe misfires on legitimately sparse boards | med / noise | Generous union-bbox metric; `data-density-exempt` only for loading/error/empty; <40 px skip; owner G1 is the aesthetic authority. |
| 4 | SSR/hydration flakiness | med / bugs | Placement-from-data; desktop-initializer `useViewportColumns`; `data-ready` = post-hydration + placement commit; client-only chart mount; flakiness treated as bug, not noise. |
| 5 | Fixture hygiene (mutating real user projects) | low / severe | fixture.sh roots-only guard — suite aborts unless `roots.list` is fixture-only. |
| 6 | Parallel-wave collisions | low / rework | Zero shared-file edits by construction (glob registries, frozen routes, per-theme dirs); grep-enforced. |
| 7 | T2/T3 overrun (mission-control largest) | med / schedule | Split-dispatch rule (§6.5); validators run on partial boards. |
| 8 | Severity sweep drift (12 design files swept early, deleted late at K1) | med / regression | Legacy sentinel at every gate from D1 onward proves behavior-neutrality; sweep is mechanical + type-forced. |
| 9 | `no-scope` overturned at G1 → literal rename after T-waves | low / small | One mechanical rename phase at worst; flagged in G1 list. |
| 10 | Drag a11y/complexity overrun in `use-grid-drag` | med / rework | Hook is the isolated seam — swap internals for dnd-kit (KeyboardSensor) without touching widgets; needs an explicit catalog proposal then. |
| 11 | Pack-on-commit jumps widgets unexpectedly | med / UX | Deterministic reading-order re-pack; fallback policy "push down only" is packGrid-expressible; owner sees it at G1. |
| 12 | recharts SSR/definite-box | low / visual | Client-only mount; `--cell-h` gives definite boxes; floors documented + probe-checked; no compact renderer in mainline (owner-flip option §8.2). |
| 13 | Context re-render blast radius (page-level provider) | med / perf | Same as today's route-level state; memoized provider derivations; narrow widget selection; accepted. |
| 14 | Scope-div CSS contract fragility (future overflow/transform breaks fixed dialogs silently) | low / subtle bug | In-file contract comment + portal-scope + dialog-fixed-box probes on every wave. |
| 15 | DataTable v9 API drift | low / rework | Pinned to McTable's proven `tableFeatures` shape (already on v9). |
| 16 | Owner decisions arriving late (post-G1 exemptions forcing preset revision) | med / rework | All six decisions bundled AT G1 at the latest; empty-allowlist default fails loudly today rather than silently diverging. |
| 17 | Bundle growth from eager theme glob | low / perf | Accepted at scale (§8.3.1); revisit post-migration. |

---

## 10. Divergent views remaining

None structural. Every round-1 conflict is resolved in §7 with a binding ruling or four-seat
convergence. One specialist standing position is superseded by the rulings rather than conceded in
round: parts' refined plan still lists "recharts@3 + meadow-monotone compact SVG fallback" as its
chart reading — ruling 5 overrides it (settled #9 as written), and the option is preserved as the
§8.2 owner-flip. Data and migration both noted the registry-growth and SettingsProvider items as
"noted, not solved"; they are recorded in §8.3 with the same stance.

---

## 11. Success criteria

The migration is done when ALL of the following hold:

1. **Green gates everywhere:** `pnpm run check-types` and `pnpm run build` pass from the repo root
   at every phase boundary and on the final tree (after K1–K4 deletions).
2. **Six addresses, three viewports, all green:** `/app/{mission-control,bento,meadow}` and their
   `/project/$fixture` pages pass the full harness (no-inner-scroll with owner-approved allowlist,
   density ≥ 0.70 non-exempt, token completeness, portal scope, placement integrity, part-min at
   every rendered rung) at 3440×1440 / 1280×800 / 390×844 — including the `?bare=1` pass and the
   full keyboard-first interaction suite on the deterministic fixture.
3. **Greps clean:** all seven grep invariants (§3.8) — themes compose only; zero color literals
   outside declaration lines; one severity vocabulary (`critical|warning|info`, canonical tokens);
   zero `any`; validate-layout resolves every preset.
4. **DRY ledger:** the duplication this plan set out to kill is provably gone — scan-metrics,
   format, queries, contexts, and parts each have ONE implementation; C1's cross-theme commonality
   section shows N/3 themes importing common parts and 0 local implementations.
5. **Legacy discipline held:** through every wave, the legacy sentinel (design route + `/` + one
   dialog) stayed green; designs were functionally untouched except D1's severity sweep; deletions
   happened only after G1, per-theme-revertibly.
6. **Owner sign-off:** G1 completed — visual click-through accepted and all six decisions recorded
   (§8.1).
7. **Cleanup complete:** K1–K4 done (designs + swiss/ledger + gallery deleted, dead code swept,
   docs triaged); K5 disposition recorded (executed as its own mini-plan or explicitly deferred).

Final gatekeeping sequence (K4 exit):
```
pnpm run check-types && pnpm build
flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'
node scripts/widget-check/run.mjs --theme mission-control --page dashboard --base-url <url>   # + bento/meadow, project pages, --bare
node scripts/widget-check/legacy-sentinel.mjs --base-url <url>   # only while any legacy route remains (pre-K1)
```

---

*End of master plan. The owner reviews this document; execution dispatches begin at Stage 0
(D1 ∥ P1 ∥ W1∥W2 ∥ D3).*
