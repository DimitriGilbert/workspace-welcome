# exec-interactions — interaction-suite repair (Escape-revert / Escape-filter round)

Branch `widgets/system`. Scope held to `apps/web/src/widgets/runtime/**` +
`scripts/widget-check/**`. The suite did NOT crash in this round (no harness
errors; the mid-run crashes reported from earlier rounds did not reproduce).

## Failures captured verbatim (before fixes)

- mission-control (5F): `navigation /app did not redirect to a registered
  theme dashboard (at / …)`; drag-resize `ArrowRight from x=0 … gave x=0 —
  expected x=1`, `ArrowDown gave y=0 … expected y=1`, `SE ArrowRight gave
  cols=4 — expected 5`, `Escape left masthead at 0,0 3x1 — session start was
  0,0 4x1`.
- bento (5F): filter `pressing "/" did not focus input[data-console-filter]`;
  navigation (same as mc); console-keys `"/" did not focus` + `Escape did not
  clear and blur`; drag-resize `Escape left chrome at 0,1 12x1 — session
  start was 0,0 12x1`.
- meadow (4F): filter `"/"`; navigation; console-keys `"/"`;
  drag-resize `Escape left meadow-header at 0,1 12x1 — session start was
  0,0 12x1`.

NOTE: failures were NOT byte-identical across themes (mc = move-commit
refusals + Escape; bento/meadow = filter focus + Escape) — five distinct
causes, two product, three stale-test.

## Fixes

### Product (2)

1. **Escape baseline recorded the first edit's RESULT —
   `runtime/grid-session.ts` + `runtime/use-grid-drag.ts`.**
   `commitArrangement` captured a widget's baseline from the SETTLED
   (post-mutation) items, so Escape "reverted" to the post-first-edit
   placement — a no-op revert. Exactly the observed numbers: bento/meadow
   moved 0,0→0,1 and Escape stayed at 0,1; mc's first commit was the shrink
   4x1→3x1 and Escape restored 3x1. Fix: `commitArrangement` now takes the
   region's PRE-mutation placements (`preItems`) and baselines read from
   them (store fallback → settled items only for filter-grown nodes);
   `commitPlacement`/`revertToSessionStart` pass them. The pre-mutation
   cells are only known at the call site on the FIRST commit — the store
   has no previous arrangement yet, which is why a store-only fix was
   insufficient (verified: first attempt still failed mc).
2. No other product defect found: the mc move/grow refusals and the
   filter-focus behavior below are per the current model (see #2/#3).

### Tests (3 files + helpers)

2. **navigation.mjs — rewritten for the `/app` kill (stale).** Owner order
   made `/` THE app; `routes/app/*` are permanent redirects (`/app` → `/`,
   `/app/<slug>` → `/?preset=<slug>`, `/app/<slug>/project/…` →
   `/project/…?preset=<slug>`). New contract asserted: (1) `/app` lands on
   `/` with a registered theme scope; (2) `/app/<slug>` carries its slug —
   `/?preset=<slug>` renders THAT scope; (3) project links navigate
   (arrival accepts `/project/` or the legacy `/app/<theme>/project/`
   prefix — the legacy hop flips pathname asynchronously) with the theme
   scope still mounted. bento/meadow boards author no project links →
   WARN pending (honest, not FAIL).
3. **drag-resize.mjs — third legitimate keypress outcome (stale).** Under
   the round-5 arrangement model refusals exist for authored `at` anchors;
   mc's console authors EVERY widget as an anchor (preset.ts:111-120), so
   masthead's right/down/grow targets are all refusals — announced live
   ("Fleet vitals can't move right — Activity occupies that spot"). The
   script now accepts a no-op only when the aria-live announcement CHANGED
   on that keypress (a stale message must not vouch for a dead key) and
   keeps commit⇒pinned / no-op⇒unpinned pairing. `readPlacement` also
   returns the announcement text.
4. **filter.mjs + console-keys.mjs — visible filter affordance (stale
   selector).** bento/meadow hide the runtime page header by design
   (`custom.css`: `[data-slot="page-header"]{display:none}`; "the
   masthead's search field owns filtering (same workspace filter state)")
   — the contract input `input[data-console-filter]` exists but is
   display:none, and focus() on it is a no-op. Both themes implement
   "/-focus + Escape-clear" on their own search input bound to the SAME
   workspace filter (meadow-header.tsx, chrome.tsx). New
   `helpers.mjs#resolveFilterSelector` resolves the VISIBLE affordance
   (runtime input first, then `input[type="search"][aria-label="Filter
   projects"]`) and stamps a throwaway `data-ww-check-filter` mark so every
   step targets the same input. Out-of-scope recommendation: stamping
   `data-console-filter` on the two theme search inputs would let the
   runtime contract attribute travel with the affordance (themes/** was
   read-only for this round).

## Proof (all on the deployed build after `flock /tmp/ww-redesign-build.lock
sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`;
service active, / 200)

- interactions: mc `14 pass, 0 fail, 1 warn`; bento + meadow `11 pass,
  0 fail, 3 warn` — run twice (stability), all green.
- `node scripts/widget-check/run.mjs --theme {mission-control,meadow,bento}
  --page dashboard --viewport 3440x1440` → `theme: OK — 6 pass, 0 fail`.
- `pnpm run check-types` clean (whole workspace); `pnpm build` green
  (deploy wrapped).
- Real-pointer Escape-drag check (trusted CDP input only; recipe kept at
  `/tmp/ww-escape-drag-check.mjs`), on `/?preset=meadow`: mid-gesture
  Escape ends the gesture, commits nothing, placement = session start,
  ghost/dragging cleared, honest announcement; late pointerup commits
  nothing; control drag without Escape commits verbatim (0,0→0,3);
  focused-handle Escape AFTER a commit reverts to session start and
  announces "returned to its session start position". 11/11 PASS.
  Note: `startInteraction` preventDefaults pointerdown, so a real drag
  leaves no focus — post-commit Escape-revert is the keyboard-first path
  (focus the handle), which is the documented contract, not a defect.

## Remaining honest WARNs (pending, not failures)

- sort (no `data-sort-key` anywhere) and tabs (none outside mc's console)
  on all themes; navigation project-link pending on bento/meadow.
