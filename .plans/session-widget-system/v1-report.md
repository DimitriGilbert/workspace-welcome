# V1 — Wave-1 validator report (master plan §5 V1)

Branch `widgets/system` @ `aebe669` (T1-mc `3406fe2`, T1-bento `a18f857`, T1-meadow `b2aeacb`, P5 `e54e648`, D8 `5c5036b`, P4-fix `aebe669` all landed and committed). One deploy performed (`flock /tmp/ww-redesign-build.lock` build + `systemctl --user restart workspace-welcome.service`; service active, `/` → 200). Base URL `http://192.168.1.41:37420`.

## PASS/FAIL table

| # | Check | Probe / command | Result |
|---|-------|-----------------|--------|
| 1 | Tree state: typecheck | `pnpm run check-types` | **PASS** (all 5 packages, 0 errors) |
| 2 | Tree state: build | `pnpm build` | **PASS** (all packages) |
| 3 | Deploy | `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'` | **PASS** (one deploy; service `active`, HTTP 200) |
| 4 | Harness: mission-control dashboard | `run.mjs --theme mission-control --page dashboard` | **PASS** — 6 pass, 0 fail, 0 warn |
| 5 | Harness: bento dashboard | `run.mjs --theme bento --page dashboard` | **PASS** — 5 pass, 0 fail, 1 warn |
| 6 | Harness: meadow dashboard | `run.mjs --theme meadow --page dashboard` | **PASS** — 5 pass, 0 fail, 1 warn |
| 7 | Token completeness ×3 | included in runs 4–6 | **PASS** ×3 — "all 38 manifest tokens present" (mc 47 / bento 40 / meadow 42 declared on scope); part-min: "all 38 tokens resolve non-empty" ×3 — real values, not skeleton aliases |
| 8 | Registry/preset id resolution | grep presets vs `widgets/registry.ts` | **PASS** — only preset widget node is mc dashboard `vitals-skeleton` → registered (mc `themes/mission-control/widgets/index.ts`); bento/meadow presets ship empty stack regions (0 widget nodes, T2/T3 land them); lab preset iterates `widgetRegistry.keys()` (trivially resolving) + core `project-tile` |
| 9 | requires ⊆ provider stack | preset `context` vs `WidgetDef.requires` | **PASS** — mc dashboard `context: "workspace"`, `vitals-skeleton.requires: ["workspace"]` ⊆ stack; D8 shells mounted (widget rendered live data on the board, board part-min green); bento/meadow have no widget nodes |
| 10 | Legacy sentinel | `legacy-sentinel.mjs` | **PASS** — 3 pass, 0 fail, 0 warn (legacy root, `/designs/mission-control`, dialog portal outside theme scope) |
| 11 | Parts-preview suite | `run.mjs --suite parts-preview` | **FAIL** — 0 pass, 3 fail: `part-min [bento|meadow|mission-control] part project-pulse renders 54px wide < data-part-min-w 64px` |

Harness warn notes (non-blocking): bento/meadow `portal-scope` "no open portal content to inspect" (no portal opened at T1; scope `--background` resolved oklch values were still verified); bento/meadow board reports `0 widgets` — expected at T1, their presets are empty-region shells by design until T2/T3.

## Defects (fix-dispatch)

### D1 — parts-preview floor box undershoots the declared part min (owner: **P5**) — blocks check 11

- Probe: `node scripts/widget-check/run.mjs --suite parts-preview --base-url http://192.168.1.41:37420` → `FAIL part-min <theme> part project-pulse renders 54px wide < data-part-min-w 64px` on all 3 theme scopes.
- Root cause (DOM-eval verified on the live page): `FloorCell` in `apps/web/src/routes/parts-preview.tsx` sizes the "exact MIN_CONTENT box" to `min` (64px) as **border-box** but then adds `p-1` + 1px border chrome (`className="overflow-hidden border border-border p-1"`). The `definePart`-stamped part root (`ProjectPulse`, span, `data-part-min-w="64"` from `PulseStrip`'s `MIN_CONTENT = { w: 64, h: 12 }` in `packages/ui/src/components/pulse-strip.tsx`) fills the remaining content box: 64 − 8 (padding) − 2 (border) = **54px**. The P5-finalized probe (`scripts/widget-check/probes/part-min.mjs`, `rect.width < minW - 1`) measures the stamped element's rect → FAIL. All ladder-rung cells pass (86px content at 1x1); only the exact floor cell fails, ×3 because the preview repeats the parts section per theme scope.
- Suggested fix (P5's file, not the part): compensate `FloorCell`'s box for its own chrome (size to `min.w + 10` / `min.h + 10` for `p-1`+border), or drop padding/border from the floor cell so its border-box equals `min`. Alternative (rejected as ownership): have `ProjectPulse` enforce `minWidth: 64` on its root — but `data-part-min-*` is contractualized as advisory (see header of `apps/web/src/widgets/parts/registry.ts`), and P5 authored both the floor cell and the probe; they must agree. Not a P4 defect: the declared 64×12 min is correct and honored at every placement rung.

## Cross-theme commonality

- **3/3 themes resolve tokens** — token-completeness PASS on mission-control (47 declared), bento (40), meadow (42); part-min confirms all 38 manifest tokens resolve to non-empty values on every theme scope.
- **0 local part implementations** — `grep -rEl "svg|<table|useForm|Chart|DataTable|<form" apps/web/src/widgets/themes/` → no matches. Charts, tables, form flows, pulse/LED/stat primitives live only in `packages/ui` + `widgets/parts/**`.
- Import surface of `widgets/themes/**` (all files): `@workspace-welcome/ui/*`, `@/widgets/registry` (types/defs), `@/widgets/contexts/*`, `@/widgets/runtime/*`, `@/widgets/themes` (preset type), `@/lib/scan-metrics` (the plan-designated shared metric module), relative theme-local files — compositions only. Mission-control's `vitals-skeleton.tsx` composes ui `Stat`/`VitalsBand` inside `WidgetShell` with authored ladder rungs (no local part logic); bento/meadow `widgets/index.ts` export empty `widgetDefs` (T2/T3 land their kinds); every theme `preset.ts` only imports its `tokens.css` + the `ThemePreset` type.

## Verdict

**V1: FAIL** — 10/11 checks PASS; 1 defect (D1, owner P5, `apps/web/src/routes/parts-preview.tsx` `FloorCell`) blocks the parts-preview suite. Re-run of check 11 only is sufficient after the fix lands; all other results stand for this tree (`aebe669`).

Untracked note: `TEST-ALIGNMENT-PLAN.md` sits untracked at repo root (not created by this validator; not a phase artifact). Not committed, per instructions.
