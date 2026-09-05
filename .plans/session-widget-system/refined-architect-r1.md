# Refined — ARCHITECT r1 (widget/part runtime)

Revised from draft-architect.md after cross-review. Structure: (1) changes with reasons,
(2) how I addressed every review point aimed at me (or why not), (3) convergence notes,
(4) the updated plan deltas, (5) remaining concerns. Unchanged foundations (size-class
ladder + resolution, `sizes={{…}}` object props, placement-not-measurement, container
queries, hand-rolled snapped canvas + `packGrid`, session-only persistence) carry forward
verbatim from the draft — peers endorsed all of them.

---

## 1. Changes from draft, with reasons

| # | Change | Reason / source |
|---|---|---|
| 1 | WidgetDef field renamed `contexts` → **`requires`** | Conceded to data (their §2.3); parts indifferent (their table defaulted to my name). One name, mine to give. |
| 2 | **Self-degradation precedence rule** added to §2: *authored size-class content wins within its declared rung; part self-degradation handles pixel variance WITHIN a rung* (cell density 84–104px, viewport width). The ladder is the author's tool; the container query is the part's. | parts concern 2 — accepted verbatim; it removes the "who wins" ambiguity in my three-layer min-content model. |
| 3 | `useWidgetSize()` scoped: ui-package primitives never consume it | parts concern 3 — correct purity consequence. ui parts self-degrade via container queries only; structural switches live in app-part wrappers or the widget's `sizes` ladder. Documented as a size-context contract rule. |
| 4 | `definePart` wrapper ownership clarified: ui primitives export `MIN_CONTENT` + plain components; **`widgets/parts/registry.ts` wraps each with `definePart`**, which stamps `data-part="<id>"`, `data-part-min-w/h` | parts concerns 4+6 — one source of truth for `min` (the ui export), app import never crosses into packages/ui. |
| 5 | `WidgetShell.tabs` renders parts' `WidgetTabs` internally — confirmed as the single tabs implementation | parts concern 5 — accepted; shell-level view switching and in-content tabs are one component, two placements. |
| 6 | **Registry becomes layered composition**: static core map (`widgets/registry.ts`) + `import.meta.glob("./themes/*/widgets/index.ts", { eager: true })` merged at load | migration concern 1 — accepted; a single static map would serialize their parallel theme waves (shared-file collision). Glob keeps zero shared-file edits per theme. |
| 7 | Placement data attributes added to the shell/grid-item contract: `data-widget`, `data-x/y/cols/rows`, `data-size` (resolved class), `data-drag-handle`, `data-resize-handle` — SSR-stable, not computed-style parsed | migration concern 6 — accepted (cost ~10 lines; makes probes and keyboard-first interaction scripts cheap). |
| 8 | `data-ready` semantics defined: stamped by `renderLayout` in a `useEffect` after hydration + placement commit — **not** gated on every query (report widgets legitimately render ReportGate skeletons) | migration concern 3/ask — accepted with the query-independence caveat; migration confirmed semantics work for them. |
| 9 | Drag controller: `setPointerCapture` best-effort with window-level move/up fallback; **keyboard path is the primary scripted test surface** | my review + migration flip to keyboard-first; synthetic `dispatchEvent` pointers can't drive implicit capture. |
| 10 | Flow generator seam: generators receive `WorkspaceContextValue` — `(ws) => WidgetNode[]`; `renderLayout` runs inside the provider stack; flows never call tRPC | data concern 3 — accepted; keeps "themes/flows don't fetch" greppable. |
| 11 | Report scope is derived from page context: `context: "workspace"` → `ReportProvider({kind:"scan", path: roots[0]?.path})`; `"project"` → `({kind:"repo", path})`; optional `PageLayout.report?: false` escape (default on) | data concern 2 — accepted; deterministic provider-stack builder. |
| 12 | ThemeScope mounted once per route by `renderLayout` (wrapping header + board); scope stamps both `data-ww-theme="<slug>"` (token selector) and `data-theme-scope` (probe marker) | my review + parts concern 5 + migration E2 — one mechanism, two attributes, zero cost. |
| 13 | Validation consolidated: my W4 invariants (placement integrity, min-content, no-inner-scroll, no horizontal overflow, direct-children) become probes in migration's **single** `scripts/widget-check/` harness; my widget-lab lives at dev-only `/app/__lab` and hosts the harness self-test panel | migration concerns 2/3 + parts concern 4 (both reviews converged on one harness) — three measurement stacks would have been two too many. |
| 14 | Routes: migration's `/app/$theme` (+ `project.$`) adopted; my `/themes/{slug}` sketch withdrawn | migration concern 2; data + I both prefer their URL-as-test-matrix shape. |
| 15 | Scroll exception stance: harness ships with an **empty** allowlist — `FileBrowser`/`ArtifactsPanel` widgets FAIL until the owner signs the `data-scroll="widget"` exception at G1; ideation → Sheet (chrome may scroll) adopted immediately | migration concern 4 — accepted; bends settled #2, so it is the owner's call, not ours. |
| 16 | Build-time context enforcement = **validate-layout script** in the check phase (import presets + registry, assert `requires ⊆ provider stack`) + data's runtime-throwing hooks; NOT a branded-type trick | my review of data §2.3; data's review endorsed my renderer assertion as the build-time layer. |
| 17 | `useConsoleKeys` owned by runtime (`widgets/runtime/use-console-keys.ts`), consuming `WorkspaceContext.filter` | data's ask (c) — accepted. |
| 18 | `no-scope` (not catalog's `no-root`) as the ReportStatus name | data + parts agree; owner-ratify in synthesized plan. |

## 2. Review points and how each was addressed

**Data's review of me** — all four concerns addressed: directory (they back my tree, §3),
report scope derivation (change 11), flow seam (change 10), scroll exception no-objection
(change 15). Their strengths section independently confirmed the §0 parse correction and
placement-not-measurement.

**Parts' review of me** — concerns 1–6 → changes 2–5, 12 (location: they back my
`widgets/parts/`), 4 (`definePart`), 6 (`data-part`). Nothing declined.

**Migration's review of me** — concerns 1–6 → changes 6, 14, 13, 15, (RRP removal in their
K3 with consumer grep — agreed), 7. Their A6 ask for readable attributes: accepted (change 7).

**My review asks of peers — status**: headerless parts confirmed (parts); ThemeScope
ownership accepted (parts + migration sequence P1 before M1); ReportGate converged on
parts' `mode` API + data's `quiet`/slots, children as plain ReactNode, `no-scope` null
(data's review §2.1 adopted it); migration adopted my `PageLayout` v1 as THE preset format
(their review E1) with field names `{widget, size, at?, props?, slots?}` — their
`{kind, placement}` wording withdrawn.

## 3. Convergence notes (settled across all four seats)

1. **Tree**: `apps/web/src/widgets/{runtime, contexts, parts, themes/<slug>/, lab/, registry.ts}`
   + pure-TS in `apps/web/src/lib/{grid-layout, scan-metrics, queries, format.ts}` +
   `packages/ui/src/components/` (presentational parts). Backed by me, parts, data (mild);
   migration's refined tree still shows `apps/web/src/parts/` — see §5.1.
2. **Routes**: `/app/$theme` + `/app/__lab` + parts preview; two dev-only routes total.
3. **Preset format**: my PageLayout v1, pure data + registered widget ids; size-class
   variants live in widget components as `sizes` maps; nearest-defined fallback per settled #6.
4. **One harness** `scripts/widget-check/`; one tabs implementation; one theme scope
   mechanism (`[data-ww-theme]` attribute).
5. **Severity**: canonical at api emission, no runtime mapper; token rename inside data's D1;
   migration's manifest updated to `--sev-critical|--sev-warning|--sev-info`.
6. **Canvas**: no new dependency (hand-rolled snap + `packGrid`), keyboard-first testing,
   RRP gone from new pages (drop the panel-resize interaction row).
7. **Owner sign-off list** (migration keeps it): `sizes={{…}}` syntax; scroll exception +
   ideation→Sheet; default theme slug; K5 cutover scope; catalog banner.

## 4. Updated plan deltas (on top of draft-architect.md)

### 4.1 WidgetShell / grid-item contract additions
```tsx
// rendered root of every placed widget:
<div data-widget="<id>" data-x data-y data-cols data-rows data-size="<resolved class>"
     data-drag-handle|data-resize-handle on the affordances>  // handles omitted when interactive={false}
// board root: data-ready stamped post-hydration + placement commit
// ThemeScope root: data-ww-theme="<slug>" + data-theme-scope
```

### 4.2 Registry (layered)
```ts
// widgets/registry.ts
const core: Record<string, WidgetDef> = { /* common widgets, static imports */ };
const themes = import.meta.glob("./themes/*/widgets/index.ts", { eager: true }); // Record<string, { default: Record<string, WidgetDef> }>
export const widgetRegistry: ReadonlyMap<string, WidgetDef> = mergeValidated(core, themes);
// mergeValidated: throws on duplicate ids; shapes validated by WidgetDef satisfies
```
Theme waves add kinds by creating their own `themes/<slug>/widgets/index.ts` — zero shared-file edits.

### 4.3 PageLayout v1 (final)
```ts
interface PageLayout {
  version: 1;
  context: "workspace" | "project";   // → provider stack: Workspace(+scan Report) | Project(nests Workspace, repo Report)
  report?: false;                     // omit reports entirely (default: on)
  columns: { desktop: number; tablet: number; phone: number };
  cell: { h: number };
  regions: RegionNode[];              // stack | flow, as drafted
}
// flows: Record<string, (ws: WorkspaceContextValue) => WidgetNode[]>
```

### 4.4 Phases (updated files/deps only; budgets unchanged, each ≤15 files/~500 lines)
- **W1 Runtime contracts** (unchanged files; adds precedence rule + `useWidgetSize` purity
  note + tabs-via-WidgetTabs): `widgets/runtime/{size-class,layout-types,widget-shell,part}.ts(x)`.
- **W2 Packing** (flows seam now takes `WorkspaceContextValue`): `lib/grid-layout/{pack-grid,score-projects}.ts`,
  mosaic shim, `widgets/runtime/flows.ts`.
- **W3 Grid canvas + interaction** (adds data attributes, data-ready, capture-fallback,
  keyboard-first): `widgets/runtime/{grid-canvas,use-grid-drag,grid-session}.ts(x)`.
- **W4 Registry + renderer + lab** (glob registry; renders ThemeScope; `/app/__lab` dev route;
  validate-layout script; invariants contributed as `scripts/widget-check/` probes):
  `widgets/{registry.ts, runtime/render-layout.tsx, lab/}`, one route file, one probe file.
  Now depends on parts **P1** (ThemeScope) — aligned with migration's M1-depends-on-P1 edge.
  W4 publishes the renderer interface stub early so migration's M3 walking skeleton can start
  against W1–W3 + stub.

## 5. Remaining concerns / open conflicts

1. **Parts location, 3-vs-1**: migration's refined canonical tree still places app parts at
   `apps/web/src/parts/`; me, parts, and data (mildly) hold `apps/web/src/widgets/parts/`
   (one namespace, greps stay `widgets/**`, barrel consumed by widget kinds in the same tree).
   Content is identical either way; the synthesizer must pick one path and show it in every
   section. My position stands.
2. **ProjectProvider nesting WorkspaceProvider — unanswered.** My review asked data to nest
   so dashboard widgets compose on project pages (mb hero-tile precedent); data's review did
   not respond. Without it, project presets can only use project/report widgets — a real
   authoring restriction nobody has endorsed. Carried as a requirement on data's r2 or a
   synthesizer decision.
3. **Density probe interplay**: migration's ≥0.70 union-bbox check is theirs, but it imposes
   a runtime duty — shells must stretch content (`flex-1 min-h-0`) and empty states must be
   `data-density-exempt`-honest. Noted in W1's shell contract; watch for misfires at C1.
4. **Registry glob + tree-shaking**: eager glob of theme widget kinds means a page imports
   all themes' kinds. Acceptable at this scale; noted, not solved (same stance as draft §10.4).
5. **Owner items unchanged**: `sizes={{…}}` syntax sign-off; scroll exception at G1
   (empty allowlist until then — expect FileBrowser/Artifacts FAILs as designed); default
   theme; K5 scope.
