# Draft — Migration & Rebuild Plan (migration specialist)

Domain: where the widget system lives, build order, theme-migration orchestration, the
owner-mandated compliance/validation agent, no-vision testing, theme-preset handoff, and the
cleanup phase. Constraints honored: settled decision #10 (new page + new component tree,
themes migrate onto it, compliance agent at the end, old routes deleted only after everything
is tested and working) and the phase budget (≤ ~15 files / ~500 lines, Sequential|Parallel
typed, gated by `pnpm run check-types` + `pnpm build`).

---

## 1. Approach in one paragraph

Build the new system in a **new namespace** — routes under `/app`, components under
`apps/web/src/components/widgets/` — with **theme-agnostic routes** that render whatever a
theme preset registry provides. The three surviving themes (mission-control, bento, meadow)
each ship a preset package inside their own directory (`widgets/themes/<slug>/`), exactly the
isolation pattern that made the prototype phase parallelizable under `designs/<slug>/`.
Foundations land sequentially (routes → runtime/contexts/parts → one walking skeleton), then
theme migrations run as parallel waves with per-theme self-validation and a wave-wide
validator. A **compliance agent** runs the full DOM-measurement checklist at the end (and a
lite version after each wave). Old `/designs/*` routes stay untouched and running until the
cleanup phase, which deletes them, sweeps dead code, and triages research docs. The owner
gets one scheduled **visual review gate** before cleanup — agents have no vision, so aesthetic
sign-off is explicitly the owner's; everything machine-checkable is machine-checked.

## 2. Target structure

### 2.1 Routes (new; nothing existing moves)

```
apps/web/src/routes/app/index.tsx                  # /app → redirect to /app/mission-control (default theme)
apps/web/src/routes/app/$theme/index.tsx           # dashboard for theme in $theme (validated against registry)
apps/web/src/routes/app/$theme/project.$.tsx       # project page for theme (splat = project path, same convention as designs/)
```

Why `$theme` as a URL segment rather than a search param or fixed per-theme routes:

- One route file per surface, written **once** in the foundation phase; theme agents never
  touch routes (zero shared-file collisions during the parallel phase — the registry below
  removes even the one-line registration edit).
- The URL is the test matrix: the compliance harness enumerates
  `/app/{mc,bento,meadow}` × `{dashboard, project}` as six addresses — trivially scriptable,
  no theme-switch UI needed for validation.
- `/designs/<slug>` keeps working untouched during migration (deletion is a late phase), so
  before/after comparison is always available to the owner.

Default theme = `mission-control` (flagged: owner may prefer bento; one-line change). Theme
choice persistence is deliberately out of scope (consistent with settled decision #4's spirit;
revisit at cutover).

### 2.2 Component tree (namespace split — the parallel-safety contract)

```
apps/web/src/components/widgets/
  runtime/            # architect domain: canvas, grid snapping, Widget shell, size-class ladder, slots
  contexts/           # data domain: WorkspaceContext, ProjectContext, ReportContext, SettingsContext + providers
  parts/              # parts domain: the common part set, one index, per-part min-size floors
  themes/
    index.ts          # registry via import.meta.glob("./*/preset.ts", { eager: true }) — no shared file edits
    <slug>/           # ONE directory per theme agent; nobody else writes here
      preset.ts       # assembles the ThemePreset (see §4)
      tokens.css      # full required-token re-declaration under scope class .theme-<slug>
      custom.css      # OPTIONAL theme chrome classes (additive only)
      dashboard.ts    # dashboard layout preset (declarative data)
      project.ts      # project-page layout preset (declarative data)
      widgets/        # theme-scoped widget KINDS: compositions of common parts only
```

Invariants that make parallel safe: theme agents write **only** inside `widgets/themes/<slug>/`;
the registry globs so no theme edits shared files; routes are theme-agnostic and frozen after
phase M1. Enforcement is grep-based in the harness (§5.3), not honor-system.

### 2.3 What does NOT move

Everything under `routes/designs/`, `components/designs/`, and the legacy production
dashboard (`routes/index.tsx`, `routes/projects.$.tsx`, `components/*.tsx` sheets/cards) stay
untouched until cleanup. Shared infrastructure (`lib/mosaic-layout`, `lib/forms`,
`lib/use-report.ts`, `components/project-git-actions.tsx`, `file-browser/`, `artifacts/`,
`ideation/`, `project-commit-history.tsx`) is consumed by the new system in place — wrapping,
not copying.

## 3. Build order (dependency spine)

```
M1 routes scaffold ──┐
                     ├─> M2 harness v0 ─────────────┐
A1 runtime core ─────┤                              │
D1 contexts ─────────┼─> P1..Pn parts waves ──┐     │
                     │                        ├─> M3 walking skeleton (gate)
                     └────────────────────────┘     │
                                                    v
                       T-wave 1 (tokens+shell) → T-wave 2 (dashboards) → V2 → T-wave 3 (project pages) → V3
                                                    │
                                                    v
                       C1 full compliance agent (owner-mandated) → G1 owner visual gate → K1..K4 cleanup → (K5 cutover, flagged)
```

Sequencing positions (my requirements on peers, detailed in §8):

- **Foundations before any theme**: runtime (A1), contexts (D1), parts waves (P*) must be
  merged before theme waves start — themes may only compose what exists. Exception: T-wave 1
  (tokens.css + preset shells rendering an empty board) can start as soon as M3 lands, in
  parallel with late parts waves, because it exercises no parts.
- **Walking skeleton (M3) is the gate**: one real widget end-to-end
  (contexts → runtime → one part → measured by harness) before theme waves. This kills the
  "stack doesn't compose" risk while it's cheap.
- **Parts waves are the long pole**: the duplication matrix implies ~18 common-part
  candidates; parts specialist sizes the waves. My plan only requires: (a) the parts index
  exists with min-size floors documented per part, (b) wave order starts with the parts the
  first theme needs (I request: report gate, stat, animated number, table, cadence chart,
  donut, attention list, LED, git glyphs first — mission-control's dashboard set), (c) the
  mission-bento salvage parts (signal-line row, LED tiles) land in a parts wave **before
  cleanup** K1, since K1 deletes mission-bento.

## 4. Theme preset format handoff + definition of done

A theme provides exactly five things (all inside `widgets/themes/<slug>/`):

1. **`tokens.css`** — scope class `.theme-<slug>` declaring the FULL required token set:
   base shadcn tokens + the semantic part tokens (`--sev-error|--sev-warn|--sev-info`,
   `--state-positive`, `--recency-fresh|-stale|-wash`, `--pinned-accent|-wash`,
   `--chart-1..6`, `--font-mono`, `--eyebrow`, chrome tokens for radius/hairline/panel bg).
   The required-token list is a manifest shared by the harness (§5.3 probe 3) — token
   completeness is machine-checked, not review-checked. Color literals are ONLY legal on
   custom-property declaration lines (grep-enforced).
2. **`custom.css`** (optional) — additive chrome classes. Rules: never required for function;
   never change layout/visibility, only skin (radius, borders, backgrounds, fonts). The
   compliance run includes a **bare pass**: each route's `head` omits `custom.css` when the
   search param `?bare=1` is present (one conditional in the theme page shell — spec'd in
   M1), and the full interaction suite must still pass functionally. "Works without custom
   classes" (owner's words) is thus tested, not asserted.
3. **`dashboard.ts`** — the dashboard layout as declarative, `JSON.stringify`-able data:
   widget tree of `{kind, placement, props}` where `kind` resolves through the widget-kind
   registry. Size-class content is referenced by kind+props, never inline JSX (settled
   decision #4: definitions are data so persistence can bolt on later). Exact schema is the
   architect's runtime contract — this plan requires only: pure data, tier-vocabulary
   breakpoints (3x3/2x3/2x2/2x1/1x1, settled #6), nearest-defined fallback.
4. **`project.ts`** — same format for the project page.
5. **`widgets/`** — theme-scoped widget kinds when a theme needs a composition the common set
   lacks (e.g. mission-control's nav rail). These components may import ONLY from
   `widgets/parts/`, `widgets/runtime/`, `widgets/contexts/`, and `packages/ui` — never
   recharts/tanstack-table/tRPC directly (grep-enforced). If a theme needs a new **part**
   (repeatable content unit), it does not write it locally: it escalates (§8.3) and the part
   lands in the common set for everyone.

**Definition of done — a migrated theme** (checked by T-wave validators + C1, signed by owner at G1):

- `/app/<slug>` and `/app/<slug>/project/<fixture-path>` render with fixture data at three
  viewports (3440×1440, 1280×800, 390×844);
- harness: zero inner-scroll offenders, density ≥ 0.70 on all non-exempt widgets, token
  completeness 100%, portal scope correct, full interaction suite green — at all three
  viewports, plus the bare pass;
- greps clean (§5.3): no reimplementation signatures in `themes/<slug>/`;
- every functional surface wired (§5.4 matrix);
- owner has seen it once (G1).

## 5. The compliance/validation agent (spec)

Dispatched once after T-wave 3 (C1), plus lite re-runs per wave (V2/V3). No vision — every
check is DOM measurement, grep, or build output.

### 5.1 Harness artifacts (built in M2, extended per wave)

```
scripts/widget-check/
  run.mjs                  # orchestrator: --theme --page --viewport; drives browser via agent-browser eval; prints PASS/FAIL lines; exit ≠0 on FAIL
  probes/
    no-inner-scroll.mjs    # probe source injected via eval (see 5.2)
    density.mjs
    token-completeness.mjs
    portal-scope.mjs
  interactions/            # one script per functional surface (5.4)
  grep-invariants.mjs      # static checks (5.3)
  required-tokens.json     # manifest of required semantic tokens (source: parts contract)
  fixture.sh               # creates/destroys a deterministic git fixture project + root (see 5.5)
```

`run.mjs` contract: settles the page (waits for `[data-ready]` on the board root — runtime
convention requested from architect: routes stamp it when queries resolved and first paint
done), sets viewport, evals probes serially, prints `PASS|FAIL|WARN  <check-id>  <detail>`
lines followed by a JSON summary `{"theme":…,"page":…,"viewport":…,"pass":n,"fail":n,
"failures":[…]}`. Reports go to stdout + `--out <path>` (callers paste into the phase report;
no report files committed to the repo).

### 5.2 DOM-measurement probes (exact semantics)

**no-inner-scroll** (settled #2 — the page body is the only scroller):
Walk every element under `[data-theme-scope]`. FAIL any element (except `html`/`body`) where
`scrollHeight − clientHeight > 2` or `scrollWidth − clientWidth > 2`, unless it carries
`data-scroll-exempt`. Also FAIL if `document.documentElement.scrollWidth − clientWidth > 1`
(page-level horizontal overflow). Exempt allowlist is closed and shipped in the harness
config: the ui primitives' own scrollables (combobox/listbox contents, sonner viewport),
each entry requiring a justification comment; anything else is a code fix, not an exemption.
Declared-but-not-actually-scrolling `overflow:auto` interiors report as WARN.

**density** (owner: "density ≥70% per panel"):
For each `[data-widget]`: `density = area(union bounding box of rendered children) / area(widget content box)`.
FAIL < 0.70. Skip widgets marked `data-density-exempt` (loading/error/empty states only —
abuse of this attribute is a review finding) and widgets shorter than 40px. Runs after
`[data-ready]`, at all three viewports. (Union-bbox is a convention — it over-counts sparse
diagonal layouts, i.e. the check is generous; failing it means genuinely empty space.)

**token-completeness**: for every token in `required-tokens.json`, read
`getComputedStyle(scopeEl).getPropertyValue(token)`; FAIL on empty/whitespace. Also verify
the theme's values differ from the app defaults where the theme is supposed to be distinct
(sanity against a silently-unapplied scope class).

**portal-scope** (depends on architect's unified portal mechanism): open each dialog/menu
trigger `[data-act^="open-"]`; on the portal content node, computed `--background` must equal
the theme scope's value. FAIL on mismatch (catches the meadow `body:has()` / mb `.mb-scope`
class of bug being re-introduced).

**placement integrity** (after drag/resize interactions, re-run on the board): top-level
`[data-widget]` bboxes pairwise non-intersecting; each widget's stamped `data-x/y/cols/rows`
(placement attributes — requested runtime convention) matches its computed grid position.

### 5.3 Grep invariants (static, run per wave + C1)

1. `widgets/themes/**` contains no imports of `recharts`, `@tanstack/react-table`, no
   `useTRPC`, `useQuery(`, `useMutation(`. Themes compose; they do not fetch or draw.
2. `widgets/parts/**` and `widgets/runtime/**` contain no color literals (`oklch(`, `#hex`,
   `rgb(`, `hsl(`) — only `var(--*)`. Exception list: none.
3. Color literals in `widgets/themes/**/*.css` only on lines declaring custom properties.
4. No theme file defines a component whose name matches a part name (dupe sniff), and
   `d="M`-style SVG path data in themes/ is flagged (paths belong in parts).
5. Every theme widget-kind file imports at least one of `parts/`, `runtime/`, `contexts/`
   (composition-only rule).
6. Repo-wide standing rules the harness re-checks on new code: no `any`/`as any`.
7. Every size-class content mapping in preset data references a defined kind; every kind id
   used by any preset resolves in the registry (a tiny script importing the registry — can
   run under `tsx`/vite-node in the check phase).

### 5.4 Functional-surface wiring matrix (interaction suite — one script per row)

| Surface | Script asserts |
|---|---|
| scan/filter | `[data-act="filter"]` narrows fleet rows; Escape restores; rescan button triggers query invalidation (row timestamps change) |
| sort | click `[data-col]` header twice; row order (via `data-sort-key` on rows — parts hook convention) flips deterministically |
| drag | pointer-drag `[data-drag-handle]` by exactly 2 cells right + 1 row down; `data-x/y` change by exactly that; nested widgets expose NO drag handle |
| resize | drag `[data-resize-handle]`; `data-cols` changes; `data-size` (resolved size class) re-ladders per settled #6; no-inner-scroll re-probe passes after reflow |
| carousel | next arrow advances active slide; N presses cycle to start; reduced-motion honored (`prefers-reduced-motion` emulation pass) |
| tabs / views | every `[role="tab"]` switch shows its panel; keyboard 1..N switches views |
| resizable panels | drag `[data-panel-resize-handle]`; panel geometry changes and persists across client navigation |
| git (fixture) | fetch + pull succeed (toast `[data-sonner-toast]` success); branch switcher lists both fixture branches; switch updates the branch label; pull button disabled while `git.busy` |
| note | typing + blur saves; value survives reload |
| report | generate → poll → `[data-report-status]` reaches `fresh`; chart part renders SVG; staleness chip appears when fixture `generatedAt` is backdated |
| files / artifacts / ideation | FileBrowser tree renders fixture files; artifacts panel lists; ideation input present |
| forms | add-root, create-project, clone-script, report-run dialogs open, fields present, cancel-safe; clone copy shows copied state |
| navigation | every "open project" affordance lands on the same theme's project route (not `/designs`, not legacy `/projects/`) |

### 5.5 Deterministic fixture (no real user data mutated)

`fixture.sh create` makes `$TMPDIR/ww-check-fixture/` — a git repo with 3 commits at fixed
`GIT_AUTHOR_DATE`s, a package.json (deterministic stack detection), a dirty file. The
interaction suite itself adds it as a root **through the add-root dialog** (which is also the
thing under test) and removes it at the end (settings UI or `roots.remove` — executor
confirms the exact procedure name against `packages/api/src/routers/`; if removal is missing
from the API surface, that's a finding to escalate, not a workaround). Git mutations run
against the fixture only; the suite must never invoke mutations on the user's real projects
(harness aborts if the active root set ≠ fixture-only, enforced by reading `roots.list`
first).

### 5.6 C1 pass/fail output (what the compliance agent reports)

Per theme × page × viewport: the PASS/FAIL table from all probes + greps + interactions; a
cross-theme section (parts commonality — e.g. "3/3 themes import Chart from parts, 0 local
chart implementations"); a defects list with owner routing (runtime/parts/theme/contexts).
The agent re-runs until green or blocks. Green C1 + owner G1 sign-off are the entry
conditions for cleanup.

## 6. Phase list (orchestration-ready)

Legend: Type S=Sequential, P=Parallel(wave). Every phase ends with
`pnpm run check-types && pnpm build`; integration-visible phases additionally run the
deploy/verify loop
`flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`
followed by the harness against the service URL (resolve concrete port from
`systemctl --user cat workspace-welcome.service` at execution time; `run.mjs --base-url`).

| ID | Type | Phase | Depends | Files (out) | Lines ≈ |
|---|---|---|---|---|---|
| M1 | S | `/app` route scaffold + glob registry + theme shell + `?bare=1` convention | — | 5–6 | 250 |
| M2 | P (with A1, D1) | harness v0: 4 probes + grep script + run.mjs + fixture.sh + self-test route (`/app/__check`, dev-only, renders known-bad elements; probes must FAIL it — proves the probes) | M1 | 8–9 | 450 |
| A1 | S | runtime core (architect) | — | (their plan) | (their plan) |
| D1 | S | four contexts + severity mapper + staleness ownership (data) | — | (their plan) | (their plan) |
| P1..Pn | S-wave | parts waves (parts specialist), ordered so MC's dashboard set + report gate land first; mb-salvage parts before K1 | A1, D1 | (their plan) | (their plan) |
| M3 | S | walking skeleton: one widget end-to-end on `/app/mission-control` placeholder grid, measured by harness | A1, D1, P-first-wave, M2 | 3–4 | 200 |
| T1-{mc,bento,meadow} | P (wave 1) | per theme: tokens.css + preset.ts + empty-board shell | M3 | 4–5 each | 250 each |
| V1 | S | wave-1 validator: probes on 3 empty boards + token completeness + registry greps | T1-* | 0 (runs only) | — |
| T2-{mc,bento,meadow} | P (wave 2) | per theme: dashboard.ts preset + theme widget kinds + custom.css | T1-*, parts available | 6–8 each | ≤500 each |
| V2 | S | wave-2 validator: full harness (probes + interactions + greps) on 3 dashboards | T2-* | 0 | — |
| T3-{mc,bento,meadow} | P (wave 3) | per theme: project.ts preset + project widget kinds | T2-* | 5–7 each | ≤450 each |
| V3 | S | wave-3 validator: harness on 3 project pages (fixture) | T3-* | 0 | — |
| C1 | S | compliance agent: full matrix (§5.6) + fix-dispatch loop | V3 | report only | — |
| G1 | S | OWNER visual gate: click-through of 6 pages + `/designs` comparison | C1 | — | — |
| K1 | S | delete migrated designs (mc/bento/meadow) + mission-bento (pre-verified: salvage parts exist + grepped in use) | G1 | −~60 files | deletions |
| K2 | S | delete swiss + ledger + designs gallery (`routes/designs/index.tsx`), fix inbound links | K1 | −~10 files | deletions |
| K3 | S | dead-code sweep: grep every export of deleted dirs for remaining consumers; remove design-only helpers; `/designs` string sweep repo-wide (incl. docs app) | K2 | few | small |
| K4 | S | docs triage (see §7) | K3 | 3–4 edits | small |
| K5 | S, FLAGGED | cutover `/` to the widget system; retire legacy dashboard components + `projects.$.tsx` | G1 + owner go | (separate mini-plan) | — |

Per-theme chains are independent — the waves are the default schedule, but mc-T3 may run
while bento-T2 does, provided V2 ran for bento first. The orchestrator may compress; it may
not skip validators.

Commit convention (execution, with owner's dispatch authorization): one commit per phase
gate, `widget-system(<phase-id>): <summary>`; deletions get their own commits (K1 one per
theme) so anything is revertible in isolation.

## 7. Cleanup detail (K1–K4)

- **K1 order matters**: verify the mission-bento salvage parts exist AND are imported by at
  least one migrated theme (or deliberately benched with a note), then delete
  `components/designs/mission-bento/` + `routes/designs/mission-bento/`. Same verify-then-
  delete for the three migrated themes: grep that no `widgets/` code imports from
  `components/designs/**` (this must already hold — themes were built on parts — so K1 is
  pure deletion).
- **K2**: swiss/ledger leave the working tree; they remain recoverable in git history of this
  branch (settled #5 "benched on the branch"). Gallery route goes; its PageRail usage is the
  last consumer reference to check.
- **K3**: `grep -r "components/designs\|/designs/" apps packages docs --include=*.{ts,tsx,md,mdx}` →
  zero (except git history and the flagged catalog banner). `check-types` + `build` green
  after sweep; boot the service and hit `/`, `/app/mission-control` once (deploy loop).
- **K4 docs triage**: KEEP `docs/research/widget-part-catalog.md` with a superseded banner
  pointing at the parts system (it remains the only record of min-content floors and part
  provenance). UPDATE `docs/research/workspace-welcome-architecture.md` (routes map: add
  `/app`, remove `/designs`), `CONTEXT.md` (Widget/Part/Theme-preset vocabulary), `AGENTS.md`
  only if the route table there changes (it currently doesn't mention designs). DELETE:
  nothing else exists in `docs/research` that is design-phase-only — "clean the design
  research" resolves to: gallery + designs code (K1–K2) + catalog banner (K4). If the owner
  wants the catalog gone entirely, that's a one-command follow-up; I recommend keeping it
  until one release after cutover.
- **K5 (flagged, recommended but separable)**: replacing the legacy `/` dashboard is beyond
  decision #10's letter ("new page… old design routes deleted"). I schedule it as an
  owner-gated follow-up: redirect `/` → `/app/<default>`, retire `routes/projects.$.tsx` and
  legacy-only components (`project-card`, `pinned-section`, `summary-cards`,
  `needs-attention`, `status-strip`, theme-less sheets if unreused). Needs its own mini-plan
  (production data surfaces differ from designs').

## 8. Dependencies on peer plans (and my asks)

### 8.1 architect (runtime)
- Widget shell must stamp `data-widget`, placement attributes `data-x/y/cols/rows`, resolved
  `data-size`, and expose `data-drag-handle` / `data-resize-handle` — my probes and
  interaction scripts key on these. Cheap, testability-critical.
- Board root stamps `data-ready` when settled.
- Layout-definition schema must keep presets pure-data (`JSON.stringify`-able); if their
  design needs JSX content nodes, we have a conflict (see refined round — my position: data
  referencing registered kinds, content variation via kind props).
- Unified portal mechanism must exist before T-wave 2 (portal-scope probe depends on it).
- DnD library proposal (dnd-kit or otherwise) lands in A1 — not my call, but it must support
  cell-snapped drag + keyboard resize, and the interaction suite drives it via pointer
  events, so the runtime must not depend on exotic pointer APIs.

### 8.2 data (contexts)
- Final context names/shapes per settled #7; my interaction suite asserts provider presence
  (`data-providers` attribute convention requested on provider roots).
- `ReportProvider` must own staleness (catalog §B2) — my report interaction asserts the
  `fresh|stale` transitions against a backdated fixture.
- Severity mapping at the boundary (settled #8) — grep invariant: no `error|warn` literals
  in parts beyond the single mapper (add to grep-invariants once data confirms the mapper's
  home).

### 8.3 parts
- Parts must expose stable test hooks: `data-part="<id>"` on rendered roots and
  `data-sort-key` on table rows; min-size floors documented per part so the density probe's
  40px floor and size-ladder greps have a source of truth.
- Escalation protocol (owner's "no theme re-implements a part" made workable): if a theme
  wave finds a missing part, the theme agent files it in its wave report and STOPS that
  widget; the orchestrator dispatches a parts micro-phase; the theme resumes. Themes never
  hold local copies, not even temporarily — a temporary copy is how duplicates survive.

## 9. Risks

1. **Parts coverage gaps discovered mid-theme** (highest likelihood) — mitigated by
   parts-first ordering, MC-set-first wave request, and the escalation protocol. Residual:
   schedule slip; acceptable.
2. **Density metric misfires** on legitimately sparse states — mitigated by generous
   union-bbox, exemption attribute, and owner G1 as final aesthetic authority.
3. **No-inner-scroll vs tables**: FleetTable-class widgets have 720px floors; in small cells
   the preset must shed columns or switch parts (KVList), not scroll. This is an outcome
   requirement on theme presets + parts; the probe enforces it ruthlessly. Expect this to be
   the top C1 failure source — by design.
4. **SSR/hydration**: grid measurement is client-only; harness waits for `data-ready`, which
   must be set post-hydration (ask of runtime). SSR mismatch on placement attributes would
   show as flaky probes — treat flakiness as a bug, not noise.
5. **Fixture-root hygiene**: suite refuses to run git mutations unless `roots.list` matches
   fixture-only; protects the user's real projects.
6. **Parallel CSS/token collisions** — none by construction (per-theme dirs, glob registry);
   residual risk is copy-paste between theme agents — V-wave validators diff tokens.css
   against required manifest, catching drift.
7. **Phase-size overrun in T2/T3** for mission-control (its design is the largest surface).
   If an agent's estimate exceeds ~500 lines, split the preset into two dispatches
   (e.g. fleet+command bar first, analytics zone second) — the wave validator runs on the
   partially-populated board either way.

## 10. Open questions / disagreements I'm aware of

- Default theme for `/app` redirect (mission-control proposed — cosmetic, owner's call at G1).
- Whether K5 (`/` cutover) is in this plan's scope. My position: NOT in the default scope —
  decision #10 speaks of the new page + designs deletion only. Flagged, recommended as
  immediate follow-up.
- Whether presets stay pure-data if architect's runtime wants render-prop content. My
  position: data + registered kinds; JSX-in-preset breaks settled #4's future-persistence
   premise. To be resolved in refine round.
- Keeping vs deleting `widget-part-catalog.md` after cleanup (my position: keep, banner).
