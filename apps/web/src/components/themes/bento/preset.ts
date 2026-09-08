/**
 * Bento's theme preset — the design route's page structure on the widget
 * system's placement runtime, re-authored to the owner's live-editor
 * arrangement (`bento-OWNER-ARRANGEMENT-FINAL.jpeg`, round 10).
 *
 * Format `version: 2`: the dashboard nodes carry per-breakpoint footprint
 * overrides where the static desktop spans would degenerate on the 6-column
 * tablet board or the 2-column phone board.
 *
 * Dashboard regions — ONE droppable surface (owner round 7: anything moves
 * from any row to any row), reading in the owner's arranged order:
 *
 * - **chrome** — the ported command bar (brand + actions + palette search
 *   bound to the shared filter), full width, one row;
 * - band 1, the prime row: **needs attention** at 4 cols, the **workspace
 *   pulse** at 6, and **signal mix** at 2 — the owner moved the signal mix
 *   UP into the prime rail (4 rows, its full content);
 * - band 2: the **project bento** at 10 of 12 columns — the chrome-framed
 *   recency mosaic (the flow's own tile sizing, dense fill) — with the
 *   rail continuing beside it: **workspace health** (2x4, gauge + 2x2
 *   stat cluster) over **stack mix** (2x3). The cells below the stack mix
 *   stay open — content-sized rail (mc's authored-holes precedent).
 *
 * `bento-activity` and `bento-mosaic-header` stay registered for the lab
 * catalog but hold no board slot anymore (the bento carries its own
 * header; the pulse's tabs auto-cycle through activity → health → code →
 * AI, so the trend data stays on the board).
 *
 * Project page (owner single-canvas pass, mirroring mission-control pd.1):
 * ONE droppable surface — the old nav|hero|pulse|surface region walls pinned
 * every band (nothing could leave its row). Reading order packs the design's
 * strands tighter: nav (one row), the hero trio — identity (3) + grouped
 * state (5) + pulse-summary slice (4), 4 rows — then the repo report band
 * (12x4, one row off the design's b-pulse-xl), then the working surface
 * (7x5) beside the commit history (5x5) instead of two stacked full-width
 * slabs. Tablet re-bands flush (identity|state pair, full-width bands);
 * phone stacks 2-wide.
 *
 * Grid constants ported from `components/designs/bento/bento.css`: the
 * project mosaic's desktop density is a 96px row unit on a 12-column grid.
 * The scope tokens ship as the real ported values (`./tokens.css`, loaded
 * from this module — the one per-theme module the preset glob always
 * evaluates); the design's stylesheet rides the optional `./custom.css`.
 */
import "./tokens.css";

import type { ThemeScheme, ThemePreset } from "@/components/themes";

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
        // ONE droppable surface (owner round 7): every widget lives in this
        // region, so anything moves from any row to any row — verbatim at
        // preview, swap/push, never refused. The narrative reads in the
        // owner's arranged order: command chrome → needs attention (4)
        // beside the pulse (6), the project mosaic (10), and the right rail
        // as THREE SEPARATE widgets (owner: "THESE ARE MULTIPLE FUCKING
        // SEPARATED WIDGETS" — no host, no nesting): signal mix directly
        // under the top band, workspace health directly below signal mix,
        // stack mix directly below health — grid gap only between them,
        // each individually draggable and sizeable.
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
          // Band 1 — the ledger and the report band at 3 rows (owner: "THIS
          // WIDGET IS TOO HEIGHT" — one block height less each).
          { id: "signals-attention", widget: "bento-attention", size: "4x3", tablet: "6x3", phone: "2x3" },
          { id: "workspace-pulse", widget: "bento-pulse", size: "6x3", tablet: "6x3", phone: "2x3" },
          // Band 2 — the projects at 10 of 12 columns, one row higher (the
          // mosaic inside is organic: OWNER_TILES in project-bento.tsx —
          // placed tiles at the capture's measured percent rects, the
          // remaining flow tiles in a dense sub-grid below).
          { id: "project-bento", widget: "bento-project-bento", size: "10x12", tablet: "6x12", phone: "2x10" },
          // The right rail — three separate widgets, each at its own
          // footprint, measured from bento-OWNER-ARRANGEMENT-FINAL.jpeg
          // (vs the mosaic's 3-row line 1: signal 3.62 rows → 4; health
          // 3.34 → 3): signal mix directly under the top band, workspace
          // health directly below signal mix (gauge + the stat rows at its
          // own footprint, no dead space), stack mix directly below health.
          // Stack mix runs 3 rows on every board (its tablet/phone rungs
          // already did): at 2 rows it would sit at its registry cols-floor
          // (min 2x1) pinned to the rail's right edge — the resize dead
          // corner where neither grow nor shrink can ever commit. Grid gap
          // only between them; the cells below stack mix stay open
          // (content-sized rail).
          { id: "signals-mix", widget: "bento-signals", size: "2x4", tablet: "6x4", phone: "2x4" },
          { id: "vitals-health", widget: "bento-health", size: "2x3", tablet: "6x3", phone: "2x4" },
          { id: "vitals-stacks", widget: "bento-stacks", size: "2x3", tablet: "6x3", phone: "2x3" },
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
        // ONE canvas: every widget drags everywhere (region-scoped drag).
        // No `at` anchors — anchors would be immovable geometry. Reading
        // order: nav → identity | state | summary → pulse → surface beside
        // commits.
        kind: "stack",
        id: "canvas",
        widgets: [
          { id: "nav", widget: "bento-project-nav", size: "12x1", tablet: "6x1", phone: "2x2" },
          // THREE-RAIL arrangement (owner FINAL): left rail identity →
          // pulse → state (the glance stack), the working surface TALL in
          // the centre (the file browser dominates — owner: "why keep the
          // file browser so small?"), the dense commit ledger as a narrow
          // right rail.
          { id: "project-identity", widget: "bento-project-identity", size: "3x3", tablet: "6x3", phone: "2x3" },
          { id: "project-surface", widget: "bento-project-surface", size: "7x9", tablet: "6x6", phone: "2x8" },
          { id: "project-commits", widget: "bento-project-commits", size: "2x5", tablet: "6x4", phone: "2x4" },
          { id: "project-pulse", widget: "bento-project-pulse", size: "3x3", tablet: "6x3", phone: "2x3" },
          { id: "project-state", widget: "bento-project-state", size: "3x3", tablet: "6x3", phone: "2x3" },
        ],
      },
    ],
  },
};

export default bentoPreset;
