# PARTS specialist — cross-review (round 1)

Reviews of draft-architect.md, draft-data.md, draft-migration.md from the parts seat.
Verdicts are explicit; conflicts are named; amendments I will make to my own draft are listed
in §4 (I am reviewing myself where peers caught gaps).

---

## 1. ARCHITECT (draft-architect.md)

### Strengths
1. **The `sizes={{…}}` parse correction (§0)** is the single most valuable catch of the round —
   verified against tsc, adaptation preserves the owner's resolution semantics exactly. I build
   my per-rung fallback table against it unchanged.
2. **Three-layer min-content negotiation (§2)** — authored floor (clamp) / px floors (advisory +
   validated) / part self-degradation (graceful) — is the right model, and it correctly explains
   WHY both the ladder and container queries must exist (width changes without class changes,
   catalog §6.3.4). I concede my draft's "parts don't self-swap" rule was too absolute (see
   concern 2).
3. **Container queries as the load-bearing in-box responsiveness** — right call; viewport media
   queries inside widget cells are meaningless. Adopted into part conventions.
4. **packGrid/scoreProjects split** keeps the proven skyline packer while removing recency
   coupling — exactly the seam the catalog asked for; flows pass score as weight.
5. Keyboard a11y (§4.2) specified as part of the phase, and the keyboard path doubles as the
   DOM-script test surface — smart for no-vision execution.

### Actionable concerns
1. **Parts location conflict (BLOCKER for me to finalize file paths).** Your §6 puts parts at
   `apps/web/src/widgets/parts/`; migration's §2.2 puts them at
   `apps/web/src/components/widgets/parts/`; my draft had `apps/web/src/parts/` + packages/ui. I
   don't care which app-side path wins, but ONE must, and it must be decided in refine. My
   position: **yours (`apps/web/src/widgets/parts/`)** — the parts barrel is consumed by widget
   kinds, runtime types, and theme presets, all of which live in that tree; a second
   `components/widgets/` root duplicates the namespace. Migration must move `contexts/` and
   `themes/` accordingly (data's contexts at `apps/web/src/lib/contexts/` also collides with
   migration's `components/widgets/contexts/` — same fight, flag to both).
2. **Self-degradation precedence needs one sentence of spec.** If an author deliberately puts
   `Donut` in a `1x1` slot AND the theme's cell density makes 1x1 < 110px, who wins — authored
   content or part self-degradation? Proposed rule: **authored size-class content wins within its
   declared rung; self-degradation handles pixel variance WITHIN a rung** (cell density 84–104px,
   panel resize, viewport width). I.e. parts degrade when their box shrinks, never when the
   author chose a small rung with eyes open — the ladder is the author's tool, the container
   query is the part's. Please adopt into §2.
3. **`useWidgetSize()` crosses my ui/app line.** WidgetSizeContext is app-runtime state; my
   presentational primitives in `packages/ui` cannot consume it (purity rule: no app imports,
   no context except ThemePortal). Resolution: ui-package parts self-degrade via **container
   queries only** (CSS — works anywhere); structural switches that genuinely need the size
   context happen in (a) app-layer part wrappers or (b) the widget's `sizes` ladder. If you need
   `useWidgetSize` inside a ui primitive, that's a signal the switch belongs in the ladder.
4. **`definePart` ownership.** Fine that runtime ships `PartDef`/`definePart`, but ui-package
   primitives (Chart, Donut, Stat…) can't wrap themselves in it (app import). My layering: ui
   primitives stay plain components exporting `MIN_CONTENT`; the app parts registry
   (`widgets/parts/registry.ts`) wraps each with `definePart({ id, min, component })`. One
   source of truth for `min` = the ui export; registry never restates px values.
5. **`WidgetShell.tabs` vs my `WidgetTabs`** — compatible (shell's tabs slot renders WidgetTabs
   internally; parts use WidgetTabs for tabs INSIDE content). Confirm that's your intent so
   there's exactly one tabs implementation.
6. Minor: `part.ts` PartDef lacks the `data-part` id convention migration's probes key on —
   fold `id` into the rendered root attribute inside definePart's wrapper (see review-migration
   concern 3).

### Conflicts with my draft
- Self-swap rule (my §0.6 vs your §2 mechanism 3): **I concede with the precedence amendment**
  (concern 2). Chart keeps its internal renderer flip either way.
- Parts location: resolved in my favor of YOUR tree (concern 1) — migration disagrees; needs
  refine-round decision.

---

## 2. DATA (draft-data.md)

### Strengths
1. **Expose-not-copy contexts over react-query + the one-hook-per-procedure queries module** is
   the correct dedupe primitive — it makes my parts' "context is the only data path" rule
   enforceable by grep.
2. **Severity at packages/api emission** is stronger than my token-only rename and I support it:
   with canonical on the wire, my `Led`/`Chip`/`SegBar` tone tables key one union and the four
   client-side hand-maps die. You correctly flagged `--sev-*` CSS rename as the parts seam.
3. **scan-metrics file layout (§5) covers every derivation my parts consume** — `pulseCells`,
   `fleetVitals`, `stackDistribution`, `dirtyLeaders`, `aggregateCadence`, `alertTally`,
   `languageRows`, `healthSummary`, `isHot`. Your reconciliation notes (two activity concepts
   named apart; fills belong to parts) match my conventions exactly.
4. ReportContext state machine with priority order (mb's, kept verbatim) + retained `exportData`
  during `running` + two staleness rules owned once — resolves catalog B2/B4 cleanly.
5. Throwing context hooks (§2.3): I agree — silent nulls hid wiring mistakes all prototype year.

### Actionable concerns
1. **`ReportGate` children contract (REAL CONFLICT, my domain).** Your §3.4 specifies
   `children?: (state: {stale, view}) => ReactNode`. I propose **plain `children: ReactNode`**:
   per the settled context model, hosted parts read `useReport()` themselves, so nothing needs
   the render-prop; a plain node is strictly more composable (parts hosting parts, carousel
   cards, authored presets referencing kinds). If a parent wants staleness-aware content it
   composes its own part that calls `useReport()`. I ADOPT your `quiet`, your override slots
   (`missing`/`running`/`loading`), and your null-for-no-scope behavior; I keep my `mode:
   "gate" | "banner" | "line"` densities on top. Also: your status `"no-scope"` vs catalog §3.5's
   `"no-root"` — I prefer `no-scope` (scope is the right word); owner-ratify in the synthesized
   plan since context.md sketched `no-root`.
2. **`statusOf` gap.** My `Led` needs `{tone: critical|warning|info|live|nominal, label}` — your
   scan-metrics stops at `worstSeverity` + `isHot`. Since tone naming (live/nominal) is
   part vocabulary, I will own the tiny composer `ledOf(project, now)` in the app parts layer
   over your two primitives — unless you'd rather host it in scan-metrics as `ledState` (also
   fine, pick one home in refine; I default to mine so your module stays presentation-free).
3. **`ReportView` as THE normalizer (§3.5)** — I consume `view` for cadence/alerts/languages
   feeds. One ask: expose the already-aggregated series in the shape my `Chart`/`HBars`/
   `Donut` props want (`{label, value}[]`, slices) so parts don't each re-map `view` —
   i.e. `view.cadence: CadencePoint[]`, `view.alertTally.rows` with `label/count`, and a
   `languageRows` companion. Your §5 already builds these in scan-metrics/report.ts; just
   confirm `ReportView` carries (or parts import) the row shapes directly.
4. **BranchSwitcher / GitActionsToolbar** are in the catalog's git family (§1.4, shared today
   with mutation-slice props) but in NO ONE's inventory — my miss, claiming them in refine as
   app parts (`widgets/parts/git/`) reading `useProject().git`, with your compat prop path
   during migration. Confirm the provider's `git` surface is the final prop source.
5. Minor: `FleetVitals` drops mb's `unshared` — fine (aheadSum/behindSum carry it); my
   VitalsBand wrapper maps cells from your field names.

### Conflicts with my draft
- ReportGate render-prop vs ReactNode (concern 1): I hold my position; both work, mine is
  simpler and matches the no-props-drilling rule. Decide in refine.
- Everything else: aligned (severity, metrics ownership, format helpers).

---

## 3. MIGRATION (draft-migration.md)

### Strengths
1. **`/app/$theme` URL-as-test-matrix** — six scriptable addresses, zero theme-switch UI, routes
   frozen after M1 so parallel waves never collide. Right structure.
2. **The bare pass (`?bare=1`)** turns the owner's "every part works without custom classes"
   from an assertion into a test. This directly serves my token-only contract.
3. **Escalation protocol for missing parts** (§8.3) — themes never hold local copies, not even
   temporarily. This is the correct enforcement of the DRY goal; I will honor it by sizing my
   waves against your MC-first request.
4. Verify-then-delete ordering, per-theme revertible commits, fixture hygiene (never mutate real
   projects), and keeping the catalog with a superseded banner — all sound.

### Actionable concerns
1. **Parts location** — see architect concern 1. Your `components/widgets/parts/` vs architect's
   `widgets/parts/`: pick one in refine; I recommend architect's tree. Your §5.3 invariant
   paths (`widgets/themes/**`, `widgets/parts/**`) then read against the winner.
2. **Color-literal invariant vs my fallback literals (CONFLICT, resolving in your favor).** My
   draft specified `var(--token, oklch-fallback)` everywhere so parts render in any theme. Your
   grep invariant #2 (no color literals in parts, only `var(--*)`) is better DRY: base
   `globals.css` already defines the full semantic set (verified), so fallbacks are redundant
   belt-and-braces. **I concede: parts use bare `var(--*)`; the required-token manifest +
   token-completeness probe carries the safety net.** Two amendments on your side:
   (a) your manifest (§4.1) still lists `--sev-error|--sev-warn` — must be the canonical
   `--sev-critical|--sev-warning|--sev-info` names post-data-D1, else the probe enshrines the
   dead vocabulary; (b) extend invariant #2's scope to `packages/ui/src/components/` for the new
   part files (chart/donut/stat/led/…) — they live outside `widgets/` by my ui/app split and
   otherwise escape the grep.
3. **`data-part="<id>"` + `data-sort-key` conventions**: accepted, added to my part conventions
   (part roots stamp `data-part`; DataTable rows stamp `data-sort-key={row.id}`). One ask:
   make `data-part-min-w/h` optional in the manifest — my parts export `MIN_CONTENT` through the
   registry; the definePart wrapper stamps the attributes, so probes read them off the DOM
   either way.
4. **Harness consolidation.** My P5 (parts-preview route + measure script) overlaps your M2
   harness and architect's W4 widget-lab. Proposal: keep the parts-preview DEV route (part-level
   render at ladder boxes is useful before the registry exists), but **move its assertions into
   your harness** as `scripts/widget-check/probes/part-min.mjs` (box ≥ declared min, no
   horizontal overflow) instead of a second measurement script. One harness, three probes'
   worth of checks. Your `run.mjs --out` contract is fine for both.
5. **Scope selector naming (small, but must be one mechanism).** Your tokens.css declares under
   `.theme-<slug>`; my ThemeScope renders `data-ww-theme={slug}` (attribute) so tokens select
   via `[data-ww-theme="x"]` and portals inherit by landing inside the scope element. Your
   no-inner-scroll probe walks `[data-theme-scope]`; portal-scope reads computed `--background`.
   Reconcile: **ThemeScope stamps both** `data-ww-theme={slug}` (token selector) and
   `data-theme-scope` (probe marker); your tokens.css spec changes the selector from
   `.theme-<slug>` to `[data-ww-theme="<slug>"]`. Identical machinery, one spelling.
6. **Your §5.4 "resizable panels" row conflicts with architect §4** (RRP drops out of new pages
   entirely; panel stages become wider widgets). Not my call — but the interaction matrix must
   drop or keep the row in sync with architect's decision, or C1 fails a control that doesn't
   exist. Flag to both.
7. **Wave-1 parts request ordering**: my P-phases cover your MC-first list if sequenced
   P1(theme infra) → P2+P3 parallel (charts | readouts+table+git) → P4 (context parts incl.
   ReportGate). ReportGate — your M3 walking skeleton candidate — is P4 because it needs data's
   contexts; for M3 use `Stat`/`Led` (P3, context-free). Note this dependency to your M3.

### Conflicts with my draft
- Color-literal fallbacks (concern 2): conceded to your invariant.
- Parts location (concern 1): open, architect's tree proposed.
- Harness duplication (concern 4): consolidation proposed.

---

## 4. Amendments I will make to draft-parts.md in refine (self-review)

1. Move app parts to the agreed tree (pending the location decision; default
   `apps/web/src/widgets/parts/`) and keep the ui-package split with the purity rule restated
   (container queries only, no app context, no definePart inside packages/ui).
2. Drop `var(--token, literal)` fallbacks; rely on base-theme token completeness + migration's
   token-completeness probe (update §2.3).
3. Add conventions: `data-part` roots, `data-sort-key` rows, fill-box root sizing
   (`h-full w-full min-h-0` — also serves the density probe ≥0.70), no viewport media queries
   (container queries only), self-degradation precedence rule (architect concern 2).
4. Add git interactive parts: `BranchSwitcher`, `GitActionsToolbar` as app parts over
   `useProject().git` (catalog §1.4 — previously missed).
5. Rework `ReportGate` per data's contract: adopt `quiet` + override slots + `no-scope`;
   children stays `ReactNode` (position held); keep `mode` densities.
6. Add `ledOf(project, now)` composer in app parts (or defer home to data — refine decision).
7. Parts registry (`widgets/parts/registry.ts`) wrapping ui primitives via `definePart`;
   `MIN_CONTENT` lives only in the ui export.
8. Re-order phases for migration's MC-first request; fold measure script into
   `scripts/widget-check/probes/part-min.mjs`; keep parts-preview as dev route.

## 5. Conflicts observed between peers (from the parts seat)

| # | Conflict | Parties | My recommendation |
|---|---|---|---|
| 1 | Parts/contexts/themes tree: `apps/web/src/widgets/` vs `apps/web/src/components/widgets/` vs `lib/contexts/` | architect vs migration vs data | architect's `apps/web/src/widgets/` tree wins; contexts at `widgets/contexts/` (data's shapes unchanged, only path) |
| 2 | Staging routes: `/app/$theme` vs `/themes/{slug}` | migration vs architect | migration's `/app/$theme` (URL-as-test-matrix); architect already defers |
| 3 | react-resizable-panels: removed from new pages vs interaction-matrix row asserts panel handles | architect vs migration | resolve before C1; whichever loses, delete the matrix row |
| 4 | `requires` vs `contexts` field name on WidgetDef; `no-root` vs `no-scope` status name | data vs architect; data vs catalog sketch | `contexts` (architect) since data's §2.3 already says "the contract from my side"; `no-scope` (data) |
| 5 | Preset content: pure data vs JSX | migration vs nobody (architect agrees via flow generators + kinds) | pure data + registered kinds (both peers actually aligned; call it settled) |
