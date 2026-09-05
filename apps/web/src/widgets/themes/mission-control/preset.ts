/**
 * Mission Control's skeleton theme preset (master plan §5 M3).
 *
 * The walking skeleton's placement target: the dashboard is one stack region
 * holding one vitals node — the minimum a theme page needs to prove contexts
 * → runtime → parts compose on the real route. The project page is an empty
 * shell (valid `PageLayout`, zero regions): nothing is drawn because nothing
 * is authored, and the T1/T2/T3-mc waves replace both layouts with the real
 * presets. The scope tokens ship as skeleton aliases (`./tokens.css`, loaded
 * from this module — the one per-theme module the preset glob always
 * evaluates); T1-mc replaces both layouts and the token values.
 */
import "./tokens.css";

import type { ThemePreset } from "@/widgets/themes";

const COLUMNS = { desktop: 12, tablet: 8, phone: 4 } as const;

const CELL = { h: 96 } as const;

export const missionControlPreset: ThemePreset = {
  id: "mission-control",
  label: "Mission Control",
  dashboard: {
    version: 1,
    context: "workspace",
    columns: { ...COLUMNS },
    cell: { ...CELL },
    regions: [
      {
        kind: "stack",
        id: "vitals",
        widgets: [{ id: "fleet-vitals", widget: "vitals-skeleton", size: "3x3" }],
      },
    ],
  },
  project: {
    version: 1,
    context: "project",
    columns: { ...COLUMNS },
    cell: { ...CELL },
    regions: [],
  },
};

export default missionControlPreset;
