# Draft — ARCHITECT (widget/part runtime)

Domain: the Widget/Part component contracts, the grid canvas (snapped drag/resize), the
declarative layout format, the widget registry, directory structure, and the SSR/hydration
story. Interfaces to peers: **data** owns the four context providers; **parts** owns part
components; **migration** owns routes, theme CSS, and deletion of the design routes.

---

## 0. Spec correction the owner must see (verified, not opinion)

`<Widget 2x2={…} 1x1={…}>` is a **TypeScript/JSX parse error**. JSX attribute names cannot
start with a digit — I verified against the repo's own tsc: both `<Widget 2x2={…} />` and
`<A 2={…} />` fail with `TS1003: Identifier expected`. Quoted string attributes are also
illegal in JSX. So the verbatim owner syntax cannot ship in type-checked code.

**Proposed adaptation — same data model, legal syntax:**

```tsx
<WidgetShell sizes={{ "3x3": <HeroBody />, "2x2": <ChartBody />, "1x1": <LedBody /> }}>
```

`sizes` is a plain object keyed by size-class strings; resolution semantics (nearest-defined
down the ladder, never an error) are exactly the owner's. `children` remains the
size-independent fallback of last resort. This is the one deliberate deviation from the
verbatim spec in my plan and it needs owner sign-off via the synthesized plan.

---

## 1. Size classes — vocabulary, ranking, resolution

Canonical ladder (settled decision 6): `1x1 < 2x1 < 2x2 < 2x3 < 3x3`. These double as the
mosaic tier names (hero/feature/large/medium/compact map to 3x3/2x3/2x2/2x1/1x1) — one
vocabulary, per catalog §6.3.1.

```ts
// apps/web/src/widgets/runtime/size-class.ts
export type SizeClass = `${number}x${number}`;   // template-literal type: parseable, typed
export const SIZE_LADDER: readonly SizeClass[] = ["1x1", "2x1", "2x2", "2x3", "3x3"];
export function parseSize(size: SizeClass): { cols: number; rows: number };
export function rankOf(size: SizeClass): number;   // cols*rows*100 + rows → total order
   // 1x1=101, 2x1=201, 2x2=402, 2x3=603, 3x3=903; custom classes (e.g. "1x2"=202,
   // "3x2"=502) slot in deterministically: area first, taller wins ties.
/** Largest defined class whose rank ≤ current; if current is smaller than everything
 *  defined, the smallest defined class. Never throws, never undefined. */
export function resolveSizeClass(defined: readonly SizeClass[], current: SizeClass): SizeClass;
```

Resolution example: widget defines `{"2x2", "1x1"}` → at 3x3 renders the 2x2 content, at 2x1
renders the 1x1 content, at 2x2 renders 2x2. Orientation flips (meadow's horizontal medium)
are just what the author puts in the `2x1` entry — the mechanism doesn't care.

**Where the current size comes from: the placement, not measurement.** A grid-placed widget
knows its cells (`${cols}x${rows}`) from the layout data — zero ResizeObservers, zero
hydration risk, deterministic SSR. Pixel-level responsiveness *within* a size class (panels
narrowing without a class change, viewport resize) is handled by CSS **container queries**
(Tailwind v4 native `@container`): `WidgetShell` sets `container-type: inline-size` (plus a
`@container (min-height: …)` variant on the content box, which has definite px height from
the grid row unit) and parts use `@container` variants instead of viewport media queries.
Container queries are the load-bearing choice: widgets live in arbitrary-width grid cells,
so viewport breakpoints are meaningless inside them. This matches catalog §6.3.4.

## 2. Widget contract

Two layers, because layout data must reference widgets by id while content variants are
authored in code:

1. **`WidgetShell`** — the chrome + size machinery every widget renders (one shell to cover
   the four existing shell shapes per catalog §2.3).
2. **Registered widget components** — e.g. `ProjectTileWidget`, hosting parts (or authored
   child widgets), rendering `WidgetShell` inside.

```tsx
// apps/web/src/widgets/runtime/widget-shell.tsx
export interface WidgetShellProps {
  title?: ReactNode;                 // mono-caps eyebrow (MC) / label (mb) / icon chip (meadow)
  meta?: ReactNode;                  // right-aligned header slot
  action?: ReactNode;                // header action slot
  tabs?: { id: string; label: string }[];   // WidgetTabs part renders under/near title
  activeTab?: string; onTabChange?: (id: string) => void;
  sizes?: Partial<Record<SizeClass, ReactNode>>;  // §0 — the breakpoint content props
  children?: ReactNode;              // size-independent fallback
  chrome?: string;                   // theme chrome class override (default from theme)
  tone?: "critical" | "warning" | "info" | "neutral";  // canonical severity (decision 8)
}
```

- Placement context (`GridItemContext`: `{ cols, rows, sizeClass, interactive }`) is provided
  by the canvas — `WidgetShell` reads it, resolves `sizes`, and publishes
  `WidgetSizeContext` (`useWidgetSize() → { cols, rows, sizeClass }`) for parts that need a
  *structural* switch CSS can't express (donut→segbar, tabs hiding below compact).
- When used **outside** the grid (composite slots, dialogs, lab route), the parent passes
  `size={{ cols: 3, rows: 3 }}` explicitly — deterministic, SSR-safe, no measurement.
- **Nested widgets** (authored composite slots): the composite widget renders child widget
  components in a fixed internal layout (flex/grid authored in the composite's JSX). Child
  `WidgetShell`s render with `interactive={false}` — no drag/resize handles (decision 3).
  Nesting depth is known at author time; there is no runtime recursion of grids.

### Min-content negotiation (three concentric mechanisms)

1. **Authored floor (authoritative for clamping).** A widget's min size class = its smallest
   *defined* `sizes` key (if you wrote 1x1 content, 1x1 is legal), overridable via registry
   `min`. The canvas clamps drag/resize to it; auto-packing filters the ladder to entries ≥
   the floor.
2. **Part px floors (advisory + validated).** Parts declare `min: { w, h }` in px (catalog
   §6.3 table: donut ≥110, recharts area ≥112 h, table ≥420 w, …). Cells are theme-density
   dependent (row unit 84–104px, col ≈ container/12), so px floors cannot clamp at runtime —
   they are (a) documented per part, (b) rendered as `data-part-min-w/h` attributes, and
   (c) asserted by the DOM-measurement validation script (§9) — the no-vision verify loop.
3. **Part self-degradation (graceful).** Below its floor a part switches presentation by
   container query / `useWidgetSize()` (donut→SegBar, recharts→SVG spark, table→KV list).
   The size-class ladder is the widget-level switch; container queries are the part-level
   one. Both must exist because width changes without class changes (catalog §6.3.4).

## 3. Part contract (interface only — parts peer implements)

```tsx
// apps/web/src/widgets/runtime/part.ts
export interface PartDef<P> {
  id: string;                        // "donut" | "cadence-chart" | "report-gate" | …
  min?: { w: number; h: number };    // px floor → docs + data-attrs + validation script
  component: ComponentType<P>;
}
export function definePart<P>(def: PartDef<P>): PartDef<P>;
```

Rules parts follow (the "common naming contract", aligned with catalog §3.5 — data peer owns
the provider side): parts read scope data from context hooks (`useWorkspace()`,
`useProject()`, `useReport()`, `useSettings()`) or accept the same values as explicit props
(both — composite widgets and the widget-lab pass props; context is the default path so
there is no props drilling). Parts never read route state, never position themselves, and
consume the canonical `critical|warning|info` severity. Parts are layout-agnostic: they fill
their box (`h-full w-full min-h-0`) and let the widget's definite grid box size them — this
is what makes recharts `ResponsiveContainer` work without magic.

## 4. The grid canvas — decision and honest evaluation

**Decision: hand-rolled snapped drag/resize on CSS Grid, powered by a generalized version of
the existing skyline packer. No new dependency.** The drag controller is isolated in one
hook so dnd-kit can replace it later without touching widgets.

| Option | Drag | Resize | React 19 | SSR | motion-layout | Fit with our model | Cost |
|---|---|---|---|---|---|---|---|
| **dnd-kit** | strong (PointerSensor + KeyboardSensor a11y) | **not covered** — custom code either way | fine | fine | ok (overlay transform; snap = custom modifier) | snapping/compaction still custom — it solves the sorting problem we don't have | new dep (catalog entry), and we'd still write all resize + collision logic |
| **react-grid-layout** | yes | yes | risk — findDOMNode legacy; 1.5.x claims React 19 support but the model is absolute-positioning | width-measured client-side, layout pops in | **conflicts** — absolute positions, not grid children (breaks catalog §6.3.5) | owns its own layout model; we already have a packer + declarative presets + per-theme ladders | new dep + fighting its CSS |
| **react-resizable-panels** | 1-D splitters only — wrong shape for a 2-D cell canvas | 1-D only | fine | fine | n/a | no 2-D placement at all | none — and it **drops out** of the new pages entirely (see below) |
| **hand-rolled + `packGrid()`** | pointer capture + cell math (~150 lines) | same mechanics, shared (~80 lines) | guaranteed (plain React) | placements are inline `gridColumn/gridRow` from serializable data — **server-rendered pixel-identical** | exactly the proven bento/meadow pattern (direct grid children, motion `layout`) | exact — packer exists in-repo, deterministic, pure TS | no dep; we own ~300 lines |

Why this is honest, not NIH: the genuinely hard parts of a grid canvas are (a) deterministic
packing/compaction — already solved by `computeMosaicLayout`'s skyline (pure, tested,
deterministic by contract) — and (b) collision policy — a policy choice, not a library
feature. What a dnd lib would buy (free-form sortable DnD, collision detection for
arbitrary geometry) is precisely what grid snapping *removes*. Resize is unsupported by
dnd-kit and RRP, so custom code is unavoidable in every option. Keyboard a11y — dnd-kit's
real selling point — is ~60 lines here (§4.2). `pnpm-workspace.yaml` catalog convention
says new deps need explicit proposal; none clears the bar.

**`react-resizable-panels` post-migration:** the new pages have no 1-D panel splits (MC/meadow
panel stages become just wider widgets on the grid). RRP stays installed only while the old
design routes live; migration peer removes it from `apps/web/package.json` at deletion time.

### 4.1 Canvas mechanics

```tsx
// apps/web/src/widgets/runtime/grid-canvas.tsx  (renders regions of placed widgets)
// grid container:
//   grid-template-columns: repeat(var(--grid-cols), minmax(0, 1fr));
//   grid-auto-rows: var(--cell-h);           // px row unit from theme → definite heights
//   gap: var(--grid-gap);
// each widget (direct child, no wrapper — keeps motion layout working):
//   style={{ gridColumn: `${x+1} / span ${cols}`, gridRow: `${y+1} / span ${rows}` }}
```

- Drag handle = the shell header (`data-widget-handle`) at top level only. Pointer down →
  `setPointerCapture`; delta → cells via `Math.round(dx / cellW)`; a **ghost outline** at the
  snapped target during drag (no live repack — deterministic and cheap); on pointer-up,
  commit.
- Resize: E / S edges + SE corner handles (`role="separator"`-style affordances), same snap
  math, clamped to the widget's floor.
- **Collision/compaction policy (the decision that keeps this small):** on commit, the moved
  widget is pinned at its new anchor and every *other* widget in the region is re-packed by
  `packGrid()` in authored/reading order. Overlaps never accumulate; gaps close. Authored
  `at` anchors are shadowed for the session after the first user drag (manual mode wins
  until reload). This reuses the fill-the-line skyline rather than inventing push/spread
  heuristics.
- **Session-only persistence** (decision 4): placements live in a module-scope store keyed by
  page id (the exact precedent: MC column sizing + panel layouts survive navigation, reset
  on reload). No store.json writes; the data model is serializable so persistence bolts on.

### 4.2 Keyboard + a11y (part of the phase, not a nicety)

Handles are focusable with `aria-label` ("Move Fleet table widget" / "Resize …");
arrow keys move/resize by one cell with live commit; Escape reverts to session-start
placement; `aria-live="polite"` announces final placement ("Fleet table, column 4, row 2,
3 by 2"). The keyboard path doubles as the DOM-script test surface (dispatch keydown at a
handle, assert `style.gridColumn` changed) since pointer-event simulation is flakier.

### 4.3 What `computeMosaicLayout` remains for — the `packGrid` generalization

`apps/web/src/lib/mosaic-layout/index.ts` splits into two concerns, moved to
`apps/web/src/lib/grid-layout/`:

- **`packGrid(items, { columns, fixed? })`** — the skyline packer + reading order,
  item-agnostic: input `{ id, cols, rows, pinned?, at? }` (recency scoring removed);
  `fixed` placements are honored and the rest pack around/below them. Used by: flow
  regions (auto layout), compaction after drag/resize commit, and narrow-mode stacking.
- **`scoreProjects(projects, { now })`** — the log-scale recency score + tier blend, kept
  verbatim for the *project-tile flow* (tile sizes still derive from recency, per the
  catalog's "widget weight instead of recency tier" seam: the flow passes score in as
  `weight`).
- `mosaic-layout/index.ts` becomes a thin re-export so the old design routes keep compiling
  until migration deletes them (flagged to migration peer).

### 4.4 Responsive grid (columns per breakpoint, narrow stack)

Theme preset supplies `columns: { desktop: 12, tablet: 8, phone: 2 }` and per-breakpoint
ladders (meadow precedent 12/8/2 with a shrunk phone ladder; mb 12/6/1). On breakpoint
change: flow regions re-pack at the new width; authored placements clamp (a 3x3 widget on a
2-col phone grid becomes full-width, stacked in reading order — the bento <768px pattern).
Breakpoint detection is one centralized `useViewportColumns` hook (§8 SSR notes).

## 5. Declarative layout format (versioned, serializable)

```ts
// apps/web/src/widgets/runtime/layout-types.ts
export interface WidgetNode {
  id: string;                        // stable instance id, kebab-case ("fleet-table", "tile-<path>")
  widget: string;                    // registry key ("fleet-table" | "project-tile" | …)
  size: SizeClass;                   // authored size class
  at?: { x: number; y: number };     // anchor in the region grid; omit → flow (packed)
  props?: Record<string, JsonValue>; // widget inputs (e.g. { "variant": "triage" })
  slots?: Record<string, WidgetNode[]>; // authored composite children (decision 3)
}
export type RegionNode =
  | { kind: "stack"; id: string; widgets: WidgetNode[] }        // authored, packed top-to-bottom
  | { kind: "flow"; id: string; from: string;                    // flow registry key ("projects")
      template: { widget: string; ladders?: Record<string, SizeClass[]> } };
export interface PageLayout {
  version: 1;                        // persistence-compatible from day one (decision 4)
  context: "workspace" | "project";  // which provider stack the page mounts
  columns: { desktop: number; tablet: number; phone: number };
  cell: { h: number };               // px row unit (bento 96 / meadow 104 / mb 96 today)
  regions: RegionNode[];
}
```

Design points:

- **Static vs generated instances.** Themes art-direct most of the page (`stack` regions
  with authored `at`/`size`); dynamic sets (one tile per scanned project) come from `flow`
  regions. Flow *generators* are code (registry of `from` key → `(data) => WidgetNode[]`,
  built on `scoreProjects`), because binding `props: { path: <each project> }` can't be
  expressed as static JSON. **What stays serializable is the output**: a resolved page is a
  flat `WidgetNode[]` with concrete placements — the exact artifact a future persistence
  layer would save and restore. Versioned `version: 1` from day one.
- Themes are TS modules (typed, checked at `check-types` time) whose *shape* is
  JSON-serializable by construction — no zod needed now; a schema bolts on when persistence
  needs to read layouts back from disk.

### 5.1 Widget registry

```ts
// apps/web/src/widgets/registry.ts
export interface WidgetDef {
  id: string;
  title: string;                                  // human label (a11y, compliance report)
  component: ComponentType<RegisteredWidgetProps>; // receives { node, size } from renderer
  contexts: readonly ContextKey[];                // ["workspace"] | ["project"] | … (decision 7 keys)
  defaultSize: SizeClass; min?: SizeClass;        // floor; default = smallest sizes key
  hosts?: readonly string[];                      // part ids — docs + compliance agent input
}
export const widgetRegistry: ReadonlyMap<string, WidgetDef>;
```

Static import map (tree-shakeable, no runtime registration side effects). `contexts` powers
a dev-time assertion in the renderer (page context vs widget requirements) and the
compliance validator; `min` clamps interaction; `hosts` feeds the end-of-migration
compliance agent. `ContextKey = "workspace" | "project" | "report" | "settings"` — the
hook signatures live with the data peer's providers; I only define the key union and the
assertion seam.

## 6. Directory structure

```
apps/web/src/widgets/                     # the system — no design names anywhere
  runtime/
    size-class.ts             # ladder, rank, parse, resolve (§1)
    layout-types.ts           # PageLayout/WidgetNode/RegionNode v1 (§5)
    widget-shell.tsx          # WidgetShell + WidgetSizeContext + useWidgetSize (§2)
    part.ts                   # definePart + PartDef (§3)
    grid-canvas.tsx           # CSS grid container + region rendering + drag/resize wiring (§4)
    use-grid-drag.ts          # isolated pointer/keyboard snap controller (dnd-kit-swappable)
    grid-session.ts           # module-scope session placement store (§4.1)
    render-layout.tsx         # PageLayout → regions → placements → widget tree (§5)
    flows.ts                  # flow registry seam: "projects" → scoreProjects → nodes
  registry.ts                 # id → WidgetDef map (§5.1)
  parts/                      # part components (PARTS peer; runtime only ships definePart)
  themes/                     # per-theme: preset.ts (PageLayout data) + theme.css tokens
    mission-control/ bento/ meadow/
  lab/                        # widget-lab route components (§9 validation surface)
apps/web/src/lib/grid-layout/             # packGrid + scoreProjects (§4.3)
apps/web/src/routes/themes/               # staging routes (MIGRATION peer owns; see below)
```

Route shape is migration's call; my requirement is only that routes stay **thin wrappers**:
route → provider stack (data peer) → `renderLayout(pagePreset)` → `GridCanvas`. I propose
staging at `/themes/{mission-control,bento,meadow}` (index + `project.$`) mirroring the
designs routes, promoted to `/` + `/projects/$path` after the compliance gate. Theme
consumption: a theme contributes (a) `theme.css` token scope (§7 catalog seam — base
shadcn tokens + semantic part tokens `--sev-*`, `--chart-1..6`, `--recency-*`, chrome
tokens), (b) `preset.ts` PageLayout data, (c) optionally `chrome` classes per widget node
via `props.chrome`. Every part/widget renders correctly with **zero** custom classes
(decision: custom classes are additive skins, never load-bearing).

## 7. SSR / hydration story

- **Placements are data.** Authored presets + flow output compute to inline
  `gridColumn/gridRow` server-side; first client render is identical. No measurement before
  hydration.
- **Breakpoints:** one `useViewportColumns` hook: `useState(desktop)` (not
  `window.matchMedia` in the initializer!) + `useEffect` sync via matchMedia listeners.
  Current designs' pattern (`useState(() => window.matchMedia…)` in MC's route) can mismatch
  on mobile clients during hydration; the centralized version renders desktop first paint
  everywhere and reflows once post-mount — deterministic, warning-free. Narrow re-pack
  happens in the same effect.
- **motion:** `motion/react` `layout` on widget shells with `initial={false}` so only
  placement *changes* animate (bento/meadow/mb precedent). The drag ghost is a client-only
  element rendered solely while a drag is active — no SSR footprint.
- **recharts:** `ResponsiveContainer` renders empty on the server and measures on the
  client; because grid rows are px-definite (`--cell-h`), charts always get a definite box —
  the documented min-size floors (catalog §6.3) hold by construction, and micro classes fall
  back to SVG/numeral parts (decision 9).
- **scrollbar-gutter:** nothing sets it today (verified — zero hits in `apps/web/src`).
  Since the page scrolls as one body, add `html { scrollbar-gutter: stable; }` in the new
  pages' base CSS so navigating between short and long pages never shifts the 12-col grid.
- **No inner scroll:** the canvas never scrolls; widget boxes are definite-sized (cells).
  ⚠ Open contract decision — see §10.1.

## 8. Phases (my domain; each ≤ ~15 files / ~500 lines)

### W1 — Runtime contracts (Sequential; no peer deps)
Files: `widgets/runtime/{size-class.ts, layout-types.ts, widget-shell.tsx, part.ts}`.
- `WidgetShell` with `sizes` resolution, header/meta/action/tabs slots, WidgetSizeContext,
  container-query root; `definePart`.
- Validation: `pnpm run check-types` + `pnpm build` clean; `resolveSizeClass` ladder cases
  documented in-file (single source of truth) and exercised by the lab route in W4.

### W2 — Packing generalization (Parallel with W1; independent of peers)
Files: `lib/grid-layout/{pack-grid.ts, score-projects.ts}`, `mosaic-layout/index.ts` →
re-export shim; `widgets/runtime/flows.ts` (flow seam + "projects" generator on
`scoreProjects`).
- Validation: check-types + build; determinism contract carried over (pure TS, `now`
  injected); existing design routes still compile against the shim (check-types covers).

### W3 — Grid canvas + interaction (Sequential; depends W1+W2)
Files: `widgets/runtime/{grid-canvas.tsx, use-grid-drag.ts, grid-session.ts}`.
- Snapped drag/resize (pointer + keyboard), ghost preview, commit→`packGrid` compaction,
  session store, floors clamped from registry.
- Validation: check-types + build; interaction verified in W4's lab via keyboard-event DOM
  script (§4.2) — focus handle, arrow keys, assert `gridColumn/gridRow` changes and floors
  respected.

### W4 — Registry, renderer, widget-lab (Sequential; depends W1–W3 + parts peer's first parts)
Files: `widgets/registry.ts`, `widgets/runtime/render-layout.tsx`, `widgets/lab/*`
(+ route file under `routes/themes/` — coordinate with migration to avoid collision).
- `renderLayout(preset)` → regions → placements (authored `at` | `packGrid`) → registry
  components in `GridCanvas`; dev-mode context assertion.
- **Widget-lab** route: renders every registry widget at every ladder class on a 12-col
  canvas — the no-vision validation surface (see §9) and later the compliance agent's
  harness. Stays after migration as a dev tool.
- Validation: check-types + build; boot via the established
  `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`
  loop; DOM script asserts §9 invariants on the lab.

Theme preset authoring (mission-control/bento/meadow PageLayouts) and part population run
as parallel phases on top of W1–W4 — owned by parts/migration peers with my contracts.

## 9. Validation invariants (no-vision, DOM-measurement)

Implemented as a small measurement script (added during W4, run in the verify loop against
the lab + real theme routes):
1. Every widget box ≥ its registry floor in cells (`gridColumn/gridRow` spans parse back).
2. Every `data-part-min-w/h` element's `getBoundingClientRect()` ≥ declared floor, at every
   ladder size the lab renders.
3. No element inside a widget with computed `overflow: auto|scroll` except whitelisted
   `data-scroll="widget"` parts (§10.1); the canvas itself has `overflow: visible` and only
   the document scrolls.
4. No horizontal document overflow at 3 viewport widths (375/900/1600).
5. Grid children count === widget count (no wrapper divs — motion-layout invariant).

## 10. Open contract decisions (flagged for peers/owner)

1. **No-inner-scroll vs the three browsers.** FileBrowser (70vh tree today), ArtifactsPanel,
   IdeationPanel are unbounded user content — they cannot clamp via carousel/tabs the way
   stat/chart widgets can. Proposal: they become widgets with a sanctioned
   `data-scroll="widget"` exception (definite cell-sized box, internal scroll allowed,
   whitelist-validated), **or** they relocate to Sheets/dialogs (chrome may scroll — it
   isn't a widget). My recommendation: exception flag for files/artifacts (browsing is a
   primary in-dashboard activity), Sheet for ideation (already a long-form surface). Needs
   parts peer + owner alignment — this is the one place the "never scroll internally" rule
   bends or breaks.
2. **Owner sign-off on `sizes={{…}}` syntax** (§0).
3. **Cell height is theme data** (`cell.h` 92–104px observed range) — affects px-floor math
   in per-theme presets; parts peer should document floors against the 96px default.
4. **Registry growth:** static map means every page imports every registered widget's
   module. Fine at ~30 widgets (code-splitting by route can come later); noted, not solved.

## 11. Risks / alternatives

- **Drag a11y/complexity overrun** → swap `use-grid-drag` internals for dnd-kit
  (KeyboardSensor) — the hook is the seam; canvas/widgets unaffected. dnd-kit would need a
  catalog entry + proposal at that point.
- **Pack-on-commit jumps widgets unexpectedly** → policy is deterministic (reading order
  preserved); if it feels wrong in dogfooding, the fallback policy is "push down only"
  (moved widget wins anchor, others shift by minimal delta) — still `packGrid`-expressible.
- **Composite slots could sprawl** → constrained: authored in JSX, no runtime nested grids,
   depth 2 max (widget → slot widgets). The lab renders composites at fixed sizes to keep
   them honest.
- **Flow generators are code, layouts are data** — deliberate split (§5); if peers prefer
  fully-static layouts, flow templates need a JSON binding mini-language — rejected now as
  over-engineering for one flow ("projects").
- **`packGrid` refactor risk** — mitigated by keeping `scoreProjects` logic byte-equal to
  today's scoring and the re-export shim for old routes until deletion.
