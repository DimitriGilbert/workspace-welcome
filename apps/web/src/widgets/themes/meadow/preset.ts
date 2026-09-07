/**
 * Meadow's theme preset (master plan §5 T1-meadow shell, populated at
 * T2-meadow; the project page at T3-meadow; dashboard reworked after the
 * owner's verdict on the T2 split — the context rail is gone, every digest
 * is its own widget kind; project reworked after the owner's bento order —
 * the tabbed body is a first-class widget at two-thirds width with the
 * identity, glance, and tabbed-report cards packing the right rail down the
 * full 12-row board).
 *
 * The dashboard composes the design route's surfaces as canvas widgets:
 * the masthead row (greeting + counts + search) and the attention band are
 * theme kinds in their own stack regions; the recency mosaic is ONE kind —
 * `meadow-project-bento` (owner order: the project bento is a widget, never
 * free-floating tiles) at 8 of 12 columns, running the shared `"projects"`
 * flow generator as internal content on a dense CSS mosaic; and the five
 * workspace digests (report / momentum / rhythm / stacks / directories) are
 * the only non-project content, stacked in the last 1/3 rail to the same
 * row count — the band packs with no remainder on desktop.
 *
 * Mosaic spans. Inside the bento the canonical ladder rungs map to even
 * spans on an internal 12-column grid (hero 4x3, feature 4x2, large 2x2,
 * medium 2x1, compact 1x1) with `grid-flow-row-dense` closing holes; the
 * fractional `minmax` row unit makes the mosaic fill the shell box exactly
 * at any project count. The tile kind reads its tier off the span
 * footprint (`tile.tsx` `tierOf`), so bodies follow the rungs unchanged.
 *
 * Constants ported from the design: `routes/designs/meadow/index.tsx`
 * `useMosaicConfig` steps the mosaic 2 → 8 → 12 columns (≥768 / ≥1280)
 * and `meadow.css` `.meadow-mosaic` steps the row unit 84px → 100px →
 * 104px at the same breakpoints — 104 is the desktop density (§3.3:
 * 92–104 px observed; the phone 84px sits below the ladder floor by
 * design, the runtime's cell unit is the desktop row).
 */
import "./tokens.css";

import type { ThemeScheme, ThemePreset } from "@/widgets/themes";

const COLUMNS = { desktop: 12, tablet: 8, phone: 2 } as const;

const CELL = { h: 104 } as const;

/**
 * Meadow's color schemes (owner order: light AND dark). `daylight` is the
 * design's warm cream ground (tokens.css, the bundled default); `nightfall`
 * re-declares the full manifest — meadow ride-alongs included — as a dark
 * night-garden variant under `scheme-nightfall.css`.
 */
const SCHEMES: readonly ThemeScheme[] = [
  { id: "daylight", label: "Daylight (light)", appearance: "light" },
  { id: "nightfall", label: "Nightfall (dark)", appearance: "dark", css: "nightfall" },
];

export const meadowPreset: ThemePreset = {
  id: "meadow",
  label: "Meadow",
  schemes: SCHEMES,
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
        kind: "stack",
        id: "board",
        widgets: [
          // The mosaic is a WIDGET (owner order: "bento of project is a
          // widget and NOT free floating projects AND IS 2/3+"): one
          // `meadow-project-bento` kind owns the recency mosaic at 8 of 12
          // columns, and the last 1/3 rail holds ONLY the non-project
          // digests — report, momentum, rhythm, stacks, directories —
          // stacked to the exact same 13 rows, so the band packs with no
          // remainder on desktop. At 8 columns the bento clamps to full
          // width and the rail re-packs as side-by-side pairs beneath it;
          // at 2 columns everything stacks. No flow region: free project
          // tiles on the canvas cease to exist (the bento kind runs the
          // shared "projects" flow generator internally).
          { id: "project-bento", widget: "meadow-project-bento", size: "8x13" },
          { id: "digest-report", widget: "meadow-report", size: "4x5" },
          { id: "digest-momentum", widget: "meadow-momentum", size: "4x2" },
          { id: "digest-rhythm", widget: "meadow-rhythm", size: "4x2" },
          { id: "digest-stacks", widget: "meadow-stacks", size: "4x2" },
          {
            id: "digest-directories",
            widget: "meadow-directories",
            size: "4x2",
          },
        ],
      },
    ],
  },
  project: {
    version: 1,
    context: "project",
    columns: { ...COLUMNS },
    cell: { ...CELL },
    // The bento IS a widget (owner order): the tabbed project body takes
    // 8 of 12 columns — two thirds — and the other project kinds pack the
    // right-hand 4-column rail in reading order: identity over the report
    // glance over the tabbed report itself (the page's repo-scope
    // ReportProvider feeds it, and MeadowReportDigest titles it "Project
    // report" there). The band sums to 12 mosaic rows on desktop — the
    // board reaches the viewport floor at 1440 with the bento's tabbed
    // sections at full-room height instead of stranding the bottom half in
    // bare ground (owner fill law). At 8 columns the bento clamps to full
    // width and the rail cards re-pack as side-by-side pairs beneath it;
    // at 2 columns everything stacks.
    regions: [
      {
        kind: "stack",
        id: "bento",
        widgets: [
          { id: "meadow-project-sections", widget: "meadow-project-sections", size: "8x12" },
          { id: "meadow-project-header", widget: "meadow-project-header", size: "4x4" },
          { id: "meadow-project-stats", widget: "meadow-project-stats", size: "4x4" },
          { id: "meadow-project-report", widget: "meadow-report", size: "4x4" },
        ],
      },
    ],
  },
};

export default meadowPreset;
