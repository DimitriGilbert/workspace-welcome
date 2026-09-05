# PARTS specialist — refined plan (round 1)

Revisions to draft-parts.md after cross-review. §1 lists every change with its origin;
§2 records settled conflicts; §3 is the updated phase plan; §4 lists what remains open for
the synthesizer. Everything not revised here stands as drafted (inventory §1.1–§1.9, token
contract §2, ThemeScope §3, naming §4, motion §5 of draft-parts.md).

---

## 1. Revisions (each traced to the review that caused it)

### 1.1 Library location — conceded to the unified tree (architect §4; data rev §1.1; migration rev §D2)

App parts move from `apps/web/src/parts/` to **`apps/web/src/widgets/parts/`**. Three of four
seats prefer the one-namespace tree (`widgets/{runtime,contexts,parts,themes,lab,registry.ts}`),
and migration's grep invariants (`widgets/parts/**` color-literal-free; theme kinds import from
`widgets/{parts,runtime,contexts}`) key on that prefix. My barrel rule survives unchanged:

```
apps/web/src/widgets/parts/
  report-gate.tsx  attention-list.tsx  project-pulse.tsx  note-editor.tsx
  led-project.tsx                      # NEW — thin context wrapper: statusOf(project, now) → <Led>
  git/branch-switcher.tsx              # NEW — see 1.6
  git/actions-toolbar.tsx              # NEW
  list/files.tsx  list/artifacts.tsx  list/commits.tsx
  form/create-project.tsx  form/add-root.tsx  form/clone-script.tsx  form/report-run.tsx
  registry.ts                          # definePart wrappers: id + MIN_CONTENT + component
  index.ts                             # barrel — the only import surface for widgets/themes
packages/ui/src/components/            # unchanged: chart, donut, h-bars, seg-bar, heatmap,
                                       # gauge, pulse-strip, animated-number, stat, vitals-band,
                                       # led, severity-dots, chip, git-glyphs, score-ring,
                                       # data-table, kv-list, widget-tabs, view-carousel,
                                       # theme-scope
packages/ui/src/lib/{curve,motion,tokens}.ts
```

Note: migration's review tree (§D2) still shows `apps/web/src/parts/` + `lib/contexts/` —
minor divergence from architect/data/me. I cast my vote with the majority
(`widgets/parts/`, `widgets/contexts/`); the synthesizer publishes ONE tree.

### 1.2 MIN_CONTENT role — conceded to architect's split (architect rev §2.1)

Drop "the grid imports MIN_CONTENT for drag/resize clamps". Correct split, adopted verbatim:

- **Registry `min` (authored cell floor) is the runtime clamp** — a widget's min = smallest
  defined `sizes` key (overridable via registry `min`), because per-size-class variants swap
  parts deliberately (a 1x1 variant renders Led/Stat with tiny floors; clamping against a Donut
  that isn't rendered there is wrong).
- **`MIN_CONTENT` exports feed authoring guidance, the definePart registry (`data-part-min-w/h`
  attributes), and the measurement gate** (harness invariant: rendered box ≥ declared floor at
  every ladder size, per theme cell density — a failed check is a finding, not runtime behavior).

### 1.3 Part self-degradation — precedence rule adopted (my review §1.2; architect accepted)

**Authored size-class content wins within its declared rung; container-query self-degradation
handles pixel variance WITHIN a rung** (cell density 84–104px, viewport width, panel resize).
Two documented channels: widget ladder (structure) vs part box (renderer/presentation). ui
package parts self-degrade via **container queries only** — they cannot read
`WidgetSizeContext` (app runtime context; purity rule). Structural switches needing the size
context belong to app-layer wrappers or the ladder. Chart's renderer flip is a
**ResizeObserver on its own box** (px-of-box, class-independent) — the one sanctioned
observer, documented in-file as the second channel.

### 1.4 ReportGate — final API (data rev adopted modes; architect rev §1.3 recommended shape)

```tsx
interface ReportGateProps {
  /** project path inside a scan-scope export; default = the scope itself */
  entry?: string;                       // consumes reportCtx.entry(path) + isEntryStale(path)
  mode?: "gate" | "banner" | "line";    // default "gate"
  quiet?: boolean;                      // loading/no-scope render null (for 1x1 placements)
  missing?: ReactNode;                  // default: GenerateCTA (button + copyable CLI + commandError)
  running?: ReactNode;                  // default: progress strip OVER retained children
  loading?: ReactNode;                  // default: skeleton
  children: ReactNode;                  // rendered for fresh AND stale; parts inside read useReport()
}
```

- `children` is a plain `ReactNode` (settled — data adopted modes; nobody defended the
  render-prop after my composable-children argument).
- Behavior matrix per data §3.4: `no-scope` → null · `loading` → skeleton (null when `quiet`)
  · `missing` → CTA · `running` → running slot over retained `exportData` children ·
  `stale` → children + stale chip + regenerate (force) · `fresh` → children.
- **Running-state visuals (data's open question answered): retain last-known content under a
  progress strip** (bento behavior). The machine keeps `exportData`; ReportGate never wipes to
  skeleton when data exists.
- `banner` = stale strip + children (project-page gates); `line` = one-line status strip
  (mb SnitchStatusStrip successor).
- Status name: **`no-scope`** (data's) over the catalog sketch's `no-root` — flagged for owner
  ratification in the synthesized plan (cosmetic, one string).

### 1.5 Data-side corrections adopted (data rev §2)

- **`stackRamp` ask withdrawn** — color cycling is not a metric. `packages/ui/src/lib/tokens.ts`
  exports `chartColor(i: number): string` cycling `--chart-1..6`; scan-metrics stays color-free.
- **`ListCommits` fixed**: does NOT call `useProject().commitLog(limit)` (not hook-safe).
  Provider exposes the fixed shared query (limit 200); `ListCommits { limit?: number; view?:
  "table" | "graph" | "list" }` calls `useCommitLogQuery(path, limit)` directly — legal for an
  app part; default 200 hits the provider's cached entry.
- **`Led` feed**: data's scan-metrics `severity.ts` owns
  `statusOf(project, now): { tone: "critical"|"warning"|"info"|"live"|"nominal"; label: string }`
  (accepting into their module per their review §2.3). My `ledOf` composer is dropped; app part
  `ProjectLed { project }` = `statusOf` + `useWorkspace().now` → ui `<Led>`. Third naming
  generation (StatusLed/projectLed/worstSeverity) retires.
- **Chart point shape**: metrics stay domain-typed (`{period, commits}[]`, `{name, dirty}[]`);
  ui `Chart` keeps generic `points: {label, value}[]`; **app parts/theming wrappers map at the
  boundary**. No domain vocabulary enters packages/ui.
- **`FormReportRun`** consumes `REPORT_PERIOD_PRESETS` exported from data's queries module
  (includes "All" = undefined) — no local period list.
- **Severity**: one rename commit inside data's D1 (`--sev-error|--sev-warn` →
  `--sev-critical|--sev-warning` in globals.css + production styles + theme CSS) — my parts
  land AFTER D1 and use canonical names only; zero old-vocabulary comparisons anywhere in
  `widgets/`, `parts/`, `packages/ui/` (migration's strengthened grep).

### 1.6 Git interactive parts added (my review §2.4; data confirmed provider surface)

Catalog §1.4's shared `BranchSwitcher` + `GitActionsToolbar` join the inventory as app parts:
`git/branch-switcher.tsx`, `git/actions-toolbar.tsx` — read `useProject().git` (busy, diverged,
the quintet) instead of mutation-slice props; keep a compat prop path during migration
(shared `components/project-git-actions.tsx` keeps working for legacy routes until K5).

### 1.7 Conventions amended (architect rev; migration rev)

Added to the part contract (draft §2):
1. **Fill-box roots**: every part roots `h-full w-full min-h-0` (architect's layout-agnostic
   rule; also what the density probe ≥0.70 and recharts definite boxes need).
2. **Container queries only** — no viewport media queries inside parts (widget cells have no
   meaningful viewport). Tailwind v4 `@container` variants against WidgetShell's
   `container-type: inline-size`.
3. **Test hooks**: part roots stamp `data-part="<id>"` (definePart wrapper does this + the
   `data-part-min-w/h` attributes); `DataTable` rows stamp `data-sort-key={row.id}`.
4. **Color literals dropped**: parts use bare `var(--token)` — the fallback literals I proposed
   are conceded to migration's zero-literal grep; the safety net is base-theme token
   completeness (globals.css already defines the full semantic set — verified) + the
   token-completeness probe. Migration extends invariant #2's scope to the new
   `packages/ui/src/components/` part files (their review accepted; confirm in their refine).
5. **Motion**: unchanged from draft §5; architect independently aligned ("parts animate content
   only, placement belongs to the shell").

### 1.8 ThemeScope — settled and sequenced (architect rev accepted; migration rev §C3)

- **Attribute selector `[data-ww-theme="<slug>"]` wins** (architect + migration both adopted;
   class squatting produced `.mc.mc`). ThemeScope stamps BOTH `data-ww-theme` (token selector)
   and `data-theme-scope` (migration's probe marker). Theme `tokens.css` declares under the
   attribute selector, including the one recharts token-fill block per theme.
- **Ownership**: architect's `renderLayout()` mounts one `ThemeScope` per route (header + board
   inside); `useThemePortal()` stays exported — architect's drag ghost portals into the same
   host. packages/ui portal patches unchanged (dialog, sheet, dropdown-menu, select, popover,
   tooltip, context-menu, sonner pass `container`).
- **Sequencing**: migration's M1 now depends on my **P1 first** (M1 mounts ThemeScope from day
   one — no temporary plain-div scope). P1 has no peer deps; it is the first parts wave.
- **P1 validation gains the legacy sentinel**: after the portal patches, one legacy route
   dialog-open assertion must pass (behavior unchanged without a scope) before anything rides
   on it.

### 1.9 Validation consolidation — one harness (architect rev §2.6; migration rev §C1)

Explicit ack to migration, as requested: **one harness**. My measure script is not standalone —
its assertions become `scripts/widget-check/probes/part-min.mjs` (box ≥ declared MIN_CONTENT,
no horizontal overflow, dialog fixed-box == viewport inside scope), authored in my P5 but
living in migration's harness; wired to the parts-preview route via `run.mjs --suite parts`.
Dev surfaces: exactly two, both `import.meta.env.DEV`-guarded — architect's widget-lab
(`/app/__lab`, hosting migration's probe self-test panel) and my parts-preview (hosting data's
provider-mount panel). Both survive migration as dev tools (migration K4 keeps them +
`docs/research/parts-reference.md`).

---

## 2. Settled conflicts (round-1 ledger)

| # | Conflict | Resolution |
|---|---|---|
| 1 | Part self-swap rule | Ladder = author's tool; container queries = part's; precedence rule §1.3 |
| 2 | MIN_CONTENT at runtime | Registry `min` clamps; MIN_CONTENT validates (architect split, §1.2) |
| 3 | Theme scope selector | `[data-ww-theme]` attribute + `data-theme-scope` marker (§1.8) |
| 4 | ReportGate API | mode API + slots + quiet + plain children (§1.4) |
| 5 | ReportGate running visuals | retain content under progress strip (§1.4) |
| 6 | `stackRamp` home | `chartColor(i)` in packages/ui lib/tokens.ts (§1.5) |
| 7 | `commitLog(limit)` | fixed provider query + direct `useCommitLogQuery` escape hatch (§1.5) |
| 8 | `statusOf` home | data's scan-metrics `severity.ts` (§1.5) |
| 9 | Severity vocabulary | api-emission canonical + token rename in ONE D1 commit; no mapper survives (§1.5) |
| 10 | Color-literal fallbacks | dropped; base tokens + completeness probe carry safety (§1.7) |
| 11 | Form dialogs | ONE token-styled set; themes ship no dialog containers (migration accepted) |
| 12 | Measurement stacks | one `scripts/widget-check/` harness + two dev routes (§1.9) |
| 13 | ThemeScope sequencing | P1 before migration M1 (§1.8) |
| 14 | Parts location | `apps/web/src/widgets/parts/` (§1.1; migration's D2 tree dissent noted) |
| 15 | `useWidgetSize` in ui parts | forbidden; container queries only (§1.3) |
| 16 | WidgetTabs vs shell tabs | both exist, documented distinct: shell `tabs` = widget-level view switching; WidgetTabs = in-content tabs |

## 3. Updated phase plan (parts domain)

Dependencies updated; file counts and budgets unchanged otherwise.

| Phase | Type | Content | Depends on | Validation |
|---|---|---|---|---|
| **P1** Theme infra | S, FIRST | `packages/ui/src/components/theme-scope.tsx`; portal `container` patches (dialog, sheet, dropdown-menu, select, popover, tooltip, context-menu, sonner); `packages/ui/src/lib/motion.ts`; `package.json` (motion catalog dep) | none | check-types; build; **legacy sentinel** (legacy dialog opens, portal lands on body unchanged); no `data-ww-theme` consumers outside theme-scope |
| **P2** ui chart family | P (with P3) | chart, donut, h-bars, seg-bar, heatmap, gauge, pulse-strip, `lib/curve.ts`; recharts catalog dep | P1 (motion lib only; trivially reordered if needed) | check-types; build; recharts mode client-only-mounted; ResizeObserver flip documented |
| **P3** ui readout/table/layout | P (with P2) | animated-number, stat, vitals-band, led, severity-dots, chip, git-glyphs, score-ring, data-table, kv-list, widget-tabs, view-carousel, `lib/tokens.ts` (Tone + chartColor), carousel height-chain fix; react-table catalog dep | P1; **after data D1** (severity names) | check-types; build; `useReducedMotion` in every animated part; zero color literals |
| **P4** app context parts | S | `widgets/parts/` tree (§1.1) + `lib/forms/clone-script.ts` + file-browser height prop fix | data D4–D7 (contexts, queries, scan-metrics incl. statusOf, REPORT_PERIOD_PRESETS); P2+P3; architect W1 (definePart) | check-types; build; barrel compiles; CloneScript flows typecheck against api clone-script lib |
| **P5** preview + probe | S | parts-preview dev route (hosts data's provider panel); author `scripts/widget-check/probes/part-min.mjs` (lives in migration's harness, `--suite parts`); `docs/research/parts-reference.md` | P2–P4; migration M2 (harness skeleton) | check-types; build; `run.mjs --suite parts` green: every part box ≥ MIN_CONTENT at ladder boxes, no horizontal overflow, token resolution non-empty, dialog fixed-box == viewport in-scope |

Migration's wave-1 MC-first request is satisfied: ReportGate/Stat/AnimatedNumber/Table/
Chart/Donut/AttentionList/Led/GitGlyphs are P2+P3+P4 outputs; M3's walking skeleton should use
`Stat`/`Led` (context-free, P3) since ReportGate is P4 (needs contexts).

## 4. Remaining open items (for the synthesizer / owner)

1. **Tree divergence, one vote off**: migration's refined tree keeps `apps/web/src/parts/` +
   `lib/contexts/`; architect + data + (now) I converge on `widgets/parts/` +
   `widgets/contexts/`. Publish ONE tree; content is identical either way.
2. **No-inner-scroll exemptions (owner call, G1)**: migration ships the allowlist EMPTY with
   FileBrowser/Artifacts FAILING until signed. My position on record: accept the two named
   part-level exemptions (`data-scroll="widget"` on ListFiles/ListArtifacts scroll boxes —
   already coded in my wrappers so it's a config flip), move Ideation to a Sheet. I support
   shipping the allowlist pre-populated-but-marked-pending-owner rather than red probes, but
   defer to migration's stricter framing.
3. **`no-scope` vs `no-root`** status naming — owner ratification (cosmetic).
4. **`sizes={{…}}` syntax adaptation** (architect's TS1003 correction) — owner sign-off, noted
   by all four seats as required.
5. **Architect↔data seam I depend on**: ProjectProvider nesting WorkspaceProvider (project
   pages hosting workspace parts like AttentionList/ProjectPulse) — architect requested, data
   hasn't answered; my parts work either way, but the presets assume nesting.
6. **Registry composition** (static map vs glob-merge for theme widget kinds) — architect +
   migration to settle; my definePart registry wraps only COMMON parts and stays static.
7. RRP removal (architect) vs migration's old interaction row — migration already dropped the
   row for new pages in their refine; noted as settled unless architect objects.

---

## 5. Standing positions (unchanged, restated for the synthesizer)

- One chart ENGINE (recharts@3 + meadow-monotone compact SVG fallback) + engine-less geometry
  primitives (Donut/SegBar/HBars/PulseStrip as hand-SVG/div) — the agreed reading of settled #9.
- Two-layer library with the mechanical purity rule; packages/ui gains exactly three catalog
  deps (recharts, @tanstack/react-table, motion), no barrel changes.
- Portal theming = ThemeScope infrastructure; the four per-design hacks die in the per-theme
  migration steps (tokens under `[data-ww-theme]`, portals into the scope host).
- Every part: tokens-only, bare `var(--*)`, `ariaLabel` where meaningful, `data-part` hook,
  fill-box root, container-query degradation, exported MIN_CONTENT, reduced-motion honored.
- Motion: content-only animations from `packages/ui/src/lib/motion.ts`; placement animation is
  the shell's; auto-advance and pulses off under reduced motion.
