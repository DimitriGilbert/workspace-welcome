/**
 * Mission Control's theme preset (master plan §5 T1/T2).
 *
 * T2 dashboard port: the design's 3-zone console identity — a command band
 * (masthead vitals + the command bar), the fleet stage (triage board over
 * the ledger), the context zone (the tabbed root report) and the analytics
 * column (heatmap, donuts, dirty leaders, roots) — composed as stack
 * regions per §3.3 on the design's 12 column / 96px cell grid. Zones are
 * authored as sizes + reading order, NOT `at` anchors: the packer's fixed
 * anchors are exact at every width (x clamped, y kept), so side-by-side
 * anchored zones collide once the viewport reflows to 8/4 columns — while
 * the deterministic skyline packs this exact reading order into the same
 * coordinates on desktop (9+3 command row; 7 | 3 | 2 console bands) and
 * re-packs cleanly below. The stage keeps the console's rhythm: triage (3
 * rows) rides the ledger, and the console's panels-percentage geometry
 * (56/24/20) maps to the 7/3/2 column zones.
 *
 * The project page stays an empty shell (valid `PageLayout`, zero regions)
 * until T3.
 *
 * The scope tokens ship as real mc values (`./tokens.css`, loaded from this
 * module — the one per-theme module the preset glob always evaluates); the
 * chrome skin rides `./custom.css` (dropped by `?bare=1`).
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
        id: "command",
        widgets: [
          { id: "masthead", widget: "mc-vitals", size: "9x2" },
          { id: "command-bar", widget: "mc-command-bar", size: "3x2" },
        ],
      },
      {
        kind: "stack",
        id: "console",
        widgets: [
          // Fleet stage (cols 1-7): triage rides the ledger, the design's
          // overview rhythm.
          { id: "triage", widget: "mc-triage", size: "7x3" },
          { id: "ledger", widget: "mc-fleet-ledger", size: "7x14" },
          // Context zone (cols 8-10): the root report, one widget per design
          // section — activity (graph|table), AI usage, health, code.
          { id: "report-activity", widget: "mc-report-activity", size: "3x6" },
          { id: "report-ai", widget: "mc-report-ai", size: "3x4" },
          { id: "report-health", widget: "mc-report-health", size: "3x4" },
          { id: "report-code", widget: "mc-report-code", size: "3x5" },
          // Analytics column (cols 11-12): heatmap, donuts, dirty leaders,
          // roots — the design's side zone, top to bottom.
          { id: "activity-heatmap", widget: "mc-activity-heatmap", size: "2x4" },
          { id: "alerts-donut", widget: "mc-alerts-donut", size: "2x5" },
          { id: "stack-mix", widget: "mc-stack-mix", size: "2x4" },
          { id: "dirty-leaders", widget: "mc-dirty-leaders", size: "2x3" },
          { id: "roots", widget: "mc-roots", size: "2x4" },
        ],
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
