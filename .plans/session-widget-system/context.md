# Planning Brief — Widget/Part System for workspace-welcome

You are one of several planning specialists collaborating through file-based rounds in this directory. Read this brief fully before drafting. Your only writes go in this directory (.plans/session-widget-system/) — never modify repo code.

## Goal

The six design prototypes under `apps/web/src/routes/designs/` were exploration. The real redesign turns dashboards and project pages into **blank spaces populated by widgets**, backed by a common, DRY part system. This session produces the architecture + migration plan the owner will review.

## The owner's architecture spec (near-verbatim)

- Pages = blank spaces populated by widgets. **No inner scroll** anywhere.
- A **widget** has children: either widgets or parts.
- A widget is **resizable and draggable** unless nested inside another widget.
- Widgets get data via **context** (no props drilling); one common naming contract across all parts/widgets.
- Widgets accept **size-breakpoint content props**: `<Widget 2x2={...} 1x1={...}>`.
- A **part** is a content unit; parts can have parts as children.
- Parts must be as **common/DRY** as possible (e.g. bar and line charts = one part with a property). "Atomic design without the bullshit language."
- **Themes = presets of widgets + color schemes/CSS.** Custom classes are allowed but every part/widget must work without them.
- FUTURE (deferred — do not design now, but do not preclude): users compose their own widgets/pages, generation + self-rebuild, organization by context.

## Settled decisions (owner-approved — treat as constraints)

1. **Grid-snapped canvas** — drag/resize happen in cell units on a column grid (think 12-col), never free-form pixels.
2. **Page scrolls as one body; widgets NEVER scroll internally.** Widgets clamp content (carousel, tabs, "show more") beyond their size. Min-sizes derive from part min-content.
3. **Nesting = authored slots.** A widget inside a widget is a composite (fixed internal layout, authored); drag/resize applies only to top-level widgets.
4. **User-layout persistence is deferred.** Layout *definitions* must be declarative data (so persistence can bolt on later), but no editing/persistence machinery in this plan.
5. **Surviving themes: mission-control, bento, meadow.** Mission-bento retires; its best ideas (signal line, LED tiles) become parts available to all themes. Swiss/ledger stay benched on the branch.
6. **Size-class fallback = nearest-defined.** Widgets declare content for size classes they care about; unlisted sizes resolve down the ladder (1x1, 2x1, 2x2, 2x3, 3x3), never an error.
7. **Contexts (the four, these names):** `WorkspaceContext` (scan + roots + derived metrics), `ProjectContext` (one project: git mutations, branch, note, IDE, commitLog), `ReportContext` (one report export: data + missing/running/stale/fresh machine + regenerate), `SettingsContext` (editor/terminal/snitch).
8. **Canonical severity: `critical | warning | info`** everywhere; one mapper at the data boundary (scan `error`→`critical`, `warn`→`warning`).
9. **Charts: recharts everywhere with documented min-size floors.** Micro sizes fall back to non-chart presentation (numerals, LEDs). No second hand-rolled engine.
10. **Migration: a NEW page + new component tree for the system**; the three themes migrate onto it one after another (parallel implementation agents are fine) with a **compliance/validation agent at the end**; old design routes are deleted once everything is tested and working.
11. Planning runs as orchestrated consensus (you + peers, draft → review → refine rounds).

## Constraints (repo reality)

- TanStack Start (SSR), React 19, Tailwind v4, tRPC + TanStack Query, TypeScript strict (no `any`, `import type`, ordered imports). No DB; persistence = store.json via tRPC.
- Installed (latest majors, use them): `@tanstack/react-table@9`, `motion@13`, `react-resizable-panels@4`, `recharts@3`, `embla-carousel-react` (shadcn carousel in packages/ui). DnD for grid snapping is NOT yet installed — if the plan needs a library (e.g. dnd-kit), propose it explicitly with rationale; check `pnpm-workspace.yaml` catalog conventions first.
- Existing shared infra to build on (do not reinvent): `apps/web/src/lib/mosaic-layout/` (log-scale scoring + skyline packer), `apps/web/src/lib/forms/` (container-independent formedible flows), `@workspace-welcome/api/lib/report-staleness.ts`, the reports JSON API (`reports.generate/job/jsonExport/jsonExports/command`, `ReportExport` type), `packages/ui` shadcn-style components.
- The service runs a production build via systemd; the established verify loop is `flock /tmp/ww-redesign-build.lock sh -c 'pnpm build && systemctl --user restart workspace-welcome.service'` + browser screenshots. Agents in execution will have NO vision — plans must lean on DOM-measurement scripts and `pnpm run check-types` / `pnpm build` gates, not screenshots.

## Inputs

- `docs/research/widget-part-catalog.md` — THE raw material: ~48 parts (8 families), ~30 widgets, 18 common-part candidates, duplication matrix, data-layer map, theme-coupling inventory, min-content notes. Read it first.
- The six designs: `apps/web/src/components/designs/{mission-control,bento,meadow,mission-bento,swiss,ledger}/` + `apps/web/src/routes/designs/`.
- Shared: `apps/web/src/lib/`, `packages/api/src/lib/`, `packages/ui/src/components/`.

## Output requirements (orchestration-compatible)

The master plan (synthesized later from your refined plans) must be executable by dispatchers without questions: every phase needs type (Sequential/Parallel), specific requirements, exact inputs/outputs (files), validation criteria, dependencies, gatekeeping commands (`pnpm run check-types`, `pnpm build`). Phases ≤ ~15 files / ~500 lines each — split bigger ones. Parallel phases need a phase-wide validation section.

## Round protocol (this session)

Draft → cross-review → refine, coordinated by files in this directory (poll with sleep, never busy-wait; cap waits ~30 min and proceed with what exists). Update `status.yaml` as you complete phases. Address conflicts explicitly — disagreement is fine, silence is not.
