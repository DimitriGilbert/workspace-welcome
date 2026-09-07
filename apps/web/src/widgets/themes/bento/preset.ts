/**
 * Bento's theme preset — the design route's page structure on the widget
 * system's placement runtime.
 *
 * Format `version: 2` (both pages): the dashboard/project nodes carry
 * per-breakpoint footprint overrides where the static desktop spans would
 * degenerate on the 6-column tablet board. The design's own stylesheet
 * (bento.css) re-spans its bands at its 1024–1535px breakpoint (attention 4 +
 * severity 2, identity 2 + state 2 + summary 2 of 6); the widget system's
 * single-size v1 nodes could not express that, so clamped desktop spans
 * stranded tiles beside empty board holes. The v2 overrides re-rung exactly
 * those nodes: the tablet board gets full-width bands with zero holes while
 * the desktop composition stays pixel-faithful to the prototype. The phone
 * board (2 columns) stacks everything full-width — the command bar takes a
 * `2x2` override so its wrapped brand/action/search stack keeps all three
 * rows (the design's <1024px header behavior).
 *
 * Dashboard regions (reading order, the design's bands):
 *
 * - **chrome** — the ported command bar (brand + actions + palette search
 *   bound to the shared filter), full width, one row (the design header is
 *   ~92px tall; one 96px row);
 * - **vitals** — health gauge, activity trend, stack donut, one aligned
 *   3-row band (the design's 3+6+3 desktop spans);
 * - **signals** — needs-attention (8 cols) + signal mix (4 cols); signal
 *   mix takes the full tablet row (`tablet: "6x3"`) instead of stranding a
 *   2-column board hole beside its clamped 4-col span;
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
 *   at tablet the trio re-rungs to 3+3 then a full-width 6 (`tablet`
 *   overrides), the design's equal-thirds mid-band, so none of the three
 *   strands beside a board hole;
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

import type { ThemeScheme, ThemePreset } from "@/widgets/themes";

const COLUMNS = { desktop: 12, tablet: 6, phone: 2 } as const;

const CELL = { h: 96 } as const;

/**
 * Bento's color schemes (owner order: light AND dark). `graphite` is the
 * design's dark glazed surface set (tokens.css, the bundled default);
 * `paper` re-declares the full manifest — bento ride-alongs included — in
 * the same hues at light registers under `scheme-paper.css`.
 */
const SCHEMES: readonly ThemeScheme[] = [
  { id: "graphite", label: "Graphite (dark)", appearance: "dark" },
  { id: "paper", label: "Paper (light)", appearance: "light", css: "paper" },
];

export const bentoPreset: ThemePreset = {
  id: "bento",
  label: "Bento",
  schemes: SCHEMES,
  dashboard: {
    version: 2,
    context: "workspace",
    columns: { ...COLUMNS },
    cell: { ...CELL },
    regions: [
      {
        kind: "stack",
        // ONE droppable surface (owner round 7): every fixed widget lives in
        // this region, so anything moves from any row to any row — verbatim
        // at preview, swap/push, never refused. The narrative reads in bands:
        // command chrome → at-a-glance health beside the activity hero and
        // the signal mix (the widgets that carry the board) → needs-attention
        // beside the stack summary (later band, content-sized) → the full-
        // width pulse band → the mosaic eyebrow. The project mosaic stays its
        // own flow region below (generated tiles cannot join a stack).
        id: "board",
        widgets: [
          {
            id: "chrome",
            widget: "bento-chrome",
            size: "12x1",
            // Phone stacks the bar's three rows (brand / actions / search) —
            // the design's <1024px header; one 96px row clips them.
            phone: "2x2",
          },
          // At-a-glance + the two widgets the owner rates decent, sharing the
          // prime band: health SHRUNK to its content (2x3), activity and
          // signal mix at their proven sizes.
          { id: "vitals-health", widget: "bento-health", size: "2x3", tablet: "3x3" },
          { id: "vitals-activity", widget: "bento-activity", size: "6x3", tablet: "3x3" },
          { id: "signals-mix", widget: "bento-signals", size: "4x3", tablet: "3x3" },
          // Second band: the attention ledger leads; the stack summary
          // follows, content-sized — out of the first line (owner verdict).
          { id: "signals-attention", widget: "bento-attention", size: "8x3" },
          { id: "vitals-stacks", widget: "bento-stacks", size: "4x3", tablet: "3x3" },
          // Full-width pulse band: the chart/table crop fills it edge to edge.
          { id: "workspace-pulse", widget: "bento-pulse", size: "12x3" },
          { id: "mosaic-header", widget: "bento-mosaic-header", size: "12x1" },
        ],
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
          // Tablet re-bands the trio to flush pairs (3+3 then a full row).
          { id: "project-identity", widget: "bento-project-identity", size: "3x4", tablet: "3x4" },
          { id: "project-state", widget: "bento-project-state", size: "5x4", tablet: "3x4" },
          { id: "project-summary", widget: "bento-project-summary", size: "4x4", tablet: "6x4" },
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
