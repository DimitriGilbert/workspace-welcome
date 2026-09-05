/**
 * Meadow's theme preset (master plan §5 T1-meadow shell, populated at
 * T2-meadow).
 *
 * The dashboard ports the design route's surfaces widget-for-widget:
 * the masthead row (greeting + counts + search) and the attention band are
 * theme kinds in their own stack regions, the recency-sized project grid is
 * the `"projects"` flow (the shared algo sizes every tile off the canonical
 * ladder — meadow's hero/feature/large/medium/compact tiers), and the
 * context panel is a theme kind below the mosaic carrying the workspace
 * report + the momentum/rhythm/stacks/directories digests. The design's
 * resizable two-panel split (mosaic | context) lives INSIDE the context
 * kind as a react-resizable-panels composition, because the runtime's
 * region grids stack vertically — the design's narrow presentation, with
 * the desktop drag identity preserved in the kind.
 *
 * Constants ported from the design: `routes/designs/meadow/index.tsx`
 * `useMosaicConfig` steps the mosaic 2 → 8 → 12 columns (≥768 / ≥1280)
 * and `meadow.css` `.meadow-mosaic` steps the row unit 84px → 100px →
 * 104px at the same breakpoints — 104 is the desktop density (§3.3:
 * 92–104 px observed; the phone 84px sits below the ladder floor by
 * design, the runtime's cell unit is the desktop row).
 */
import "./tokens.css";

import type { ThemePreset } from "@/widgets/themes";

const COLUMNS = { desktop: 12, tablet: 8, phone: 2 } as const;

const CELL = { h: 104 } as const;

export const meadowPreset: ThemePreset = {
  id: "meadow",
  label: "Meadow",
  dashboard: {
    version: 1,
    context: "workspace",
    columns: { ...COLUMNS },
    cell: { ...CELL },
    regions: [
      {
        kind: "stack",
        id: "masthead",
        widgets: [
          { id: "meadow-header", widget: "meadow-header", size: "12x1" },
        ],
      },
      {
        kind: "stack",
        id: "attention",
        widgets: [
          { id: "meadow-attention", widget: "meadow-attention", size: "12x1" },
        ],
      },
      {
        kind: "flow",
        id: "projects",
        from: "projects",
        template: { widget: "project-tile" },
      },
      {
        kind: "stack",
        id: "context",
        widgets: [
          { id: "meadow-context", widget: "meadow-context", size: "12x6" },
        ],
      },
    ],
  },
  project: {
    version: 1,
    context: "project",
    columns: { ...COLUMNS },
    cell: { ...CELL },
    // Same shell; meadow's project kinds land at T3.
    regions: [{ kind: "stack", id: "project", widgets: [] }],
  },
};

export default meadowPreset;
