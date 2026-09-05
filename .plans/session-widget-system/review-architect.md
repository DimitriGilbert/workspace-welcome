# Review — ARCHITECT (of peer drafts, round 1)

I reviewed all three drafts against my runtime plan (draft-architect.md). Format per draft:
strengths → specific actionable concerns → alignment/conflicts with my plan. I also answer
every ask each peer made of the architect explicitly.

---

## 1. draft-data.md (contexts, queries, scan-metrics, format, severity)

### Strengths
- "Expose-not-copy" providers over react-query with one canonical hook per procedure is the
  right dedupe primitive; §2.4's query-key convention module kills the key-drift class of bug.
- ReportContext state machine (§3) resolves catalog B2/B4 (staleness ownership, two rules)
  with a precise priority order — exactly the runtime contract `<ReportGate>` needs.
- Severity at the api emission boundary with a verified migration surface (in-memory cache
  only, no persisted vocabulary) is better than a client adapter; I support it.
- Phases are concrete, greppable, and sized within budget.

### Actionable concerns
1. **Project pages can't host workspace widgets.** §2.1 mounts `WorkspaceProvider` on
   dashboards only; `ProjectProvider` fetches scan via the shared hook but does not *provide*
   Workspace context. Yet the mb project page precedent (catalog §2.2: InstrumentTile
   re-rendered as hero) and my layout format (`context: "project"` pages) assume dashboard
   widgets compose on project pages. Ask: **`ProjectProvider` nests `WorkspaceProvider`**
   (cheap — same cache, memoized derivations already exist), or project presets are
   restricted to project+report widgets. My plan needs the nesting; please add it.
2. **"Build-time branded type" enforcement (§2.3) won't work for data-driven layouts.** The
   registry is a runtime `ReadonlyMap`; preset data referencing widget ids can't be
   type-checked against a page's provider stack without generating types per preset. Replace
   with: (a) runtime throw (your layer 2 — keep, I align with throwing over NullState), plus
   (b) a **validate-layout script** run in the check phase (import presets + registry,
   assert `requires ⊆ page context stack`) — this can also live in migration's grep-invariant
   #7 harness. I'll own (b) in my W4.
3. **ReportGate contract is defined twice.** Your §3.4 (render-prop children + missing/
   running/loading slots) vs parts' §1.5 (`entry?/mode: gate|banner|line`, children as
   ReactNode). They're reconcilable: parts owns the component; the machine is yours. My
   requested convergence: parts' `mode` API + your slot-overrides as optional props, and the
   `entry` variant must consume your `isEntryStale(path)` + `entry(path)`. Flag to parts too.
4. **`useReport()` throwing when unmounted** vs widgets like per-project tiles reading a
   *scan* report's `byPath` — confirm the dashboard always mounts a scan-scope ReportProvider
   (roots[0]) even when missing, so `status: "no-scope"` is the only null case. Your §2.1
   says dashboard mounts it with `path: roots[0]?.path` — good; make the no-roots first-run
   render `no-scope` explicitly in the machine (it does). OK — no change needed, just
   confirming this reading.
5. Minor: `WorkspaceContextValue.scan` exposes the raw `UseQueryResult` — fine, but please
   also export the derived `ScanState` union type from your module so widget meta
   (`requires`) and my lab can reference it without re-deriving.

### Alignment / conflicts with my plan
- **Aligned**: page-scope → provider-stack mapping (my `PageLayout.context` field ↔ your
  §2.1); `requires: ContextKey[]` on widget definitions — **I adopt your field name**
  `requires` over my `contexts` (clearer intent); filter state in WorkspaceContext; `now`
  clock rule; `dataUpdatedAt`-stable SSR value.
- **Conflict (naming only, must converge)**: directory. You place contexts in
  `apps/web/src/lib/contexts/`; migration places them in
  `apps/web/src/components/widgets/contexts/`. My position in §4 below.
- Your ask (c) `useConsoleKeys`: **accepted, I own it** — `widgets/runtime/use-console-keys.ts`
  consuming your `WorkspaceContext.filter` (keys: `/` focus, 1–N views, Escape).

---

## 2. draft-parts.md (common parts, ThemeScope, motion, min-content)

### Strengths
- Two-layer ui/app split with a mechanical rule (no api/context imports in packages/ui) is
  exactly right and matches my registry `hosts` metadata.
- One recharts engine + engine-less SVG geometry primitives is the correct reading of
  settled #9 (donut-on-recharts buys nothing — the catalog agrees).
- ThemeScope portal-host mechanism is the best answer to the catalog §4.3 portal mess; the
  "scope div must not create a containing block" CSS contract is the load-bearing insight.
- Every part carries `ariaLabel`, `MIN_CONTENT`, and a below-min fallback — this gives my
  compliance/validation story its data source.

### Actionable concerns
1. **`MIN_CONTENT` as a runtime drag/resize clamp (§2.5) — I push back, precisely.** A
   widget's minimum *is* its smallest defined `sizes` key (you can't resize a widget into a
   class it has no content for — the ladder IS the fallback mechanism, settled #6). Part px
   floors vary per size-class *variant* (the 1x1 variant deliberately swaps to Led/Stat with
   tiny floors), so importing `MIN_CONTENT` into the grid would clamp against parts that
   aren't rendered at that size. Correct split: **registry `min` (authored cell floor) is the
   runtime clamp; `MIN_CONTENT` feeds authoring guidance + the lab/compliance measurement
   gate** (my draft §9 invariant 2: rendered box ≥ declared floor at every ladder size, per
   theme cell density). If a theme's cell density makes a part floor unsatisfiable at its
   authored class, that's a finding, not a runtime behavior.
2. **Chart's internal flip needs a stated mechanism.** "Internal flip at 200×160" — say
   whether it's a ResizeObserver in `chart.tsx` (fine; it's your one sanctioned exception)
   and confirm the flip threshold is px-of-own-box, independent of my widget size class.
   Two independent responsiveness channels (widget ladder for structure, part box for
   renderer) must be documented as such or widget authors will assume the ladder handles it.
3. **ThemeScope ownership and placement**: you propose the architect's page/grid renders it.
   **Accepted** — `renderLayout()` mounts one `ThemeScope` per route, wrapping header + board.
   One constraint from my side: the scope div must also not interfere with the grid canvas —
   my canvas is a direct child with `container-type` roots per widget; no overflow/transform
   on the scope (your rule 3 already covers this). Also the drag ghost portals into the scope
   host — i.e. the same portal-host context my canvas uses; keep `useThemePortal()` exported.
4. **Scope selector naming conflict with migration**: your `[data-ww-theme="x"]` attribute vs
   migration's `.theme-<slug>` class. Functionally identical; converge on ONE. My vote:
   **yours** (attribute doubles as the machine-readable theme key for probes; class name
   squatting invites `.{theme}` specificity games that produced `.mc.mc`). Migration only
   writes selectors accordingly — zero cost to them.
5. **Shell tabs vs WidgetTabs**: my `WidgetShell` has a `tabs` prop (widget-level view
   switching, header-adjacent — MC's ReportZone pattern) while your `WidgetTabs` is
   in-content tabs. Both exist today; keeping both is fine but must be documented as
   distinct (widget chrome vs part) or themes will use them interchangeably. I'll document
   in the shell; no change needed from you.
6. **Validation tooling overlap**: your P5 (`routes/parts-preview.tsx` + `scripts/measure-parts.mjs`)
   vs my W4 widget-lab vs migration's `scripts/widget-check/` harness. Three measurement
   stacks is two too many. Proposal: **one dev surface + one harness** — my lab route renders
   every part at every ladder box AND every widget at every class; migration's harness gains
   a `min-content` probe (your assertions) targeting it. Your P5 shrinks to authoring the
   probe + the parts-reference doc. Flag to migration as well.

### Alignment / conflicts with my plan
- **Aligned**: parts headerless (your ask (a): confirmed — shell owns title/meta/action);
  context consumption per catalog §3.5 naming; motion conventions ("parts animate content
  only, placement belongs to the shell" is exactly my §8 motion note); app-parts location
  merges into my `widgets/parts/` proposal (§4 below — same content, one tree).
- **Conflict**: app parts at `apps/web/src/parts/` vs one-tree convergence (§4). Your
  barrel-as-only-import-surface rule survives regardless of prefix.

---

## 3. draft-migration.md (routes, waves, compliance harness, cleanup)

### Strengths
- `$theme` URL segment with glob registry: zero shared-file edits during parallel waves and a
  scriptable test matrix — strictly better than my `/themes/…` staging sketch. **I adopt your
  route shape**; my W4 route files move under `routes/app/$theme/` and stay frozen after M1.
- The harness spec (probes with exact semantics, grep invariants, fixture hygiene that
  refuses to touch real roots, self-test route proving the probes) is the strongest part of
  any draft this round; it operationalizes the no-vision constraint.
- Pure-data presets with content referenced by kind+props — fully aligned with my layout
  format (your open question is answered: my runtime needs NO JSX in presets; size-class
  variants live in widget *components* keyed by registry id).
- Escalation protocol (themes never hold local part copies) correctly implements the owner's
  DRY rule.

### Actionable concerns
1. **Directory: `components/widgets/` — I propose `apps/web/src/widgets/` instead** (§4
   below). The parallel-safety invariants you grep (`widgets/themes/**` etc.) work identically.
2. **Drag via synthetic pointer events**: my controller uses `setPointerCapture`, which can
   throw for synthetic `pointerId`s in `dispatchEvent`-driven scripts. I'll make capture
   best-effort with window-level move/up fallback so your interaction scripts work — noted as
   a runtime requirement in my refine. Your scripts should also drive the **keyboard path**
   (focus handle + arrows), which is deterministic and doubles as the a11y test.
3. **`data-ready` semantics underspecified**: "queries resolved and first paint done" — for
   SSR'd pages the first paint IS server HTML. Propose: board stamps `data-ready` in a
   `useEffect` after (a) hydration and (b) placement commit (layout computed + applied). For
   pages whose widgets gate on report queries, `data-ready` waits only for *placement*, not
   every query (report widgets render ReportGate skeletons — that's their correct state, and
   your report interaction script polls `[data-report-status]` anyway). Otherwise a missing
   report would block every probe. I'll own the stamp; confirm the semantics work for you.
4. **no-inner-scroll allowlist vs my §10.1**: your "closed allowlist, anything else is a code
   fix" is the right default, but FileBrowser/ArtifactsPanel/IdeationPanel are unbounded
   user content and WILL need entries. My proposal: the part renders `data-scroll="widget"`
   on its scroll box; the harness config allowlists exactly which part ids may carry it
   (three entries, each with justification); the probe fails any OTHER scroller and fails an
   allowlisted part that scrolls *outside* its declared box. This keeps settled #2's spirit
   (page is the only scroller; exemptions are named, bounded, and measured). Needs your + the
   owner's sign-off; alternative remains relocating them to Sheets.
5. **Wave-1 before parts complete** (T1 tokens+empty board after M3): fine, but T1 needs my
   `renderLayout` + `GridCanvas` stable, which is W1–W4. Your dependency spine says A1 →
   M3 → T1; make A1 explicitly "architect W1–W4 complete" (or split: M3 needs W1–W3 + a stub
   renderer; T1 needs W4). I'll provide W4's renderer interface early so M3 can stub it.
6. Minor: preset schema field naming — you use `{kind, placement, props}`; my `WidgetNode`
   uses `{widget, size, at?, props?, slots?}`. Converge on mine (it's the typed contract the
   renderer consumes; `kind` → `widget`, `placement` → `size` + `at`). Cosmetic but the
   master plan must show one schema.

### Alignment / conflicts with my plan
- **Aligned**: runtime attribute asks (`data-widget`, `data-x/y/cols/rows`, `data-size`,
  `data-drag-handle`, `data-resize-handle`) — **all accepted**, they cost nothing and make my
  keyboard/DOM-script validation story real; `?bare=1` (matches my "custom classes are
  additive skins, never load-bearing"); dnd proposal lands in A1 (my answer: no library —
  hand-rolled + packer; your pointer-events requirement is satisfied, see concern 2).
- **Conflict**: components/widgets path (§4); tokens.css scope selector (`.theme-<slug>` vs
  parts' `[data-ww-theme]` — I side with parts, concern 4 above); three measurement stacks →
  one harness (parts concern 6).

---

## 4. The one structural convergence item (for everyone)

Four drafts, three tree layouts. My proposal — **one system tree + pure-TS stays in lib**:

```
apps/web/src/widgets/            # THE new system (React): grep-able namespace for all invariants
  runtime/                       # mine: size-class, widget-shell, grid-canvas, drag, renderer, lab
  contexts/                      # data's four providers (moved from lib/contexts — same content)
  parts/                         # parts' app-layer parts (moved from apps/web/src/parts — same content)
  themes/<slug>/                 # migration's theme dirs (preset.ts, tokens.css, custom.css, widgets/)
  registry.ts                    # mine: id → WidgetDef { requires, min, hosts, … } (data's field name)
apps/web/src/lib/                # pure TS + data infra only (no React components): queries/,
  scan-metrics/, grid-layout/ (packGrid successor to mosaic-layout), format.ts, forms/
packages/ui/src/components/      # parts' presentational parts (unchanged from parts draft)
```

Rationale: (a) migration's greps and parallel-safety contract need ONE namespace — this
preserves them verbatim; (b) lib stays pure-TS/data (data's scan-metrics/queries/format
placement is correct — those are not components); contexts are React providers consumed by
page shells AND parts, and they exist only for this system, so they belong in the system
tree; (c) `widgets/` top-level (peer of `lib/` and `components/`) rather than
`components/widgets/` because `components/` already hosts design-era + long-lived shared
components (file-browser, artifacts) and would blur "new system" vs "shared legacy".

I hold this position unless data feels strongly that contexts must stay in `lib/` — the
technical content is identical either way; the synthesizer should just pick ONE and the
master plan must show the same tree in all four sections.

## 5. Summary of conflicts for the refine round

| # | Topic | Positions | My vote |
|---|---|---|---|
| 1 | Directory tree | me: `widgets/` system tree; data: `lib/contexts`; parts: `src/parts/`; migration: `components/widgets/` | §4 unified tree |
| 2 | Theme scope selector | parts `[data-ww-theme]` vs migration `.theme-<slug>` | parts (attribute) |
| 3 | MIN_CONTENT at runtime | parts: grid imports for clamps | me: authored registry `min` clamps; MIN_CONTENT validates |
| 4 | ReportGate API | data render-prop+slots vs parts mode-based | parts' mode API + data's slots as optional props |
| 5 | Workspace widgets on project pages | data: not provided | me: ProjectProvider nests WorkspaceProvider |
| 6 | Validation tooling | three stacks (mine, parts P5, migration harness) | one harness + one lab route |
| 7 | no-inner-scroll exemptions | migration: closed allowlist | me: named part-level `data-scroll="widget"` exemptions (3 parts) — owner call |
| 8 | Build-time context enforcement | data: branded type | me: validate-layout script + runtime throw |
