# Review — migration specialist on peers' drafts (round 1)

Per peer: strengths, actionable concerns, conflicts — with emphasis on everything that
creates, reorders, or constrains MIGRATION work (routes, sequencing, theme deliverables,
harness, cleanup). Positions I state here are the ones I will bake into
`refined-migration-r1.md`.

---

## A. Architect (draft-architect.md)

### Strengths
- The `sizes={{…}}` correction (§0) is exactly the kind of verified honesty this session
  needs; I endorse the adaptation and will carry it as an owner-sign-off item in the
  synthesized plan.
- Placement-from-data (not measurement) + container queries kills the ResizeObserver class
  of hydration bugs — this also makes my DOM probes deterministic (placement attributes are
  readable without waiting for layout thrash).
- Keyboard a11y path as the *primary* DOM test surface (§4.2) is better than my pointer-drag
  plan; I'll flip my interaction suite to keyboard-first.
- W4's widget-lab is a genuinely good no-vision validation surface; I want it as the host for
  my harness self-test instead of a second route (below).

### Actionable concerns
1. **Widget registry is a shared-file collision risk for my parallel theme waves.** Your
   `widgets/registry.ts` is a static import map; my theme waves will each add theme-scoped
   widget kinds (nav-rail widget, context-panel widgets…). Three agents editing one map
   concurrently breaks the parallelism that made the prototype phase work. Proposal: layered
   composition — a static core map for common widgets + `import.meta.glob("./themes/*/widgets/index.ts")`
   merged at module load (same trick as my preset registry). If you keep the static map, I
   must serialize registry edits and that measurably slows wave 2/3.
2. **Route shape**: you propose `/themes/{slug}` but explicitly defer to me — decision:
   **`/app/$theme`** stands. Rationale: post-cutover this is the product surface, not a
   theme gallery; `/themes/<slug>` reads as preview demos forever. `/app` also leaves room
   for `/app/settings`-style siblings later. This is now settled unless the owner overrides.
3. **Lab route consolidation**: your W4 lab, parts' P5 preview route, data's D5 "temporary
   test route", and my M2 self-test route are four dev surfaces. Proposal: TWO dev-only
   routes, both under `/app/__lab` (yours: widgets at ladder sizes, hosting my broken-fixture
   self-test panel) and parts' preview (parts at ladder boxes, hosting data's provider-mount
   panel). Both stay post-migration as dev tools (documented in my K4), both behind
   `import.meta.env.DEV` component guards.
4. **`data-scroll="widget"` exception (§10.1)** — I agree with your analysis (files/artifacts
   can't clamp; ideation belongs in a Sheet, "chrome may scroll — it isn't a widget"), but
   this bends settled #2 and is therefore an OWNER decision, not ours. My harness ships with
   the allowlist EMPTY and `FileBrowser`/`ArtifactsPanel` widgets FAILING until the owner
   signs the exception at G1 (or earlier if the synthesizer asks). I adopt your chrome rule
   immediately though: dialog/sheet portal content is exempt from the no-inner-scroll probe —
   it's chrome, not canvas.
5. **`react-resizable-panels` removal** lands in my cleanup (K3) — confirmed, with a
   consumer grep first (production settings/other routes may still use it; I won't remove a
   dep with live consumers).
6. **`data-widget` / placement attributes / `data-ready` conventions**: your draft stamps
   `data-widget-handle` and placement via inline styles. My probes need readable placement —
   please stamp `data-x/y/cols/rows/size` attributes as authored in my draft (or give me the
   computed-style parse contract, but attributes are cheaper and SSR-stable).

### Conflicts
- None structural beyond the registry question (1) and the route naming (2, resolved by your
  own deferral). Your §6 tree (`widgets/`, `lib/grid-layout/`) is compatible with my theme
  namespace; I'll publish the merged canonical tree in my refined plan.

---

## B. Data (draft-data.md)

### Strengths
- Contexts as thin typed views over the react-query cache with one canonical hook per
  procedure is the right dedupe story, and `scopes-not-keys` for reports closes the key-drift
  hole for good.
- ReportContext state machine with retained `exportData` during `running` matches what
  bento proved; owning both staleness rules (scope + per-entry) resolves catalog B2/B4 which
  my report interaction script needs as ground truth.
- D-phase table is honest about files and gates — easy to schedule against.

### Actionable concerns
1. **D8 deletes design-local metrics files while designs still live.** Deleting
   `components/designs/*/metrics*`, `meadow/report-data.ts`, `mb/report-utils.ts`,
   `bento/bento-metrics.ts` breaks `/designs/*` compilation unless you also rewire every
   design import to the shared modules — effort spent on dying code, and more "untouched"
   surface violated. My position: **defer all design-file deletions to my K1** (they die with
   the routes). D8's scope becomes: new page shells mount providers + `CommitHistoryCell`
   switch + delete the D5 temp route. No design rewiring, no design deletions before K1.
2. **D1 severity sweep will touch the 12 design files** — I accept this as unavoidable
   (the type change breaks `=== "error"` comparisons, so intermediate commits are only green
   if swept). To keep my "old routes run untouched" promise honest, the sweep must be
   verified behavior-neutral: my harness gets a cheap **legacy sentinel** — one legacy design
   route + production `/` render + one dialog opens — run at every wave gate from D1 onward.
3. **SettingsProvider at `__root.tsx`** (§2.1): wrapping the root layout puts new machinery
   on every legacy route while they're supposed to be untouched. My position: mount
   SettingsProvider inside the `/app` tree only (my M1 route layout), promote to root at K5
   cutover. One `settings.get` query is then `/app`-scoped until cutover — acceptable.
4. **Context hook names** (`useWorkspace/useProject/useReport/useSettings`) are now the
   canonical vocabulary — my grep invariants will use exactly these plus your context value
   keys as the anti-props-drilling signature list.
5. Your D5 temp route folds into the parts preview panel (see A3) — D5's validation stays
   yours; the host route isn't yours to create/delete.

### Conflicts
- **D1-vs-K1 sequencing** (concern 1): resolved as "sweep literals in D1 (mechanical,
  type-forced), defer deletions to K1". Flagging because your D8 as written contradicts it.
- **SettingsProvider placement** (concern 3): needs your agreement or a joint note to the
  synthesizer; default in my plan = `/app`-scoped until cutover.

---

## C. Parts (draft-parts.md)

### Strengths
- Two-layer library (ui presentational / app context-consuming) with a mechanical rule is
  exactly the enforceable boundary my theme greps need.
- ThemeScope portal infrastructure kills all four portal hacks at once — and it makes my
  portal-scope probe trivial (computed `--background` inside dialog content vs scope).
- MIN_CONTENT as exported constants feeding the ladder AND the measurement script is the
  single source of truth my density/min-size checks can read programmatically.

### Actionable concerns
1. **Two measurement stacks.** Your P5 `scripts/measure-parts.mjs` overlaps my M2
   `scripts/widget-check/` (token resolution, overflow, min-content, dialog fixed-box).
   Proposal: one harness — probes live in `scripts/widget-check/probes/` (mine, M2);
   your P5 wires them to the parts-preview route via `run.mjs --suite parts`; my C1 runs the
   same probes against theme routes. No duplicated probe logic, one output format.
2. **Form dialogs as ONE token-styled set** — I accept without pushback: all four theme
  dialog containers were structurally identical flows; if a theme genuinely needs structural
  dialog variance later, that's a new part proposal, not a theme file. This shrinks my theme
  deliverable definition (themes do NOT ship dialog containers).
3. **ThemeScope adoption ordering**: my M1 routes should mount `ThemeScope` from day one —
   so M1 now depends on your P1 (theme-scope.tsx + portal patches). P1 has no peer deps and
   is small; it becomes the first parts wave in my dependency spine. Flag so the
   synthesizer sequences P1 before M1 (or M1 lands with a temporary plain div scope that P1
   swaps — I'd rather just sequence P1 first).
4. **Portal patches touch shared ui components used by legacy routes** ("no behavior change
   until a theme opts in"). The legacy sentinel (B2) covers this: after P1, one legacy
   dialog-open assertion must still pass before anything else rides on it.
5. **Token rename `--sev-error|warn` → `--sev-critical|warning`**: agreed, and it must be
   scheduled INSIDE D1 (data's sweep) not as a separate drift — one rename commit, not two.
   I'll reflect that in the merged phase list.
6. **`docs/research/parts-reference.md` (generated)**: fine — my K4 triage will keep it (it's
   the living reference) alongside the banner'd catalog. It does not replace the catalog's
   historical provenance, so no deletion conflict.

### Conflicts
- **Measurement-stack merge** (concern 1): needs your explicit ack; if you prefer keeping
  `measure-parts.mjs` standalone, we'll have two scripts asserting overlapping invariants
  with different formats — my compliance agent would then have to reconcile two outputs. I
  think that's strictly worse; please converge.
- None else — your theme-adoption sequencing ("per-theme opt-in belongs to migration")
  matches my T-waves as drafted.

---

## D. Cross-cutting decisions I'm recording for the synthesizer

1. **Routes**: `/app/$theme` (+`/project/$`), `/app` → redirect to default theme. Settled
   here (architect deferred; data/parts indifferent).
2. **Canonical tree** (merging all four plans; my refined plan publishes it verbatim):
   `apps/web/src/widgets/{runtime,themes,lab,registry.ts}`, `apps/web/src/parts/`,
   `apps/web/src/lib/{contexts,queries,scan-metrics,grid-layout}/`,
   `packages/ui/src/components/` (ui parts) — with theme agents writing ONLY
   `widgets/themes/<slug>/`.
3. **Dev surfaces**: exactly two dev-only routes (widget-lab `/app/__lab`, parts preview),
   hosting data's provider panel and my probe self-test panel.
4. **"Designs untouched" reinterpreted precisely**: untouched *functionally*; the only
   pre-K1 edits to `components/designs/**` are (a) D1's mechanical severity literal sweep
   and (b) nothing else. All deletions in K1/K2. Legacy sentinel assertion guards this at
   every wave gate.
5. **Owner sign-off items accumulated** (I keep this list for the synthesized plan):
   `sizes={{…}}` syntax (A); FileBrowser/ArtifactsPanel scroll exception + ideation-to-Sheet
   (A4); default theme slug; catalog keep-with-banner; K5 cutover scope.
6. **One harness** (`scripts/widget-check/`) serves parts-preview, wave validators, and the
   C1 compliance agent (pending parts' ack, C-concern 1).

## E. What I'm changing in my refined plan because of this review

- Adopt architect's `PageLayout` v1 as THE preset format (replaces my looser §4 wording);
  theme deliverable = preset.ts (PageLayout data) + theme tokens under `[data-ww-theme]` +
  optional custom.css + theme widget kinds via glob-composed registry (pending A1).
- Keyboard-first interaction suite; drop the RRP separator script for new pages (RRP is
  gone from them); keep a legacy sentinel script instead.
- M1 depends on parts P1 (ThemeScope); M2 harness probes become the shared measurement
  library; wave gates gain the legacy sentinel.
- K-series: add RRP consumer-grep + dep removal, add `mosaic-layout` shim deletion check,
   defer data's design-metrics deletions into K1, add parts-reference.md to the keep list.
- G1 owner gate now explicitly carries the scroll-exception decision and the default-theme
  pick, not just visual sign-off.
