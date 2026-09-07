# Execution order — entrypoint, theme persistence, color schemes, known-project bug

Owner orders (verbatim intent): `/` must BE the new widget system (single entrypoint). Theme/preset +
color-scheme must persist across reloads. Use `next-themes` for color scheme. Support multiple CSS
files so a preset can carry more than one color scheme. Support light AND dark. Fix the
"Not a known project — it must live directly under a tracked directory." bug. No deletions. Nothing
destructive. Commit your work in clean `widget-system(...)` commits.

## Repo facts (verified)

- Branch `widgets/system`. Stack: TanStack Start SSR + React 19 + Tailwind v4 + tRPC/react-query.
- Widget system: `apps/web/src/widgets/` — runtime (WidgetShell `sizes={{...}}`, grid-canvas,
  use-grid-drag, render-layout/PageProviders, registry.ts with `import.meta.glob("./themes/*/widgets/index.ts")`),
  contexts (settings/workspace/project/report), parts (widgets/parts/ + packages/ui), themes
  (`widgets/themes/<slug>/{preset.ts,tokens.css,custom.css,widgets/}`).
- Routes: `/app` → redirect `/app/mission-control`; `/app/$theme` dashboard; `/app/$theme/project/$`;
  `/` currently redirects to `/app/mission-control` (K5 cutover — replace with the entrypoint below);
  `/settings` rebuilt as widgets; prototypes still live at `/designs/*` (do not touch).
- Theme tokens: each theme's `tokens.css` declares the full 38-token manifest under
  `[data-ww-theme="<slug>"]`; `custom.css` optional; harness requires all 38 via
  `scripts/widget-check/required-tokens.json` + `probes/token-completeness.mjs`.
- `next-themes` is already a dependency (catalog + packages/ui + apps/web).
- The bug string "Not a known project — it must live directly under a tracked directory." exists in
  packages/api (grep it). It fires from the mc-actions Generate report flow and/or project navigation
  when the path isn't a direct child of a tracked root. Reproduce first (grep + DOM + harness),
  then fix at the right layer (the actions widget must pass a REAL project path; if the router
  requires direct-child, validate/normalize input or surface an honest error with a picker —
  never a silent wrong-scope report).

## Deliverables

1. **Single entrypoint `/`**: imports the preset registry (glob — all presets discovered
   automatically) and renders the widget system for the SAVED theme (default mission-control when
   nothing saved). `/app/$theme` routes stay for explicit switching; `/` follows the saved selection.
2. **Persistence via next-themes**: saved preset slug + color scheme survive reload
   (localStorage through next-themes' storage manager is acceptable). A small **theme picker**
   (preset list + scheme toggle light/dark) lives in the system header (`render-layout` header or
   per-theme chrome header slot) — must work on every theme.
3. **Color schemes**: each preset may ship multiple CSS files (e.g. `tokens.css` +
   `tokens-light.css`/`tokens-dark.css` or `scheme-<name>.css`); the active scheme's file is
   loaded/swapped under the same `[data-ww-theme]` scope; switching is instant (no reload).
   Ship at least one light AND one dark demonstration (e.g. meadow light default + a dark variant;
   mission-control dark + a light variant) to prove the mechanism. All harness
   token-completeness runs must pass for every shipped scheme (update required-tokens runs if the
   probe needs scheme awareness — probe fixes allowed in scripts/widget-check/).
4. **Known-project bug**: reproduce, fix at the correct layer, add an honest error/picker if the
   path genuinely isn't a known project.
5. Keep: all wired functionality, harness green (`scripts/widget-check/run.mjs` per theme/page),
   `pnpm run check-types && pnpm build` green at every step. No deletions. Nothing destructive.
   Multiple turns allowed. Write progress notes to `.plans/session-widget-system/handoff-theme.md`
   as you go (state + decisions + gotchas) so a follow-up agent can continue without re-discovery.

## Gate (before final report)

`pnpm run check-types && pnpm build`; deploy loop
(`flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'`);
harness green on all 3 themes × dashboard (+ project for mission-control at least);
`/` renders the saved theme; scheme switch persists across reload; bug no longer reproduces.
