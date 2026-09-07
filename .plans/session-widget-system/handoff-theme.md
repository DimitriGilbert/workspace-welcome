# Handoff — theme-system execution order (entrypoint, persistence, schemes, known-project bug)

Order: `.plans/session-widget-system/execution-orders-theme-system.md`. Branch `widgets/system`.
No commits made (orchestrator commits at gates).

## STATUS: COMPLETE — all gate items green (see Verification)

## What was built

### 1. `/` is the widget system (single entrypoint)
- `apps/web/src/routes/index.tsx` — fully rewritten. Renders the SAVED preset
  (`ww.prefs.v1` → `WidgetPrefsProvider` state) > `DEFAULT_THEME_ID` (now exported from
  `widgets/themes/index.ts`, shared with the `/app` redirect) > first registered preset. One
  `RenderLayout` = one ThemeScope; switching preset is a React state change → old tree unmounts,
  new renders. Honest no-themes state when the registry is empty.
- The old HomeComponent is gone (owner ordered `/` BE the widget system; functionality lives on
  the boards — verified ledger navigation, actions band, report flow post-cutover).

### 2. Persistence (state-driven; NO display:none/hidden-tree switching anywhere in my code)
- `apps/web/src/widgets/theme-prefs.tsx` — `WidgetPrefsProvider` (mounted once in `__root.tsx`):
  localStorage `ww.prefs.v1` `{ preset?, schemes? }`, defensive parse, SSR-safe (hydrated flag).
- next-themes `ThemeProvider` (attribute="class", defaultTheme="dark", enableSystem=false) in
  `__root.tsx`; `<html class="dark">` SSR default matches. Picker syncs `setTheme(appearance)`
  to the ACTIVE scheme post-hydration; every scheme pick also writes it.
- Switching = state change: entrypoint re-renders from prefs; `/app/$theme` URLs follow via
  navigation (same page kind, splat preserved).

### 3. Per-preset multi-CSS color schemes (light AND dark)
- `widgets/themes/index.ts`: `ThemeScheme { id, label, appearance, css? }`;
  `ThemePreset.schemes` REQUIRED (first = default); `scheme-*.css` glob (?url) with
  module-eval validation (missing file, duplicate id, empty list → throw);
  `resolveThemeScheme` (?scheme= > saved > default), `themeSchemeCssHref(s)`,
  `themeCustomCssHref` unchanged.
- Scheme application: ALL scheme files linked per page via `<SchemeStylesheets preset>` (React 19
  precedence `ww-theme-scheme-css`); `tokens.css` stays bundled via each preset's import. The
  ACTIVE scheme is one `data-ww-scheme="<id>"` attribute on the single ThemeScope
  (RenderLayout `scheme?: ThemeScheme` prop; absent when default). Coordinator-corrected model:
  one active composition state-swapped; CSS links are styles, attribute decides — no hidden DOM.
- Scheme files (full 38-token manifests + theme ride-alongs, literals only on declaration lines):
  - `mission-control/scheme-daylight.css` (default console = dark)
  - `meadow/scheme-nightfall.css` (default daylight = light)
  - `bento/scheme-paper.css` (default graphite = dark)
- Presets declare schemes in `themes/*/preset.ts` (`SCHEMES` arrays).
- `?scheme=<id>` search param (themeSearchSchema) forces a scheme — harness/deep links.

### 4. Theme picker (system header + per-theme chrome slots)
- `widgets/runtime/theme-picker.tsx` — `ThemePicker({ theme, activeScheme? })`; two token-styled
  ui Selects (preset list from the registry; scheme list from the preset). Preset pick: saves +
  navigates same page-kind on `/app/*`, in-place on `/` (URL untouched). Scheme pick: saves +
  `setTheme(appearance)`.
- Hosts: RenderLayout page header (mission-control, lab hides it — unregistered slug). meadow and
  bento `display:none` the runtime console header in their (pre-existing) custom.css chrome, so
  `meadow-header.tsx` and bento `chrome.tsx` host `<ThemePicker>` in their own chrome rows
  ("per-theme chrome header slot" per the order).
- data hooks: `[data-theme-picker]`, triggers `aria-label="Theme preset" / "Color scheme"`.

### 5. Known-project bug — fixed at the navigation layer
- Root cause: any project page whose path the scan doesn't know (nested under a root, moved,
  hidden, mistyped deep link) mounted the full provider stack; `reports.command` 500s, widgets
  hung in "loading", and the app-wide `QueryCache.onError` (router.tsx — global retry toast)
   spammed "Not a known project — it must live directly under a tracked directory." toasts.
- Fix (packages/api untouched — out of fix scope):
  - `routes/app/-theme-shell.tsx` `ProjectKnownGate`: children mount ONLY when the scan knows the
    path. Scan error → honest error card. Settled+unknown → "Not a known project" card with a
    picker of all 32 scanned projects (same-theme links). Loading/catch-up refetch → neutral
    Loader (one refetch per mount covers fresh-scaffold deep links).
  - `report-context.tsx`: `commandFailed` (command query error) → status "missing" with the error
    in `commandError` (no infinite loading), `generate()` no-op, ReportGate hides Generate CTA.
- Server rule unchanged: direct-child-of-root validation mirrors the scanner (honest by design).

### 6. Harness (`scripts/widget-check/`)
- `run.mjs --scheme <id>` → `?scheme=` on theme URLs + `meta.scheme`.
- `grep-invariants.mjs`: color-literal declaration-line exemption extended from `tokens.css` to
  also cover `scheme-*.css` (same §3.6.1 rationale; scheme files ARE token sheets).

## Pre-existing failures found + fixed (were failing at HEAD)
- validate-layout: lab ladder placed `mc-actions` (min 2x1) at 1x1 → `lab-preset.ts`
  `ladderCatalogNodes` now skips rungs below each kind's registry min (every LEGAL rung still
  exercised).
- lab part-min horizontal overflow (167px at HEAD): WidgetShell root now `overflow-hidden`
  (shell owns its box; drag/resize handles are canvas siblings — untouched; portals escape;
  not auto/scroll so no-inner-scroll unaffected) + honest `min` floors for fixed-content widgets:
  bento-chrome 3x3, bento-mosaic-header 3x3, bento-health 2x1, bento-activity 2x1,
  bento-stacks 2x1, bento-attention 3x3, bento-signals 2x1, bento-pulse 3x3,
  mc-command-bar 3x3, meadow-attention 2x1 (all measured against real content widths).

## Verification (final build, 2026-09-06)

- `pnpm run check-types` PASS; `pnpm run build` PASS; deploy loop + service restart PASS.
- grep-invariants: 7/7 PASS.
- Harness: 6 dashboards (mc/meadow/bento × default+alt scheme), 4 project pages (mc default+
  daylight, meadow, bento), lab, parts-preview, self-test → ALL "OK — 6/6/4 pass, 0 fail".
- CDP (DOM-only, no vision):
  - `/` no prefs → mission-control, picker present, one scope; saved meadow+nightfall → renders
    meadow nightfall (single scope; `--background oklch(17% .012 150)`).
  - Scheme pick via REAL clicks on the meadow chrome picker → nightfall applied + prefs written +
    next-themes `theme=dark` + html class `dark`; survives fresh load.
  - Preset pick on /app/meadow → navigates to /app/mission-control (URL follows); on `/` → swaps
    in place (URL stays `/`, one scope).
  - Nested-path project page → ZERO toasts, "Not a known project" card + 32-project picker, no
    board mounted. Real project page unaffected (9 widgets).
  - mc-actions Generate report flow → dialog → submit → no failed requests.
- SSR: `/` streams the saved/default board + picker + scheme links.

## Notes for the next agent
- tRPC GET input: `?input=<urlencoded JSON>` (no `{json:}` wrapper). POST body: raw JSON.
- Global `QueryCache.onError` (router.tsx) toasts EVERY failed query with a retry action — any
  500ing query is user-visible; keep doomed queries unmounted.
- Doc comments must not contain `themes/*/preset.ts` — `*/` closes the comment.
- Harness runs against the DEPLOYED build (127.0.0.1:37420) — deploy before harness runs.
- The SSR streaming container (`<div hidden id="S:0">`) holds a pre-hydration DOM copy — CDP
  tests must target the visible instance (`getClientRects().length > 0`), not `:first`.
- Do NOT edit `.plans/session-widget-system/master-plan.md`. `/designs/*` untouched.
