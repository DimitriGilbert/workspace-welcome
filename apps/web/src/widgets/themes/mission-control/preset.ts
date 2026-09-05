/**
 * Mission Control's theme preset (master plan §5 T1).
 *
 * Real `ThemePreset` shell: grid geometry from the design's console — a
 * 12-column desktop stage (8 tablet / 4 phone) at the console's dense 96 px
 * row unit (§3.3: 92–104 px observed; mc sits mid-range, matching the M3
 * gate density). T1 ships empty-region layouts — the dashboard may keep the
 * M3 skeleton vitals widget as its single stack region until T2 ports the
 * real dashboard widget-for-widget; the project page stays an empty shell
 * (valid `PageLayout`, zero regions) until T3.
 *
 * The scope tokens ship as real mc values (`./tokens.css`, loaded from this
 * module — the one per-theme module the preset glob always evaluates).
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
