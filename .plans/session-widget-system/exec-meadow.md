# exec-meadow — progress notes

Mission: meadow project bento as a first-class widget (8/12 + right 4/12 rail) +
sizing-law sweep on meadow dashboard + project widgets. Write scope:
`apps/web/src/widgets/themes/meadow/**` (+ routes only if strictly required).
runtime/, designs/, other themes = READ-ONLY.

## Recon findings (2026-09-06)

- Routes already render the preset (`routes/app/$theme{,/project/$}` mount
  `RenderLayout` with `preset.dashboard` / `preset.project`) — no direct bento
  mount in route code. Nothing to move; Part 1 is preset + widget work.
- The "project bento" = `meadow-project-sections` (tabbed
  Overview/Activity/Code/AI/Files/Artifacts/Ideation body). It is a registered
  kind but authored full-width `12x7` and its presentation reads as a free page
  (own footer, "All concepts" link to /designs, no shell chrome).
- Meadow's `custom.css` hides ALL `[data-slot="widget-shell-header"]` (design
  decision: panels carry their own headings). To make the bento read as a
  chrome-framed widget, un-hide the shell header for that kind only (scoped CSS)
  and pass title/meta from the component.
- Canvas `renderWidget` wraps every placed widget in an outer
  `<WidgetShell title={def.title}>` (also hidden by the theme rule). The inner
  per-component shell is the one we can give meta; scope the CSS un-hide to
  inner shells via `[data-slot="widget-shell-content"] [data-slot="widget-shell-header"]`.
- Packer: one-region reading-order skyline with fill-the-line. Authoring
  `[bento 8x7, identity 4x3, stats 4x4]` packs bento left, identity+stats
  stacked right, rail exactly 7 rows — tight at 12 cols; at 8 cols the bento
  clamps to full width and identity|stats re-pack side by side below; at 2 cols
  (meadow phone=2) everything stacks.
- Digest band rows are 148px (custom.css region step). Sizing-law violations on
  the dashboard: `digest-report` (MeadowReport section has no h-full → ~100px
  dead space under the panel in its 468px box), momentum (fixed h-14 trend in
  148px row), rhythm/stacks/directories (~70px dead space under card content).
- Project stats widget has no chart rung (2x1 strip resolves at any larger
  footprint → dead cells) — needs a real 4x4 rail rung (donut + bars per the
  sizing law).
- Shared browser daemon: use `AGENT_BROWSER_SESSION=meadow-exec` on EVERY
  agent-browser command (another agent drives the default session).

## BLOCKED order item — preset `version: 1 → 2`

`PageLayout.version` is the literal type `1` (runtime/layout-types.ts:67) and
`validatePageLayout` FAILS any `version !== 1` (runtime/validate-layout.ts:229);
the harness's grep-invariant #6 spawns `apps/web/scripts/validate-layout.mjs`
which validates every theme preset. Bumping meadow's layouts to 2 therefore
requires two runtime edits that are inside this mission's READ-ONLY zone:

1. runtime/layout-types.ts: `version: 1;` → `version: 1 | 2;`
2. runtime/validate-layout.ts: accept `1 | 2` in the version check.

Per the exclusive write scope I did NOT make those edits; meadow's layouts stay
`version: 1` (a preset with `version: 2` would not compile and would fail the
harness). Reported in the final reply as the runtime change needed.

## Implementation log

### Part 1 — bento as a first-class widget (owner order)

- `preset.ts` project layout: ONE stack region `"bento"` in reading order —
  `meadow-project-sections 8x7` (two-thirds width), `meadow-project-header
  4x3`, `meadow-project-stats 4x4`. Rail sums to exactly the bento's 7 rows →
  tight desktop packing (verified in DOM: rail 16+336+12+452 == bento 16+800).
  At 8 cols the bento clamps to full width and the rail pair re-packs side by
  side; at 2 cols (meadow phone) everything stacks.
- `project-sections.tsx`: inner WidgetShell now carries `title="Project
  sections"` + `meta` (branch · report age — metadata in the titlebar slot per
  the sizing law); the free-page footer ("meadow view" / All-concepts /designs
  link) removed; rungs simplified to "1x1" (branch) / "2x2" (tabbed body);
  overview bands split 3:2 with min-h-0 (the cadence svg's aspect-derived
  intrinsic height was bloating row 1 and starving the last-commit/note band);
  health-alerts column centers; NoteEditor stretches (`flex-1`).
- `custom.css`: scoped exception un-hides the bento's INNER shell header only
  (`[data-widget="meadow-project-sections"] [data-slot="widget-shell-content"]
  [data-slot="widget-shell-header"]`) — the canvas frame's duplicate registry
  title stays hidden; replaced the dead `identity`/`report-glance` region row
  steps with a phone (≤639px) 148px step for `[data-region="bento"]`.
- `project-header.tsx`: new `4x3` rail-card rung (trail / centered identity +
  touched+alerts / 2x2 command grid pinned to the foot). Rung authored at the
  exact preset footprint because the area-ranked ladder puts 4x3 above 12x1 —
  wide short placements keep the wrapping full-width row.
- `project-stats.tsx`: new `2x3` glance rung — compact figure cells over the
  language Donut + HBars (charts render because the box fits them); StatCell
  gained accent/compact registers; SLICE_COLORS moved to `bits.tsx` (shared).

### Part 2 — sizing sweep (dashboard + project)

- `report.tsx`: section `h-full min-h-0`, tab panel `flex-1`, cadence
  `min-h-20 flex-1` — the 12x3 digest band's chart now fills its 468px box
  (was ~100px dead under the panel).
- `context-cards.tsx`: ContextCard body wraps in a filling centered column →
  rhythm/stacks/directories hold their content as a centered block in the
  148px rows; MomentumCard's AreaTrend stretches (`min-h-12 flex-1`, new
  className prop in `bits.tsx`).
- Verified LOOK at 3440x1440 / 1280x800 / 390x844, daylight + nightfall: no
  lone-number widgets at 2x1+, digest band tight, project rail packed.

### Verification (final build 2026-09-06)

- `pnpm run check-types` PASS; grep-invariants 7/7 PASS (incl. validate-layout).
- Harness (deployed build): dashboard 3440x1440 / 1280x800 / 390x844 /
  3440x1440 nightfall → all "OK — 6 pass, 0 fail"; project
  (--path /home/didi/workspace/workspace-welcome) 3440x1440 / 1280x800 /
  390x844 → all "OK — 6 pass, 0 fail".
- Screenshots: /tmp/m-dash-3440-final.png, /tmp/m-proj-3440-final.png,
  /tmp/m-proj-1280.png, /tmp/m-proj-390-top.png, /tmp/m-proj-390-bottom.png,
  /tmp/m-dash-1280.png, /tmp/m-dash-390*.png, /tmp/m-dash-nightfall.png,
  /tmp/m-proj-nightfall.png, /tmp/m-proj-tab-{activity,code}.png.

### Files changed by THIS mission (meadow scope only)

custom.css, preset.ts, widgets/{bits,context-cards,index,project-header,
project-sections,project-stats,report}.tsx + exec-meadow.md. Routes untouched
(theirs already render the preset; the modified route files in git status are
the previous round's uncommitted work, extended not reverted).

## Round 2 — owner laws: subtitle ban + fill law + pixel-exact sizing

- report.tsx: DELETED the "Generated X ago · Full HTML report" footer row
  (the verdict's exact noise pattern); age stays on the title line via the
  stale/fresh GeneratedBadge. Link import removed.
- project-header.tsx: rail card touched/alert chips moved ONTO the identity
  line (ml-auto, same row as the name) — no standalone meta row.
- project-sections.tsx: CodePane donut sizes to the box (Donut `fill` mode in
  bits.tsx, capped `sm:max-h-72` to stay design-faithful vs /designs) with
  HBars rows distributing (`[&>ul>li]:flex-1`); alert cards distribute
  (flex-1 justify-center); AiPane fills its tab body (h-full, justify-evenly,
  figures scale via cqi clamps); LastCommit content centers between title and
  buttons; History panel stretches (self-start removed); Files tab
  `height="100%"` + `.meadow-files-fill` scoping; Artifacts
  `.meadow-artifacts-fill` scoping.
- custom.css: scoped fill rules for files/artifacts/ideation inside the bento
  (shared parts/components are outside the write scope — CSS fills them).
- Pixel compare vs /designs/meadow(+project): Git vitals spread, digest
  cadence, momentum numeral+trend, tile tiers match; the design's own
  "Generated X ago · HTML ↗" content row is intentionally gone (verdict law).
- Verified at 3440x1440: all seven bento tabs + rail cards + dashboard
  masthead/attention/tiles/digests — zero subtitle rows, zero interior voids,
  zero lone numbers at 2x1+. Screenshots /tmp/v3-* /tmp/v4-*, refs
  /tmp/ref-designs-*.png.
- Harness (final build): dashboard 3440x1440 / 1280x800 / 390x844 /
  3440x1440 nightfall, project same four → all "OK — 6 pass, 0 fail" (two
  runs hit a concurrent deploy's service restart, "fetch failed"; retried
  clean). check-types PASS. Note: the mission-control agent's concurrent
  edits twice broke the shared build mid-round (missing export, syntax
  error); resolved by polling the flock loop, never by touching their files.

## Round 3 — bento-of-projects widget + /app is dead

### Part 1: the mosaic is a widget (no free project tiles)

- NEW `widgets/themes/meadow/widgets/project-bento.tsx` —
  `meadow-project-bento` kind: runs the SHARED `"projects"` flow generator
  (`getFlow("projects")` from runtime/flows, same scoring + masthead-filter
  contract) as INTERNAL content. Desktop mosaic = pure CSS grid
  (`grid-cols-12` + `grid-flow-row-dense` + `auto-rows-[minmax(84px,1fr)]`),
  ladder rungs remapped to even spans (3x3→4x3, 2x3→4x2, 2x2→2x2,
  2x1→2x1, 1x1→1x1), fractional rows so the mosaic fills the shell box
  exactly at any project count — no inner scroll (no-inner-scroll probe
  untouched), no voids. Chrome-framed: shell title "Project bento" + meta
  "N projects" (filtered count when the masthead search narrows).
  Phone clamp (footprint ≤4 cols): a dense single-column ledger (name ·
  branch · age, one flexing row per project, tap → project page) — every
  project reachable at 170px without scroll or clip.
- `preset.ts` dashboard: the `"projects"` FLOW REGION IS GONE and the
  `"digests"` full-width band is gone. One `"board"` stack region in reading
  order: bento `8x13` + rail `meadow-report 4x5`, `meadow-momentum 4x2`,
  `meadow-rhythm 4x2`, `meadow-stacks 4x2`, `meadow-directories 4x2` —
  rail sums to exactly the bento's 13 rows, non-project content only.
  Reflow: 8 cols → bento full width, rail pairs side by side beneath; 2 cols
  → stacks. (The other agent's project-layout rework in the same file was
  preserved untouched.)
- `widgets/index.ts`: registered the kind (defaultSize 8x13, min 2x2).
- `custom.css`: the shell-header un-hide exception now covers both bento
  kinds (selector keyed by the preset INSTANCE id `project-bento` — the
  canvas frame stamps instance ids, not kind ids; the dead
  `[data-region="digests"]` 148px rule removed).
- NOTE: pixel width of the bento at 3440 is 66.5% (8 of 12 columns; the
  grid gap eats the last fraction of a percent). Column math is exactly 2/3.

### Part 2: /app is dead — top-level routes

- `routes/app/index.tsx` → beforeLoad redirect to `/` (307, verified).
- `routes/app/$theme/index.tsx` → beforeLoad redirect to
  `/?preset=<slug>` (+ forwards `?scheme`/`?bare`); `__lab` forwards to
  `/__lab`. Nothing renders — SSR body has zero board/scope markers.
- `routes/app/$theme/project.$.tsx` → beforeLoad redirect to
  `/project/<splat>?preset=<slug>`.
- NEW `routes/project.$.tsx`: the project stack (RenderLayout page="project"
  + ProjectKnownGate, unchanged gate behavior) over the SAVED preset;
  `?preset=` wins over saved (the old /app contract: that URL always
  rendered ITS theme) and is persisted once per distinct slug via a
  ref-guarded effect — unguarded it loops (prefs setter always produces a
  fresh state object → React #185; that WAS the crash class the owner hit
  on /app-era pages, now impossible: the effect is guarded and /app no
  longer renders at all).
- `routes/index.tsx` (`/`): now accepts `?preset=`/`?scheme=`/`?bare=` —
  same deep-link contract the dead /app routes carried; `?preset=` wins
  over saved, persisted via the same guarded effect.
- `routes/[__lab].tsx`: lab moved from `routes/app/[__lab].tsx` to
  top-level `/__lab` (brackets kept — bare `__lab.tsx` parses pathless);
  old path redirects via the `$theme` handler.
- Meadow links updated to top-level URLs: tile.tsx + meadow-attention.tsx
  openProject → `/project/$?preset=meadow`; project-header.tsx back link →
  `/?preset=meadow`; `-theme-shell.tsx` gate picker →
  `/project/$?preset=<theme>`, GateBackLink → `/?preset=<theme>`.
  OTHER THEMES' internal links still point at /app/* — they now redirect
  correctly (landing on / with that theme saved), so nothing breaks; their
  owner may rewrite them at will.

### run.mjs diff (URL layer only, for de-confliction)

`targetUrl()` in scripts/widget-check/run.mjs:
- theme suite project: `${baseUrl}/app/${theme}/project/${splat}${query}` →
  `${baseUrl}/project/${splat}${query}` with `preset=${theme}` added to the
  query params.
- theme suite dashboard: `${baseUrl}/app/${theme}${query}` →
  `${baseUrl}/${query}` with `preset=${theme}` added.
- lab: `${baseUrl}/app/__lab${query}` → `${baseUrl}/__lab${query}`;
  self-test: `${baseUrl}/app/__lab?self-test=1` →
  `${baseUrl}/__lab?self-test=1`.
- comments updated (lines 21, 119). Nothing else touched — probes, suites,
  and report logic are untouched.

### Round-3 verification

- check-types PASS; harness ALL GREEN: 3 themes × dashboard
  (3440x1440, 1280x800, 390x844, 3440x1440 nightfall) + 3 themes × project
  (3440x1440, nightfall) + lab + self-test + parts-preview — 21 runs,
  every one "OK — N pass, 0 fail".
- curl: /app → 307 `/`; /app/<slug> → 307 `/?preset=<slug>`;
  /app/<slug>/project/<path> → 307 `/project/<path>?preset=<slug>`;
  /app/__lab?self-test=1 → 307 `/__lab?self-test=1`; /app/nonexistent →
  307 (unknown slug dropped by the prefs guard, default renders); SSR body
  of /app/meadow contains ZERO board/scope markers. /project/<path> and
  /__lab direct → 200.
- Crops: /tmp/r3-dash-3440b.png (bento 2253/3385px = 8/12 cols, chrome
  title+meta, 32 tiles dense, rail = report/momentum/rhythm/stacks),
  /tmp/r3-dash-1280.png (8-col reflow), /tmp/r3b-dash-390.png (ledger),
  /tmp/r3-dash-nightfall.png (nightfall crops).

## Round 4 — theme picker dead on / (my route rework's bug) — FIXED

- REPRODUCED with real clicks: on `/?preset=meadow` (the /app redirect's
  landing state) a preset pick saved bento but the URL param out-ranked the
  saved prefs on every re-render → the pick did nothing / reverted on
  reload. Same fight for `?scheme=` (a scheme pick reverted while a
  `?scheme=` param was present). On a bare `/` picks worked — which is why
  it looked intermittent.
- FIX (granted file `widgets/runtime/theme-picker.tsx`, minimal diff):
  picks are now FULLY IN-PLACE on every route — `setSavedPreset` /
  `setSavedScheme` + next-themes sync, then a replace-navigation to the same
  path minus the `?preset=`/`?scheme=` params (via `router.navigate({href})`
  — a search reducer from a cross-route component collapses to `never` under
  the strict router types, so the strip is an href string). The dead
  `/app/$theme` navigation contract (`sameKindTarget`) is deleted. Deep
  links keep working: params are honored for the first paint and persisted
  by the routes' guarded mount effect BEFORE the picker can fight them.
- CLICK PROOF (agent-browser, real selects, deployed build):
  - /?preset=meadow → pick Bento → scope bento, URL stripped to `/`, scheme
    follows bento's saved paper. (This was the failing case.)
  - bento: paper ✓ graphite ✓ (dark class syncs). mission-control: daylight
    ✓ console ✓. meadow: daylight ✓ nightfall ✓.
  - Persistence: reload after bento pick → bento; reload after
    meadow/nightfall pick → meadow + `data-ww-scheme=nightfall`; restored
    meadow daylight by pick.
- curl re-proof on the final build: /app → 307 `/`; /app/<slug> → 307
  `/?preset=<slug>`; /app/<slug>/project/<path> → 307
  `/project/<path>?preset=<slug>`; /app/__lab → 307 `/__lab`;
  /app/nonexistent → 307 (unknown slug dropped, default renders).
- Harness re-run after the fix: 3 themes × {dashboard, project} ×
  {daylight 3440x1440, nightfall} — 12 runs green + lab + self-test green.
- Note for the runtime owner: the strip is an href replace (router typing
  collapses cross-route search reducers to `never`); if you rework the
  picker, keep the param-strip — without it any leftover deep-link param
  out-votes picks forever.

## Round 5 — taste sweep of every picker-reachable state (owner directive)

All six dashboard states reached by REAL picker clicks at 3440x1440, judged
by eye (crops /tmp/t1..t7-*.png):

- meadow daylight (t1) — PASS: dense mosaic, chrome-framed bento, rail
  report/momentum/rhythm/stacks filled, no subtitle rows, no voids.
- meadow nightfall (t6) — PASS: same structure in the dark garden tokens.
- mission-control console (t4) — PASS: triage/ledger/activity/ai/code/
  alerts/stack-mix all dense, void-free.
- mission-control daylight (t5) — PASS.
- bento graphite (t2) — **DEFECT, bento theme scope (NOT mine)**: the
  WORKSPACE PULSE band's chart area renders EMPTY (only axis labels) — big
  interior void; ACTIVITY chart hugs the bottom (sparse). Crops:
  /tmp/t2-bento-graphite.png.
- bento paper (t3) — **DEFECT, bento theme scope**: pulse band falls back to
  a 3-row table with a void below it; rest of the board is fine.
  Crop: /tmp/t3-bento-paper.png. → Route to the bento theme's owner; both
  are inside themes/bento/** which is outside every scope I hold.
- meadow PROJECT page reached by a real tile click → /project/<path>
  ?preset=meadow (t7, nightfall) — PASS: chrome-framed bento at 2/3, dense
  rail (identity+glance+report), no voids/noise.

Meadow is taste-clean in every state I own. The two bento flags above are
the only hesitations in the sweep.

