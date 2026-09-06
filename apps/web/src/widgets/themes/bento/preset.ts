/**
 * Bento's theme preset — the design route's page structure on the widget
 * system's placement runtime.
 *
 * Dashboard regions (reading order, the design's bands):
 *
 * - **chrome** — the ported command bar (brand + actions + palette search
 *   bound to the shared filter), full width, one row (the design header is
 *   ~92px tall; one 96px row);
 * - **vitals** — health gauge, activity trend, stack donut, one aligned
 *   3-row band (the design's 3+6+3 desktop spans);
 * - **signals** — needs-attention (8 cols) + signal mix (4 cols);
 * - **pulse** — the tabbed snitch-report band, full width;
 * - **projects** — the mosaic: a flow region over the shared "projects"
 *   flow, so tile sizes come from the canonical recency scoring rendered
 *   as the `bento-project-tile` kind (the design's 3×3 → 1×1 ladder).
 *
 * Project page (the design's overview band + pulse + working surface):
 *
 * - **nav** — the glazed nav bar, full width, one row;
 * - **hero** — identity (3 cols) + the GROUPED state tile (5 cols) + the
 *   pulse-summary slice (4 cols), 4 rows (the design's 320–460px band);
 * - **pulse** — the full-width repo report band at 5 rows (the design's
 *   b-pulse-xl chart height);
 * - **surface** — files/artifacts/ideation tabs (12x5) + commit history
 *   (12x4).
 *
 * Grid constants ported from `components/designs/bento/bento.css`: the
 * project mosaic's desktop density is a 96px row unit on a 12-column grid.
 * The scope tokens ship as the real ported values (`./tokens.css`, loaded
 * from this module — the one per-theme module the preset glob always
 * evaluates); the design's stylesheet rides the optional `./custom.css`.
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
        id: "chrome",
        widgets: [{ id: "chrome", widget: "bento-chrome", size: "12x1" }],
      },
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
        kind: "stack",
        id: "mosaic-header",
        widgets: [{ id: "mosaic-header", widget: "bento-mosaic-header", size: "12x1" }],
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
    regions: [
      {
        kind: "stack",
        id: "nav",
        widgets: [{ id: "nav", widget: "bento-project-nav", size: "12x1" }],
      },
      {
        kind: "stack",
        id: "hero",
        widgets: [
          { id: "project-identity", widget: "bento-project-identity", size: "3x4" },
          { id: "project-state", widget: "bento-project-state", size: "5x4" },
          { id: "project-summary", widget: "bento-project-summary", size: "4x4" },
        ],
      },
      {
        kind: "stack",
        id: "pulse",
        widgets: [{ id: "project-pulse", widget: "bento-project-pulse", size: "12x5" }],
      },
      {
        kind: "stack",
        id: "surface",
        widgets: [
          { id: "project-surface", widget: "bento-project-surface", size: "12x5" },
          { id: "project-commits", widget: "bento-project-commits", size: "12x4" },
        ],
      },
    ],
  },
};

export default bentoPreset;
