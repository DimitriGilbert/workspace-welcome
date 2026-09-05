# DATA specialist — cross-review (round 1)

Reviews of draft-architect.md, draft-parts.md, draft-migration.md from the data/context
perspective. Verdicts first, then per-peer detail. My draft: draft-data.md.

---

## 1. draft-architect.md

**Verdict: strong agree on everything that touches my domain; one three-way directory/route
conflict to settle (with migration); two small seams to specify jointly.**

### Strengths
- **§0 spec correction is real and load-bearing.** I independently agree `<Widget 2x2=…>` is a
  TS1003 parse error; the `sizes={{ "3x3": … }}` object preserves the owner's data model
  exactly. Good catch, verified, must be surfaced to the owner.
- **Placement-derived size classes (no ResizeObserver) + container queries** — this is the
  same philosophy my contexts use (data-driven, deterministic, SSR-safe). No measurement
  anywhere in the stack means no hydration races between my `now` clock and your boxes.
- **`WidgetDef.contexts: readonly ContextKey[]` + dev-time renderer assertion** (§5.1) is
  exactly the build-time layer my draft §2.3 asked for. `ContextKey = "workspace" |
  "project" | "report" | "settings"` matches settled #7 verbatim. Aligned.
- **Routes as thin wrappers: route → provider stack → renderLayout → GridCanvas** (§6) —
  precisely my mounting topology (providers are page-shell structure, never per-widget).
- `packGrid`/`scoreProjects` split with `scoreProjects` kept byte-equal + re-export shim for
  old routes — correct de-risking.

### Actionable concerns
1. **Directory & staging-route conflict with migration (blocking for file paths).**
   Architect: `apps/web/src/widgets/{runtime,parts,themes,lab}` + staging at
   `/themes/{slug}`. Migration: `apps/web/src/components/widgets/{runtime,contexts,parts,
   themes}` + staging at `/app/$theme`. Three consumers (my contexts, parts' app parts,
   migration's greps) key on these paths. My outputs relocate mechanically either way, but
   the master plan cannot ship both. I mildly prefer **architect's `apps/web/src/widgets/`**
   (top-level namespace = "the system", cleaner greps for migration's invariants than a
   `components/` subtree shared with legacy components) **with migration's `/app/$theme`
   routes** (theme-as-URL-segment is better for the compliance matrix than theme dirs).
   Synthesizer decides; everyone's content survives either way.
2. **Which ReportProvider does a page mount? Unspecified.** `PageLayout.context:
   "workspace" | "project"` covers Workspace/Project, but the report scope must follow: my
   proposal — the provider-stack builder derives it deterministically: `context: "workspace"`
   → `ReportProvider({ kind: "scan", path: roots[0]?.path })`; `context: "project"` →
   `ReportProvider({ kind: "repo", path })`. If a future workspace preset wants to omit
   reports, add an optional `PageLayout.report?: false` escape — default on (all three
   themes consume report data). I'll carry this in my refined plan unless you object.
3. **Flow generators need a data seam.** `flows.ts` ("projects" → `scoreProjects` → nodes)
   must read the scan. Contract proposal: flow generators receive the `WorkspaceContextValue`
   as their input (`(ws: WorkspaceContextValue) => WidgetNode[]`), so `renderLayout` runs
   inside the provider stack and flows never call tRPC themselves. This keeps your
   "themes don't fetch" grep invariant true for flows too.
4. §10.1 scroll exception for FileBrowser/Artifacts/Ideation: no data-side objection — all
   three keep their container-independent internal queries today and that should remain
   (leaf parts fetch; contexts provide scope). Only note: if ideation becomes a Sheet, it
   still shouldn't grow a ProjectContext dependency.

### Alignment / conflicts with my draft
Aligned: context names, provider-stack mounting, `contexts` requirement declaration, thin
routes. No data-domain conflicts. Seams 2–3 above are the only unspecified joints.

---

## 2. draft-parts.md

**Verdict: strong agree on the two-layer library and portal infra; one explicit pushback
(`stackRamp` does not belong in metrics); one hook-safety fix (`commitLog(limit)`); accept
`statusOf` into my module.**

### Strengths
- **Two-layer rule (ui = props-in/tokens-only, app parts = context-consuming) is exactly
  right** and matches my "contexts expose query results" stance: app parts are the only
  things allowed to touch contexts, ui stays pure.
- `ReportGate` with `mode: gate|banner|line` consuming `useReport()` is a strict
  improvement on my §3.4 contract — same inputs (status machine + command + generate),
  three densities. I'll adopt modes into the ReportGate contract and keep the
  retain-exportData-during-running semantics as my default (their call on visuals).
- MIN_CONTENT exports + `data-part-min-w/h` attributes — gives migration's probes and your
  ladder a single source of truth. Good.
- ThemeScope/portal-host mechanism kills all four per-theme hacks at once; recharts coupling
  collapsing into the same scope is the right generalization.
- Severity token rename `--sev-critical|--sev-warning` — matches my api-boundary
  canonicalization; these two changes must land in the SAME phase (my D1) or tokens and
  types straddle.

### Actionable concerns
1. **`stackRamp(n)` must NOT live in scan-metrics (your §8 ask).** Your own conventions §2.3
   say parts theme via `var(--chart-1..6)` and cycle+clamp — a color-cycling function is a
   ui/parts concern, and my module must stay color-free (it's also consumed by SSR-side
   derivations and future non-UI exporters). Counter-proposal: `packages/ui/src/lib/tokens.ts`
   (which you already create in P3) exports `chartColor(i: number): string` cycling
   `--chart-1..6`. Metrics return data-only rows; parts apply color. Please drop the ask.
2. **`commitLog(limit)` as a provider function is not hook-safe.** Your `ListCommits` prop
   `{ limit?: number }` consuming `useProject().commitLog(limit)` implies calling `useQuery`
   inside a callback. Fix (I'll write it this way): `ProjectContextValue.commitLog` is the
   single provider-level query (limit 200, shared entry); widgets needing another limit call
   `useCommitLogQuery(path, limit)` from my queries module directly (documented escape
   hatch). `ListCommits` uses the direct hook — it's an app part, allowed.
3. **I accept `statusOf(project, now)` into scan-metrics.** Adding to `severity.ts`:
   `statusOf(project, now): { tone: "critical" | "warning" | "info" | "live" | "nominal"; label: string }`
   — merges mb's `projectLed` + MC's `StatusLed` five states (live = `isHot`, nominal =
   clean), canonical severity otherwise. This becomes the single `<Led>` feed and retires
   the third naming generation (StatusLed/projectLed/worstSeverity → one).
4. **Chart point shape.** Your `Chart` takes `points: { label; value }[]`; my
   `aggregateCadence` emits domain-shaped `{ period; commits }[]`. Keep both: metrics stay
   domain-typed, the Chart part (generic) maps at its boundary. Just don't ask metrics to
   emit `label/value` — that's a chart's vocabulary, not a report's.
5. `FormReportRun` needs the period preset list including "all": my queries module will
   export `REPORT_PERIOD_PRESETS: readonly { value: ReportPeriod | undefined; label }[]`
   (mb's array + "All"). Consume from there, not a local copy.
6. Directory: your `apps/web/src/parts/` vs architect's `apps/web/src/widgets/parts/` vs
   migration's `components/widgets/parts/` — same three-way conflict as concern 1 to
   architect; content is unaffected, paths converge at synthesis.

### Alignment / conflicts with my draft
Aligned: context hook names, ReportGate consuming the status enum, severity canonical
everywhere, `AttentionList` on my `attentionProjects`, `ProjectPulse` on my `pulseCells` +
`now`. Conflicts: `stackRamp` home (I refuse, alternative offered), `commitLog(limit)`
signature (hook-safety fix offered).

---

## 3. draft-migration.md

**Verdict: strong agree on structure, harness, and cleanup discipline; two stale severity
references to fix in your plan text; one early-vs-late sequencing decision to lock; one note
that severity touches legacy files you declared untouched.**

### Strengths
- `/app/$theme` + glob registry + per-theme directories: the parallel-safety contract is
  airtight, and the six-address compliance matrix is exactly the right no-vision test shape.
- The harness spec (probes with exact semantics, closed exemption allowlists, deterministic
  fixture with date-pinned commits, roots-list hygiene guard) is the strongest part of any
  draft this round. The report interaction row (generate → poll → `fresh`; backdated
  staleness chip) maps 1:1 onto my state machine — it will pass by construction if the
  provider owns staleness (it does).
- K1 verify-then-delete and "temporary copies are how duplicates survive" (§8.3) — correct
  discipline; matches my D8 dead-code deletion list.
- K5 flagged out of default scope — agree with your reading of decision #10's letter.

### Actionable concerns
1. **Your §4.1 tokens manifest still lists `--sev-error|--sev-warn`** and §8.2 speaks of "the
   single mapper". Both are stale against settled #8 + my draft + parts' rename: (a) the
   required-token manifest must read `--sev-critical|--sev-warning|--sev-info`; (b) there is
   NO runtime mapper in my design — scan emits canonical at `packages/api/src/lib/scan.ts`
   (4 sites) and `AlertSeverity` changes in `types.ts`. Your grep invariant should therefore
   be stronger than "beyond the single mapper": **zero `severity === "error"|"warn"`
   comparisons anywhere in `widgets/`, `parts/`, `packages/ui/`** — one vocabulary, no
   mapper to find.
2. **Severity sweep timing — my firm position: EARLY, sweeping the design files.** Your plan
   keeps designs compiling until K1 (post-G1), and parts P-waves (which consume canonical
   types) start long before that. Therefore my D1 must mechanically sweep the 12 design
   files too (~30 lines total, sed-able comparisons) or every intermediate build fails.
   Alternative "land severity right before K1" is impossible: parts/metrics/contexts all
   type against canonical from their first phase. Lock this order: **D1(severity) → D2
   (metrics) → … → P-waves → K1(deletes swept designs)**.
3. **"What does NOT move" needs one amendment:** my D1 edits three legacy production files
   for severity (`components/needs-attention.tsx`, `components/summary-cards.tsx`,
   `components/git-badges.tsx`) — edits, not moves; they stay in place serving `/` until
   K5. Your §2.3 wording ("stay untouched until cleanup") should carve out "except the
   severity vocabulary sweep" so your own greps don't flag them.
4. `data-providers` attribute on provider roots (§8.2) — accepted, trivial: my providers
   stamp `data-providers="workspace report"` etc. on their root node. I'll spec exact
   strings in refined.
5. Your D1 row says "four contexts + severity mapper + staleness ownership (data)" — sizing
   note for the master plan: my equivalent is phases D1–D7 (severity / metrics / format /
   queries / settings+workspace / report / project), each under the 15-file/500-line budget.
   One "D1" mega-phase would blow the budget; keep the split.

### Alignment / conflicts with my draft
Aligned: contexts before parts waves, staleness owned by ReportProvider (your §8.2 = my
§3.2), fixture-driven report assertions, deletion ordering. Conflicts: severity mapper
phrasing + token names (fix in your text), sweep timing (settled: early, per concern 2),
directory (see architect concern 1).

---

## 4. Cross-cutting conflicts (for the synthesizer)

| # | Conflict | Parties | My position |
|---|---|---|---|
| 1 | Directory & staging routes: `apps/web/src/widgets/` + `/themes/*` (architect) vs `components/widgets/` + `/app/$theme` (migration) vs `apps/web/src/parts/` (parts) | all three | `apps/web/src/widgets/` tree (architect) + `/app/$theme` routes (migration); parts live at `widgets/parts/`; contexts at `widgets/contexts/` |
| 2 | Severity mapper: "single mapper at boundary" (migration §8.2) vs api-emission canonical with no mapper (mine) | migration, parts | No mapper — scan emits canonical (settled #8's intent); grep invariant becomes zero-old-vocabulary |
| 3 | Severity sweep timing vs design deletion | migration | Early sweep incl. 12 design files; deletion stays at K1 |
| 4 | `stackRamp`/color helpers home | parts | ui `lib/tokens.ts` `chartColor(i)`; metrics stay color-free |
| 5 | `commitLog(limit)` provider API | parts | Provider = fixed shared entry (200); other limits via `useCommitLogQuery` direct hook |
| 6 | ReportGate running-state visuals: retain last-known exportData (mine/bento) vs wipe-to-skeleton (mb precedent) | parts | Retain data in the machine; parts choose visuals (I default to progress-over-content) |
