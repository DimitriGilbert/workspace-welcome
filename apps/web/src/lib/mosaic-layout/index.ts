/**
 * LEGACY SHIM over `lib/grid-layout` (master plan §5, W2).
 *
 * The algorithm lives in the item-agnostic grid-layout module now:
 * `@/lib/grid-layout/pack-grid` (skyline packer + reading order) and
 * `@/lib/grid-layout/score-projects` (log-scale recency score + tier blend,
 * `now` injected). This file only keeps the mosaic-facing vocabulary —
 * `MosaicSize`/`MosaicPlacement`, the canonical bento ladder, and the
 * `computeMosaicLayout` composition (score → reading order → pack) — so the
 * old design routes keep compiling until the K1/K3 cleanup deletes them.
 * New code imports grid-layout directly.
 */

import { packGrid } from "@/lib/grid-layout/pack-grid";
import { scoreProjects } from "@/lib/grid-layout/score-projects";
import type { ProjectScore, ScoreInputProject } from "@/lib/grid-layout/score-projects";

export {
  packGrid,
  type PackGrid,
  type PackGridOptions,
  type PackItem,
  type PackPlacement,
} from "@/lib/grid-layout/pack-grid";
export {
  scoreProjects,
  type ProjectScore,
  type ScoreInputProject,
  type ScoreProjectsOptions,
} from "@/lib/grid-layout/score-projects";

/** A tile footprint in grid cells (width × height). */
export interface MosaicSize {
  cols: number;
  rows: number;
}

/** The slice of a scanned project the layout needs (Project satisfies this). */
export type MosaicInputProject = ScoreInputProject;

/** One placed project: its tile size, position, reading order and score. */
export interface MosaicPlacement {
  path: string;
  /** Tile span in grid cells. */
  cols: number;
  rows: number;
  /** Top-left cell of the tile in the packed grid. */
  x: number;
  y: number;
  /** Reading order: pinned first, then freshest first. 0 = first. */
  order: number;
  /**
   * Raw log-scaled set-relative recency, 0..1 — 1 = freshest of the set,
   * 0 = oldest (or unparseable date). Tiles render rings/gauges from this.
   */
  score: number;
  /** Index into the (ordered) sizes list; 0 is the top tier. */
  tierIndex: number;
  /** Human label for the tier ("hero" … "compact" for the default sizes). */
  tier: string;
  pinned: boolean;
}

export interface MosaicLayout {
  /** Grid width the layout was packed into. */
  columns: number;
  /** Total packed height in rows (0 for an empty input). */
  rows: number;
  /** Placements in reading order. */
  placements: MosaicPlacement[];
}

export interface MosaicLayoutOptions {
  /** Reference clock for recency. Required — the core never reads Date.now. */
  now: number;
  /** Grid width in cells. Default 12. */
  gridColumns?: number;
  /** Allowed tile sizes, top tier first. Default the canonical five below. */
  sizes?: readonly MosaicSize[];
}

/**
 * The canonical bento ladder, top tier first. Ordered fresh→old so the
 * freshest quantile gets the hero footprint and the archive collapses:
 *   3×3 hero    — the working set (and everything pinned)
 *   2×3 feature — still warm
 *   2×2 large   — this month's ground
 *   2×1 medium  — cooling
 *   1×1 compact — the archive
 */
export const DEFAULT_MOSAIC_SIZES: readonly MosaicSize[] = [
  { cols: 3, rows: 3 },
  { cols: 2, rows: 3 },
  { cols: 2, rows: 2 },
  { cols: 2, rows: 1 },
  { cols: 1, rows: 1 },
];

/** Names for the canonical sizes; other footprints fall back to "w×h". */
const TIER_LABELS: ReadonlyMap<string, string> = new Map([
  ["3x3", "hero"],
  ["2x3", "feature"],
  ["2x2", "large"],
  ["2x1", "medium"],
  ["1x1", "compact"],
]);

function tierLabel(size: MosaicSize): string {
  return TIER_LABELS.get(`${size.cols}x${size.rows}`) ?? `${size.cols}×${size.rows}`;
}

/** Path tie-break, plain codepoint order so locales can't perturb the layout. */
function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compute the bento layout for a set of projects: log-scaled recency scores,
 * set-relative tiers, and a line-filling pack onto a `gridColumns`-wide grid.
 *
 * Composition over grid-layout: `scoreProjects` buys each project its tier,
 * the mosaic reading order (pinned first, then freshest first, ties by path)
 * sequences the items, and `packGrid` places them.
 *
 * Sizes that cannot fit the grid (wider than `gridColumns`, or non-positive)
 * are dropped from the ladder; if nothing valid remains the layout is empty.
 */
export function computeMosaicLayout(
  projects: readonly MosaicInputProject[],
  options: MosaicLayoutOptions,
): MosaicLayout {
  const columns = Math.max(1, Math.floor(options.gridColumns ?? 12));
  const sizes = (options.sizes ?? DEFAULT_MOSAIC_SIZES).filter(
    (size) =>
      Number.isInteger(size.cols) &&
      Number.isInteger(size.rows) &&
      size.cols >= 1 &&
      size.rows >= 1 &&
      size.cols <= columns,
  );
  if (projects.length === 0 || sizes.length === 0) {
    return { columns, rows: 0, placements: [] };
  }

  const scored = scoreProjects(projects, { now: options.now, tierCount: sizes.length });
  const scoreByPath = new Map<string, ProjectScore>(
    projects.map((project, i) => [project.path, scored[i] ?? { score: 0, tierIndex: 0 }]),
  );

  // Mosaic reading order: pinned first, then everything else; within each
  // group freshest update first, ties by path. Unparseable dates sort to the
  // back of their group. Fed in this order, packGrid's `order` values carry
  // the same semantics they always had.
  const readingOrder = [...projects].sort((a, b) => {
    const aPinned = a.pinned === true;
    const bPinned = b.pinned === true;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    const aMs = Number.isFinite(Date.parse(a.updatedAt))
      ? Date.parse(a.updatedAt)
      : Number.NEGATIVE_INFINITY;
    const bMs = Number.isFinite(Date.parse(b.updatedAt))
      ? Date.parse(b.updatedAt)
      : Number.NEGATIVE_INFINITY;
    if (aMs !== bMs) return bMs - aMs;
    return byPath(a.path, b.path);
  });

  const grid = packGrid(
    readingOrder.map((project) => {
      const size = sizes[scoreByPath.get(project.path)?.tierIndex ?? 0] ?? sizes[0];
      return {
        id: project.path,
        cols: size?.cols ?? 1,
        rows: size?.rows ?? 1,
        pinned: project.pinned === true,
      };
    }),
    { columns },
  );

  const placements = grid.placements.map((placement) => {
    const size: MosaicSize = { cols: placement.cols, rows: placement.rows };
    const tier = scoreByPath.get(placement.id);
    return {
      path: placement.id,
      cols: placement.cols,
      rows: placement.rows,
      x: placement.x,
      y: placement.y,
      order: placement.order,
      score: tier?.score ?? 0,
      tierIndex: tier?.tierIndex ?? 0,
      tier: tierLabel(size),
      pinned: placement.pinned,
    };
  });
  return { columns, rows: grid.rows, placements };
}
