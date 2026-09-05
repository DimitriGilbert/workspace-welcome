/**
 * Bento's theme preset (master plan §5 T1-bento).
 *
 * T1 ships the shells only: the grids and density are bento's real constants,
 * both pages are empty-region `PageLayout`s — one empty stack region each
 * (empty is honest, because bento's widgets land at T2 dashboard-side and T3
 * project-side). The scope tokens ship as the real ported values
 * (`./tokens.css`, loaded from this module — the one per-theme module the
 * preset glob always evaluates).
 *
 * Grid constants ported from `components/designs/bento/bento.css`:
 * the band grid steps 2 → 6 → 12 columns (≥1024 / ≥1536) and the project
 * mosaic is a fixed 12-column grid; the mosaic row unit is 92px below 1024px
 * and 96px above — 96 is the desktop density. The runtime's three breakpoint
 * buckets carry bento's three grid widths in order.
 */
import "./tokens.css";

import type { ThemePreset } from "@/widgets/themes";

const COLUMNS = { desktop: 12, tablet: 6, phone: 2 } as const;

const CELL = { h: 96 } as const;

export const bentoPreset: ThemePreset = {
  id: "bento",
  label: "Bento",
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
    // Same shell; bento's project kinds land at T3.
    regions: [{ kind: "stack", id: "project", widgets: [] }],
  },
};

export default bentoPreset;
