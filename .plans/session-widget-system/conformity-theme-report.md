# Conformity report — theme-system execution order

- Spec: `execution-orders-theme-system.md` · Handoff: `handoff-theme.md`
- Branch `widgets/system` @ 55ef0f7 + uncommitted working tree (21 modified, 9 new files). No commits made (per orders). `master-plan.md` untouched.
- Independent verification: every claim re-tested against ONE fresh deploy (`flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`, 2026-09-06). Build green, service active, `http://127.0.0.1:37420` 200.

## Gate

| Gate item | Result |
|---|---|
| `pnpm run check-types` | PASS (all 4 packages) |
| `pnpm run build` | PASS (deploy loop, single deploy used for all tests) |
| Harness all 3 themes × dashboard | PASS (12 combos, see matrix) |
| `/` renders the saved theme | PASS (proof below) |
| Scheme switch persists across reload | PASS (proof below) |
| "Not a known project" no longer reproduces | PASS (proof below) |

## Deliverables

| # | Deliverable | Verdict | Evidence |
|---|---|---|---|
| 1 | Single entrypoint `/` renders SAVED preset (default mission-control) | PASS (defect D1) | DOM eval on `/`: `localStorage.clear()` → reload → scope `mission-control`, scheme default, prefs null; after real picker pick → scope `meadow`, URL stays `/`, prefs `{"preset":"meadow"}`; SSR HTML streams default board `data-widget-board="mission-control:dashboard"` + picker + scheme link. Honest no-themes state present in code path. But see D1: `/` omits the preset's `custom.css`. |
| 2 | Persistence via `ww.prefs.v1` + next-themes; picker on every theme | PASS | Real clicks only. On `/`: preset→mission-control + scheme→daylight, hard reload → both survive (`data-ww-scheme="daylight"`, `--background: oklch(96% .004 250)`, prefs `{"preset":"mission-control","schemes":{meadow,nightfall,bento:paper,mission-control:daylight}}`, `localStorage.theme=light`, `<html class="light">`). Same proof for bento+paper. Per-preset schemes map retains all 3 presets. Fresh profile (`localStorage.clear()` → reload) → defaults: mc + console dark, `theme` key absent. |
| 3 | Per-preset multi-CSS schemes, instant switch, light AND dark | PASS | 3 schemes shipped (mc daylight / meadow nightfall / bento paper), full 38-token manifests under `[data-ww-theme][data-ww-scheme]`. Switch via picker = one attribute flip: 1 scope, `--background` flips 13.5%→96.5% (bento paper) / 17% (meadow nightfall) with no reload; both scheme `<link>`s always in head (`link[data-ww-scheme-css]` ×2 per theme), active chosen by attribute. All scheme files validated at module eval (missing/dup/empty throw). `?scheme=` forces scheme for harness/deep links (used by harness, verified passing). Module-eval registry validation code reviewed. |
| 4 | Known-project bug fixed at correct layer | PASS | Original trigger re-created: `/app/mission-control/project/home/didi/workspace/workspace-welcome/apps/web` (nested under a tracked root, not in the 32-project scan) → honest "Not a known project" card with the path echoed + 32 same-theme project links, **0 toasts**, **0 failed tRPC requests** (`performance` resource audit), no board mounted, no crash. `ProjectKnownGate` wraps `RenderLayout`; doomed provider stack never mounts. ReportProvider `commandFailed` → status `missing`, `generate()` no-op, ReportGate hides Generate CTA. Generate-report dialog on mc lists tracked-directory picker only (no free path) → submit navigated to `/reports/scan-workspace-503d1a7a`, 0 failed requests, 0 toasts. packages/api untouched (verified via git status). |
| 5 | Keep everything wired; harness green; no deletions | PASS | All 3 themes + lab intact (no deletions anywhere in diff). Harness matrix + lab + parts-preview + self-test + interactions all green (below). |

## Harness (deployed build, 127.0.0.1:37420)

| Suite | Result |
|---|---|
| dashboards: mc/console, mc/daylight, meadow/daylight, meadow/nightfall, bento/graphite, bento/paper × **3440x1440** and × **390x844** | 12 × `OK — 6 pass, 0 fail, 0 warn` |
| project: mc console + mc daylight, `--path /home/didi/workspace/workspace-welcome`, 3440x1440 | 2 × `OK — 6 pass, 0 fail, 0 warn` |
| `--suite lab` | `OK — 6 pass, 0 fail, 0 warn` (validate-layout lab-min fix holds: ladder now skips below-min rungs) |
| `--suite parts-preview` | `OK — 4 pass, 0 fail, 0 warn` (378 floored part boxes clean — overflow fix holds) |
| `--suite self-test` | `OK — 6 pass, 0 fail, 0 warn` |
| `scripts/widget-check/interactions/run.mjs` | `OK — 13 pass, 0 fail, 1 warn` (warn = pre-existing "sortable affordances not mounted yet", unrelated to this order) |
| grep-invariants | **7/7 PASS** (`theme-css` exemption correctly extended to `scheme-*.css`: 9 theme stylesheets, literals only on custom-property declaration lines; `no-any` 222 files clean; `validate-layout` ran clean) |

## Single-composition proof (after real preset + scheme switches on `/`)

- Exactly **1** `[data-theme-scope]` (attrs: theme flips, `data-ww-scheme` appears only for non-default scheme), **1** `[data-widget-board]` (`meadow:dashboard`), board visible.
- **0** theme/preset-switch-related `display:none` elements: audited every body element with computed `display:none` — all are Tailwind responsive `hidden` utilities at small viewports (pre-existing) or React 19's hoisted `<link rel=stylesheet>` metadata hiding (the always-loaded-scheme mechanism itself, `style="display:none !important"` on `<link data-ww-scheme-css>` — styles, not composition).
- Diff grep: **zero** `display:none` lines added by the implementation in apps/ or scripts/. The only `display:none` rules in themes are pre-existing `custom.css` chrome hides (meadow/bento page-header, mc title dots) — unchanged files.
- No state-by-hiding anywhere: switching is React state (entrypoint) + router navigation (`/app/*`) + one scope attribute (scheme).

## Code conformity

- No `any`/`as any`/`: any` added (diff grep + invariant no-any).
- Imports stay on the sanctioned surface: react, @tanstack/react-router, next-themes (already a dependency), `@workspace-welcome/ui/components/select`, local widgets modules. `import type` used for type-only imports.
- No theme deletions; no `/designs/*` or packages/api edits; `bts.jsonc` untouched; no dev servers started; no commits made.
- next-themes wired in `__root.tsx` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem=false`, SSR `<html class="dark">` matches); picker syncs `setTheme` only post-hydration (no clobber of saved value).

## Legacy

- `/` → 200 (entrypoint). `/app` → 307 → `/app/mission-control` (shared `DEFAULT_THEME_ID`). `/designs/bento` → 200, renders (DOM read, no error). `/designs/mission-control`, `/settings` → 200.

## Defects (owner: implementation agent — small, precisely scoped)

- **D1 (medium) — `/` entrypoint omits the preset's `custom.css`.** `apps/web/src/routes/index.tsx` links `SchemeStylesheets` but never `themeCustomCssHref(preset.id)`, so with meadow or bento saved on `/`:
  - the runtime page-header is NOT hidden (that hide lives in `custom.css`) → **two visible ThemePickers** on `/` (runtime header + theme chrome; verified 2 on `/` vs 1 on `/app/meadow`, `/app/bento`), and
  - meadow/bento lose their entire chrome skin on the entrypoint (gutter rhythm, canvas frame, hidden shell titles) — `/` does not render the same composition as `/app/<slug>`.
  - Fix: in `EntrypointPage`, link `themeCustomCssHref(preset.id)` with `precedence="ww-theme-custom-css"` exactly as `ThemePageShell`/`/app/$theme` routes do (respect `?bare` if the entrypoint grows that param). mission-control is unaffected (no custom.css).

## Observations (no action required)

- O1: Hard reload of `/` with a non-default preset paints the default preset for one paint before the saved selection swaps in (SSR cannot read localStorage). Documented tradeoff in `theme-prefs.tsx`; persistence contract is met post-load.
- O2: The `ProjectKnownGate` cards render outside any `[data-theme-scope]` (gate wraps `RenderLayout`, scope lives inside), so gate pages use app-level tokens, not theme tokens. Honest and readable; noting for awareness only.
- O3: Dangling doc comment in `render-layout.tsx` `PageBody` (the "system-header theme picker…" block sits orphaned above `useRequiresAssertion`, leftover from a removed picker guard). Cosmetic.

## Verdict

**CONFORMITY: PASS** — all five deliverables conform and the full gate is green; one medium UI-fidelity defect (D1) + three observations dispatched above for fix-dispatch.
