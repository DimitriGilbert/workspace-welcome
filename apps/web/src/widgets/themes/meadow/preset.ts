/**
 * Meadow's theme preset (master plan §5 T1-meadow shell, populated at
 * T2-meadow; the project page at T3-meadow; dashboard reworked after the
 * owner's verdict on the T2 split — the context rail is gone, every digest
 * is its own widget kind).
 *
 * The dashboard composes the design route's surfaces as canvas widgets:
 * the masthead row (greeting + counts + search) and the attention band are
 * theme kinds in their own stack regions, the recency-sized project grid is
 * the `"projects"` flow (the shared algo sizes every tile off the canonical
 * ladder — meadow's tiers remapped to even spans, see below), and the five
 * workspace digests (report / momentum / rhythm / stacks / directories)
 * follow as individual kinds in the `"digests"` band region — the design's
 * context content, now ordinary placeable widgets instead of one monolithic
 * panel.
 *
 * Tier span mapping. The canonical ladder (3x3 hero → 1x1 compact) tiles
 * 12 columns only for lucky tier mixes — odd spans leave unfillable
 * one-column remainders that read as holes (the owner's screenshot). The
 * template remaps every tier to an EVEN span, so each breakpoint's row
 * width (12/8/2) is a sum of 4s and 2s and the packer's line-filling rule
 * always completes a row: hero 4x3, feature 4x2, large 2x2, medium 2x1,
 * compact 2x1. The tile kind reads its tier off the footprint
 * (`tile.tsx` `tierOf`), so bodies follow the rungs unchanged.
 *
 * Constants ported from the design: `routes/designs/meadow/index.tsx`
 * `useMosaicConfig` steps the mosaic 2 → 8 → 12 columns (≥768 / ≥1280)
 * and `meadow.css` `.meadow-mosaic` steps the row unit 84px → 100px →
 * 104px at the same breakpoints — 104 is the desktop density (§3.3:
 * 92–104 px observed; the phone 84px sits below the ladder floor by
 * design, the runtime's cell unit is the desktop row). The digest band
 * steps its row unit to 148px (`custom.css`) to host the cards' cadence.
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
        template: {
          widget: "meadow-project-tile",
          ladders: {
            "3x3": ["4x3"],
            "2x3": ["4x2"],
            "2x2": ["2x2"],
            "2x1": ["2x1"],
            "1x1": ["2x1"],
          },
        },
      },
      {
        kind: "stack",
        id: "digests",
        widgets: [
          { id: "digest-report", widget: "meadow-report", size: "12x3" },
          { id: "digest-momentum", widget: "meadow-momentum", size: "12x1" },
          { id: "digest-rhythm", widget: "meadow-rhythm", size: "12x1" },
          { id: "digest-stacks", widget: "meadow-stacks", size: "12x1" },
          {
            id: "digest-directories",
            widget: "meadow-directories",
            size: "12x1",
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
    // The design project page (`routes/designs/meadow/project.$.tsx`) as
    // three stacked full-width rows: the identity header, the report
    // stat strip, and the soft tabbed sections (12 rows tall — the 104px
    // desktop unit keeps the cadence chart and file browser definite).
    regions: [
      {
        kind: "stack",
        id: "identity",
        widgets: [
          { id: "meadow-project-header", widget: "meadow-project-header", size: "12x1" },
        ],
      },
      {
        kind: "stack",
        id: "report-glance",
        widgets: [
          { id: "meadow-project-stats", widget: "meadow-project-stats", size: "12x1" },
        ],
      },
      {
        kind: "stack",
        id: "sections",
        widgets: [
          { id: "meadow-project-sections", widget: "meadow-project-sections", size: "12x7" },
        ],
      },
    ],
  },
};

export default meadowPreset;
