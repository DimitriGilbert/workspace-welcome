/**
 * The widget-lab's synthetic preset (master plan §5 W4).
 *
 * The lab is the runtime's exercise bench: one stack region placing EVERY
 * registered widget at EVERY ladder rung (the resolveSizeClass + packGrid +
 * placement-contract workout), plus a `"projects"` flow region so generator
 * resolution runs inside the real provider stack. It is a genuine
 * `PageLayout`, so `validate-layout` (grep-invariant #6) checks it exactly
 * like a theme preset — the runner loads this module as a fixture.
 */
import type { ConsoleView } from "../runtime/render-layout";
import type { PageLayout, WidgetNode } from "../runtime/layout-types";
import { SIZE_LADDER } from "../runtime/size-class";
import { widgetRegistry } from "../registry";

/** The lab scope's slug — `lab-tokens.css` declares its fallback tokens. */
export const LAB_THEME = "__lab";

export const LAB_COLUMNS = { desktop: 12, tablet: 8, phone: 4 } as const;

/**
 * Workspace kinds: one instance per ladder rung (the resolveSizeClass
 * workout). Project-requiring kinds are page-composite widgets (state
 * bands, report consoles) whose interiors do not degrade to tile rungs —
 * they are excluded here and exercised where they live: their theme
 * presets (V3 harness runs) and validate-layout (covers requires:["project"]
 * resolution, 37 kinds).
 */
function ladderCatalogNodes(): WidgetNode[] {
  const nodes: WidgetNode[] = [];
  for (const [id, def] of widgetRegistry) {
    if (def.requires.includes("project")) continue;
    for (const rung of SIZE_LADDER) {
      nodes.push({ id: `lab-${id}-${rung}`, widget: id, size: rung });
    }
  }
  return nodes;
}

export const labPreset: PageLayout = {
  version: 1,
  // Project scope: ProjectProvider nests WorkspaceProvider, so this
  // satisfies workspace-only kinds AND honest requires:["project"] kinds.
  context: "project",
  columns: { ...LAB_COLUMNS },
  cell: { h: 96 },
  regions: [
    { kind: "stack", id: "ladder", widgets: ladderCatalogNodes() },
    {
      kind: "flow",
      id: "project-tiles",
      from: "projects",
      template: { widget: "project-tile" },
    },
  ],
};

/**
 * Digit-switchable console views (keys 1..N, Escape restores "all") — the
 * use-console-keys `views` contract's live consumer.
 */
export const labConsoleViews: readonly ConsoleView[] = [
  { id: "all", label: "All" },
  { id: "ladder", label: "Ladder", regions: ["ladder"] },
  { id: "project-tiles", label: "Flow", regions: ["project-tiles"] },
];
