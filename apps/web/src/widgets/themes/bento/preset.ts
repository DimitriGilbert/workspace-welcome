/**
 * Bento's theme preset (master plan §5 T1-bento + T2-bento).
 *
 * The dashboard ports the design route's four sections onto the system:
 *
 * - **vitals** — health gauge, activity trend, stack donut, one aligned
 *   3-row band (the design's 3+6+12 desktop spans);
 * - **signals** — needs-attention (8 cols) + signal mix (4 cols);
 * - **pulse** — the tabbed snitch-report band, full width;
 * - **projects** — the mosaic: a flow region over the shared "projects"
 *   flow, so tile sizes come from the canonical recency scoring
 *   (`scoreProjects` tiers = the design's hero 3×3 → compact 1×1 ladder)
 *   rendered as the `bento-project-tile` kind.
 *
 * Placements are reading order (no authored anchors) — the line-filling
 * packer lands the desktop spans exactly and re-packs the narrower
 * breakpoints without fixed-anchor collisions.
 *
 * Grid constants ported from `components/designs/bento/bento.css`: the band
 * grid steps 2 → 6 → 12 columns (≥1024 / ≥1536) and the project mosaic is a
 * fixed 12-column grid; the mosaic row unit is 92px below 1024px and 96px
 * above — 96 is the desktop density. The scope tokens ship as the real
 * ported values (`./tokens.css`, loaded from this module — the one
 * per-theme module the preset glob always evaluates); the glazed tile skin
 * rides the optional `./custom.css`.
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
    regions: [
      {
        kind: "stack",
        id: "vitals",
        widgets: [
          { id: "vitals-health", widget: "bento-health", size: "3x3" },
          { id: "vitals-activity", widget: "bento-activity", size: "6x3" },
          { id: "vitals-stacks", widget: "bento-stacks", size: "3x3" },
        ],
      },
      {
        kind: "stack",
        id: "signals",
        widgets: [
          { id: "signals-attention", widget: "bento-attention", size: "8x3" },
          { id: "signals-mix", widget: "bento-signals", size: "4x3" },
        ],
      },
      {
        kind: "stack",
        id: "pulse",
        widgets: [{ id: "workspace-pulse", widget: "bento-pulse", size: "12x3" }],
      },
      {
        kind: "flow",
        id: "projects",
        from: "projects",
        template: { widget: "bento-project-tile" },
      },
    ],
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
