/**
 * Mission Control's theme preset (master plan §5 T1/T2).
 *
 * T2 dashboard port, owner-modded arrangement: the command register (sync
 * clock, Actions menu, Rescan, Settings) rides the COMMON page header
 * (`ThemePreset.headerCommand`) beside the common filter, and the masthead
 * vitals band spreads edge to edge as the board's first row — no filter,
 * action or command rows float on the canvas. The console region packs the
 * owner's FINAL board (`final-GETTING.jpeg`, 12 rows on desktop, holes
 * intentional): masthead vitals, triage (3) and the fleet ledger (8) on the
 * left; activity (3), code (3) and the dirty-leaders | alerts pair (3) in
 * the centre; AI usage (5) with the health (3) | stack-mix (4) pair on the
 * right — the centre and right bands stop at row 9 and the empty cells
 * below them stay empty (authored anchors, never filled). The heatmap and
 * roots kinds stay registered but off this board.
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
import type { ThemeScheme, ThemePreset } from "@/widgets/themes";

import { McCommandRegister } from "./widgets/command-bar";

const COLUMNS = { desktop: 12, tablet: 8, phone: 4 } as const;

const CELL = { h: 96 } as const;

/**
 * The console's color schemes (owner order: light AND dark). `console` is
 * the design's near-black terminal (tokens.css, the bundled default);
 * `daylight` re-declares the full manifest — mc ride-alongs included — in
 * the same hues at light registers under `scheme-daylight.css`.
 */
const SCHEMES: readonly ThemeScheme[] = [
  { id: "console", label: "Console (dark)", appearance: "dark" },
  { id: "daylight", label: "Daylight (light)", appearance: "light", css: "daylight" },
];

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
  schemes: SCHEMES,
  // Owner mod 1: the command register (sync clock, Actions, Rescan,
  // Settings) is header chrome — it renders at the common page header's
  // right edge, and the canvas renders no command row at all.
  headerCommand: McCommandRegister,
  dashboard: {
    // Format v2: this page carries per-breakpoint `tablet` overrides (the
    // 8-column board re-bands to flush full/half rows). No layout
    // persistence exists, so the version marks the format generation only.
    version: 2,
    context: "workspace",
    columns: { ...COLUMNS },
    cell: { ...CELL },
    regions: [
      {
        kind: "stack",
        // ONE droppable surface: the masthead vitals band is the console
        // region's first row, so a widget can be dropped anywhere on the
        // board — onto or beside the vitals — and the band yields like any
        // free widget (owner round 3). The console views (attention/pinned/
        // archive) filter this single region, so the vitals figure band
        // persists across views exactly like the design's sticky header.
        //
        // THE FINAL OWNER ARRANGEMENT (final-GETTING.jpeg — the exact board
        // to author, holes included): three 4-column bands over 12 rows.
        // Left: masthead, triage (3), the ledger (8) running to the board
        // floor. Centre: activity (3), code (3), the dirty|alerts pair (3).
        // Right: AI usage (5), then health (3) beside stack mix (4) — stack
        // one row deeper, health's cells beneath it left open. The centre
        // and right bands STOP at row 9: the empty cells below them are the
        // owner's intentional holes — authored as anchors, never filled.
        // Anchors pin the desktop board; the narrower boards re-pack through
        // the v2 size overrides (the anchors cannot re-band).
        id: "console",
        widgets: [
          { id: "masthead", widget: "mc-vitals", size: "4x1", tablet: "8x1", at: { x: 0, y: 0 } },
          { id: "activity", widget: "mc-report-activity", size: "4x3", tablet: "4x4", at: { x: 4, y: 0 } },
          { id: "report-ai", widget: "mc-report-ai", size: "4x5", tablet: "4x4", at: { x: 8, y: 0 } },
          { id: "triage", widget: "mc-triage", size: "4x3", tablet: "4x4", at: { x: 0, y: 1 } },
          { id: "report-code", widget: "mc-report-code", size: "4x3", tablet: "4x4", at: { x: 4, y: 3 } },
          { id: "ledger", widget: "mc-fleet-ledger", size: "4x8", tablet: "8x8", at: { x: 0, y: 4 } },
          { id: "dirty-leaders", widget: "mc-dirty-leaders", size: "2x3", tablet: "4x5", at: { x: 4, y: 6 } },
          { id: "alerts-donut", widget: "mc-alerts-donut", size: "2x3", tablet: "4x5", at: { x: 6, y: 6 } },
          { id: "report-health", widget: "mc-report-health", size: "2x3", tablet: "4x5", at: { x: 8, y: 5 } },
          { id: "stack-mix", widget: "mc-stack-mix", size: "2x4", tablet: "4x5", at: { x: 10, y: 5 } },
        ],
      },
    ],
  },
  project: {
    version: 2,
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
          // The design's overview row: the commit pulse beside the recent
          // commits ledger; the report channels re-run against this
          // project's repo-scope report beneath. Tablet re-bands the 6/7-wide
          // spans (which strand a 1-2 col void on 8 columns) into pairs and
          // full-width bands that tile flush.
          { id: "commit-pulse", widget: "mc-project-pulse", size: "6x4", tablet: "4x4" },
          { id: "recent-commits", widget: "mc-project-commits", size: "6x4", tablet: "4x4" },
          { id: "report-activity", widget: "mc-report-activity", size: "7x5", tablet: "8x5" },
          { id: "report-ai", widget: "mc-report-ai", size: "5x4", tablet: "4x4" },
          { id: "report-health", widget: "mc-report-health", size: "5x4", tablet: "4x4" },
          { id: "report-code", widget: "mc-report-code", size: "7x5", tablet: "8x5" },
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
