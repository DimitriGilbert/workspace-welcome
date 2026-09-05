/**
 * Meadow's theme preset (master plan §5 T1-meadow).
 *
 * T1 ships the shells only: grid geometry and density are meadow's real
 * constants, both pages are empty-region `PageLayout`s — one empty stack
 * region each (empty is honest, because meadow's widgets land at T2
 * dashboard-side and T3 project-side). The scope tokens ship as the real
 * ported values (`./tokens.css`, loaded from this module — the one
 * per-theme module the preset glob always evaluates).
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
    // One empty stack region: a real grid for the board, zero widgets until T2.
    regions: [{ kind: "stack", id: "dashboard", widgets: [] }],
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
