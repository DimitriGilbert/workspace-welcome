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
import type { ConsoleView } from "@/components/widgets/render-layout";
import type { PageLayout, WidgetNode } from "@/lib/widget/layout-types";
import { SIZE_LADDER, parseSize, rankOf } from "@/lib/widget/size-class";
import type { SizeClass } from "@/lib/widget/size-class";
import { widgetRegistry } from "@/components/widgets/registry";

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
    // Rungs below a kind's authored floor would fail validate-layout's min
    // check (e.g. mc-actions min "2x1") — the lab exercises every LEGAL
    // rung, which is the placement contract the ladder exists to prove.
    const minRank = rankOfSizeClass(def.min);
    for (const rung of SIZE_LADDER) {
      if (rankOfSizeClass(rung) < minRank) continue;
      nodes.push({ id: `lab-${id}-${rung}`, widget: id, size: rung });
    }
  }
  return nodes;
}

/** The ladder's deterministic order (`rankOf`) as a comparable rank. */
function rankOfSizeClass(size: SizeClass | undefined): number {
  if (size === undefined) return 0;
  const parsed = parseSize(size);
  return parsed === null ? 0 : rankOf(parsed);
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
