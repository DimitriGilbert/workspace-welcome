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
 * The project page (T3) ports the design project readout
 * (`routes/designs/mission-control/project.$.tsx`) onto the same grid: the
 * full-width state band (git controls, project facts, last commit, history,
 * alerts strip), the readout zone (commit pulse beside the four report
 * channels — the T2 `mc-report-*` kinds reused on the per-project
 * `ReportContext` scope the page stack mounts), then the working surface
 * (the note beside the files/artifacts/ideation console, whose shell tabs
 * are the design's console tabs). Reading-order packing again — the
 * console's 56/24/20 percentage geometry maps to the 3/5/4 and 4/4/4
 * column bands.
 *
 * The scope tokens ship as real mc values (`./tokens.css`, loaded from this
 * module — the one per-theme module the preset glob always evaluates); the
 * chrome skin rides `./custom.css` (dropped by `?bare=1`).
 */
import "./tokens.css";

import type { ConsoleView } from "@/widgets/runtime/render-layout";
import type { ThemePreset } from "@/widgets/themes";

const COLUMNS = { desktop: 12, tablet: 8, phone: 4 } as const;

const CELL = { h: 96 } as const;

/**
 * The console's digit-switchable views — exactly the fleet views the design
 * declares (`ViewId` in `components/designs/mission-control/metrics.ts`,
 * labeled per its nav rail). Overview is the full console and the `Escape`
 * default; the three fleet views narrow the board to the console stage —
 * triage (the design's one attention surface), the ledger, the context zone
 * and analytics — dropping the command band. Per-view project filtering is a
 * nav-level concern, NOT re-invented as board content: region visibility is
 * the board's honest view contract, so attention/pinned/archive share the
 * stage region and differ by declared id/tab state.
 */
const CONSOLE_VIEWS: readonly ConsoleView[] = [
  { id: "overview", label: "Overview" },
  { id: "attention", label: "Attention", regions: ["console"] },
  { id: "pinned", label: "Pinned", regions: ["console"] },
  { id: "archive", label: "Archive", regions: ["console"] },
];

export const missionControlPreset: ThemePreset = {
  id: "mission-control",
  label: "Mission Control",
  consoleViews: CONSOLE_VIEWS,
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
    regions: [
      {
        kind: "stack",
        id: "state",
        widgets: [
          { id: "state-band", widget: "mc-project-state-band", size: "12x4" },
        ],
      },
      {
        kind: "stack",
        id: "readout",
        widgets: [
          // The commit pulse rides the design's overview rhythm; the report
          // channels re-run against this project's repo-scope report.
          { id: "commit-pulse", widget: "mc-project-pulse", size: "3x4" },
          { id: "report-activity", widget: "mc-report-activity", size: "5x6" },
          { id: "report-ai", widget: "mc-report-ai", size: "4x4" },
          { id: "report-health", widget: "mc-report-health", size: "4x4" },
          { id: "report-code", widget: "mc-report-code", size: "4x4" },
        ],
      },
      {
        kind: "stack",
        id: "console",
        widgets: [
          { id: "note", widget: "mc-project-note", size: "4x3" },
          { id: "working-surface", widget: "mc-project-console", size: "12x7" },
        ],
      },
    ],
  },
};

export default missionControlPreset;
