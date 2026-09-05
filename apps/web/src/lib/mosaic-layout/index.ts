/**
 * The shared bento sizing + packing algorithm for the dashboard designs.
 *
 * Sizing. Every project tile gets a size derived from recency. The previous
 * hard day-threshold tiers bunched whole workspaces into one size (a week of
 * nothing-but-month-old repos rendered every tile identical), so the scale
 * here is LOGARITHMIC and RELATIVE to the actual set: each age is mapped
 * through log(1 + age) and then normalized across the workspace's own
 * freshest→oldest span. The log does the real work — linear normalization
 * would press every age under the oldest project into the top of the scale,
 * while the log spreads both the fresh end (minutes vs days) and the old end
 * (months vs years), so distinct projects get distinct treatment. That
 * normalized score is also blended 50/50 with the project's set-relative
 * rank (its quantile position among equally-dated peers) to cut the tier
 * bands — quantile-ish, per the "log-scaled rank/age over the actual set"
 * rule — so neither a tight commit cluster nor one ancient outlier can bunch
 * the workspace into a single size, while the exported score stays the pure
 * log-scaled recency the rings and gauges render. A pinned project overrides
 * to the top tier regardless of its age; its score stays honest.
 *
 * Packing. A column skyline that FILLS LINES: each tile lands on the
 * lowest, leftmost level foundation it fits, so when a wide block can't use
 * the remaining row width, the smaller blocks behind it in reading order
 * are pulled up to complete the row. Rows come out ragged only when the
 * input genuinely can't fill them. Reading order is pinned first, then
 * freshest first (ties break by path), and `order` records it.
 *
 * Determinism: same input + same `now` → same layout. No Math.random and no
 * Date.now in the core — `now` is a required option. Pure TypeScript: no
 * node imports, no react; O(n log n) in projects (the sorts dominate; the
 * skyline walk is linear in projects for a fixed grid width).
 */

/** A tile footprint in grid cells (width × height). */
export interface MosaicSize {
  cols: number;
  rows: number;
}

/** The slice of a scanned project the layout needs (Project satisfies this). */
export interface MosaicInputProject {
  /** Absolute path — the stable identity of a project. */
  path: string;
  /** ISO timestamp of the most recent meaningful activity. */
  updatedAt: string;
  /** Pinned projects override to the top tier and lead the reading order. */
  pinned?: boolean;
}

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

  // --- Log-scaled recency score ---------------------------------------------
  //
  // log(1 + age) per project, then min-max normalized over the set's own
  // span. Identical ages share a score (and therefore a tier), so the
  // all-identical-dates degenerate case collapses to "everything is as fresh
  // as the set gets" instead of dividing by zero.

  const now = options.now;
  const logAges = projects.map((project) => {
    const ms = Date.parse(project.updatedAt);
    return Number.isFinite(ms)
      ? Math.log1p(Math.max(0, now - ms))
      : null; // unparseable date → oldest, below every real age
  });

  let minLog = Number.POSITIVE_INFINITY;
  let maxLog = Number.NEGATIVE_INFINITY;
  for (const logAge of logAges) {
    if (logAge !== null && logAge < minLog) minLog = logAge;
    if (logAge !== null && logAge > maxLog) maxLog = logAge;
  }
  const spread = maxLog - minLog;
  const anyParseable = spread >= 0;

  const scores = logAges.map((logAge) => {
    if (logAge === null || !anyParseable) return 0;
    if (spread === 0) return 1;
    return Math.min(1, Math.max(0, 1 - (logAge - minLog) / spread));
  });

  // --- Tiers ------------------------------------------------------------------
  //
  // Tier cuts blend the normalized log-score with the project's set-relative
  // rank (quantile position, equals share a position): pure score bands would
  // bunch a tight cluster (29 repos touched inside two days would all read
  // "hero" next to one 400-day archive), while pure rank quantiles would
  // force heroes onto a workspace where nothing has been touched in years.
  // The 50/50 blend is the "log-scaled rank/age over the actual set" rule —
  // distinct projects get distinct treatment on both ends without lying
  // about absolute freshness. Pinned overrides to the top tier.

  const n = projects.length;
  const ageMs = projects.map((project) => {
    const ms = Date.parse(project.updatedAt);
    return Number.isFinite(ms) ? Math.max(0, now - ms) : null;
  });
  const rankOrder = projects.map((_, i) => i).sort((a, b) => {
      const aa = ageMs[a] ?? null;
      const bb = ageMs[b] ?? null;
      if (aa === null && bb === null) return byPath(projects[a]?.path ?? "", projects[b]?.path ?? "");
      if (aa === null) return 1;
      if (bb === null) return -1;
      if (aa !== bb) return aa - bb;
      return byPath(projects[a]?.path ?? "", projects[b]?.path ?? "");
    });
  const rankPos = new Array<number>(n).fill(0);
  let groupStart = 0;
  for (let i = 0; i < n; i++) {
    const idx = rankOrder[i];
    if (idx === undefined) continue;
    if (i > 0) {
      const prev = rankOrder[i - 1];
      const prevAge = prev === undefined ? null : (ageMs[prev] ?? null);
      const thisAge = ageMs[idx] ?? null;
      const sameTie =
        (prevAge === null && thisAge === null) ||
        (prevAge !== null && thisAge !== null && prevAge === thisAge);
      if (!sameTie) groupStart = i;
    }
    rankPos[idx] = n === 1 ? 0 : groupStart / (n - 1);
  }

  const tierCount = sizes.length;
  const tierIndexes = scores.map((score, i) => {
    if (projects[i]?.pinned === true) return 0;
    const position = (score + (1 - (rankPos[i] ?? 0))) / 2;
    return Math.min(tierCount - 1, Math.floor((1 - position) * tierCount));
  });

  // --- Reading order ------------------------------------------------------------
  //
  // Pinned first, then everything else; within each group freshest update
  // first, ties by path. Unparseable dates sort to the back of their group.
  // The sequence position in this order is the exported `order` value.

  const orderIndexes = projects
    .map((project, i) => ({
      i,
      pinned: project.pinned === true,
      sortMs: Number.isFinite(Date.parse(project.updatedAt))
        ? Date.parse(project.updatedAt)
        : Number.NEGATIVE_INFINITY,
      path: project.path,
    }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.sortMs !== b.sortMs) return b.sortMs - a.sortMs;
      return byPath(a.path, b.path);
    })
    .map((entry) => entry.i);

  const sequence = orderIndexes.map((projectIndex, position) => {
    const project = projects[projectIndex];
    return {
      order: position,
      project,
      size: sizes[tierIndexes[projectIndex] ?? 0] ?? sizes[0],
      score: scores[projectIndex] ?? 0,
      tierIndex: tierIndexes[projectIndex] ?? 0,
      pinned: project?.pinned === true,
    };
  });

  // --- Skyline packing ------------------------------------------------------------
  //
  // heights[c] = first unfilled row of column c; tiles only ever sit on a
  // LEVEL foundation (all columns under the footprint equal), so nothing
  // floats and every cell below a tile stays fillable. Instead of marching
  // the queue in blind recency order — which walks past a row remainder the
  // moment the next block is too wide for it — each step places the pending
  // block whose best level foundation sits LOWEST, ties going to the earliest
  // reading order. Big fresh blocks still lead while rows are open; the
  // instant a remainder exists that only smaller blocks fit, the earliest
  // such block is pulled up into it. That is the fill-the-line rule, and the
  // selection scan is bounded (≤ a few width classes × grid width), keeping
  // the whole pack linear.

  const heights = new Array<number>(columns).fill(0);
  const placed = new Array<MosaicPlacement | null>(sequence.length).fill(null);

  const place = (position: number, x: number, y: number): void => {
    const item = sequence[position];
    if (item === undefined || item.project === undefined) return;
    const { cols, rows } = item.size;
    for (let c = x; c < x + cols; c++) heights[c] = y + rows;
    placed[position] = {
      path: item.project.path,
      cols,
      rows,
      x,
      y,
      order: item.order,
      score: item.score,
      tierIndex: item.tierIndex,
      tier: tierLabel(item.size),
      pinned: item.pinned,
    };
  };

  /** Pending sequence positions per tile width, each a FIFO in reading order. */
  const widthClasses = [...new Set(sizes.map((size) => size.cols))].sort((a, b) => a - b);
  const pending = new Map<number, number[]>();
  for (const width of widthClasses) pending.set(width, []);
  for (let position = 0; position < sequence.length; position++) {
    const item = sequence[position];
    if (item === undefined) continue;
    pending.get(item.size.cols)?.push(position);
  }

  /** Lowest LEVEL window for a footprint width, leftmost on ties; -1 if none. */
  const lowestLevelX = (cols: number): { x: number; y: number } | null => {
    let bestX = -1;
    let bestY = Number.POSITIVE_INFINITY;
    for (let x = 0; x + cols <= columns; x++) {
      const y = heights[x] ?? 0;
      if (y >= bestY) continue;
      let level = true;
      for (let i = x + 1; i < x + cols; i++) {
        if (heights[i] !== y) {
          level = false;
          break;
        }
      }
      if (level) {
        bestX = x;
        bestY = y;
      }
    }
    return bestX === -1 ? null : { x: bestX, y: bestY };
  };

  for (let step = 0; step < sequence.length; step++) {
    let winner: { x: number; y: number; position: number } | null = null;
    for (const width of widthClasses) {
      const queue = pending.get(width);
      const head = queue?.[0];
      if (queue === undefined || head === undefined) continue;
      const spot = lowestLevelX(width);
      if (spot === null) continue;
      if (
        winner === null ||
        spot.y < winner.y ||
        (spot.y === winner.y && head < winner.position)
      ) {
        winner = { x: spot.x, y: spot.y, position: head };
      }
    }
    if (winner !== null) {
      pending.get(sequence[winner.position]?.size.cols ?? 0)?.shift();
      place(winner.position, winner.x, winner.y);
      continue;
    }
    // No level foundation fits any pending width — the frontier is genuinely
    // ragged for what remains. Rescue the earliest pending block at the lowest
    // skyline position (this may rest on uneven columns and open a niche that
    // later, narrower blocks close).
    let rescue = -1;
    for (const queue of pending.values()) {
      const head = queue[0];
      if (head !== undefined && (rescue === -1 || head < rescue)) rescue = head;
    }
    if (rescue === -1) break;
    const width = sequence[rescue]?.size.cols ?? 1;
    let bestX = 0;
    let bestY = Number.POSITIVE_INFINITY;
    for (let x = 0; x + width <= columns; x++) {
      let y = heights[x] ?? 0;
      for (let i = x + 1; i < x + width; i++) {
        const hi = heights[i] ?? 0;
        if (hi > y) y = hi;
      }
      if (y < bestY) {
        bestX = x;
        bestY = y;
      }
    }
    pending.get(width)?.shift();
    place(rescue, bestX, bestY === Number.POSITIVE_INFINITY ? 0 : bestY);
  }

  const placements = placed.filter((p): p is MosaicPlacement => p !== null);
  const rows = heights.reduce((max, h) => (h > max ? h : max), 0);
  return { columns, rows, placements };
}
