/**
 * The item-agnostic bento packer for the widget system (master plan §5, W2).
 *
 * This is the skyline packer + reading order ported from the mosaic layout
 * (apps/web/src/lib/mosaic-layout), stripped of everything project-specific:
 * no recency scoring, no tiers, no paths. The caller decides WHAT each item
 * is and HOW BIG it is; this module decides WHERE it lands.
 *
 * Packing. A column skyline that FILLS LINES: each item lands on the lowest,
 * leftmost level foundation it fits, so when a wide block can't use the
 * remaining row width, the smaller blocks behind it in reading order are
 * pulled up to complete the row. Rows come out ragged only when the input
 * genuinely can't fill them.
 *
 * Fixed placements. An item with an `at` anchor is FIXED: it is placed at
 * exactly that cell (its x clamped so the footprint stays inside the grid,
 * y clamped to ≥ 0) before anything free is packed, and the free items pack
 * around and below it. Note the skyline model keeps one frontier per column,
 * so a fixed item floating above empty space raises its columns' frontier and
 * the space underneath stays unused — anchors belong at or near the top.
 *
 * Reading order. Pinned items first (input order within the group), then
 * everything else in input order. The packer itself never re-sorts by
 * freshness — the caller encodes any recency ordering in the input sequence
 * (see `score-projects.ts`), and `order` on each placement records the final
 * reading-order position (0 = first).
 *
 * Determinism: same input → same layout. No Math.random and no Date.now —
 * this module has no clock at all. Pure TypeScript: no node imports, no
 * react; the skyline walk is linear in items for a fixed grid width (the
 * selection scan is bounded: ≤ a few width classes × grid width).
 */

/** One item to place: an identity, a footprint, and optional placement hints. */
export interface PackItem {
  /** Stable identity of the item — echoed back on the placement. */
  id: string;
  /** Footprint in grid cells (width × height). */
  cols: number;
  rows: number;
  /** Pinned items lead the reading order. */
  pinned?: boolean;
  /** Fixed anchor: place at exactly this cell instead of packing. */
  at?: { x: number; y: number };
}

/** One placed item: its footprint, position and reading order. */
export interface PackPlacement {
  /** The `id` of the packed item. */
  id: string;
  /** Footprint in grid cells. */
  cols: number;
  rows: number;
  /** Top-left cell of the item in the packed grid. */
  x: number;
  y: number;
  /** Reading order: pinned first, then input order. 0 = first. */
  order: number;
  pinned: boolean;
}

export interface PackGrid {
  /** Grid width the layout was packed into. */
  columns: number;
  /** Total packed height in rows (0 for an empty input). */
  rows: number;
  /** Placements in reading order. */
  placements: PackPlacement[];
}

export interface PackGridOptions {
  /** Grid width in cells. Default 12. */
  columns?: number;
}

/**
 * Clamp a footprint dimension to a sane, integral value: non-finite floors to
 * 1, and the width never exceeds the grid. Overwide items are clamped rather
 * than dropped so every input id keeps its placement (the packer never
 * silently loses an item); callers wanting ladder-style filtering do it
 * before calling.
 */
function normalizedFootprint(
  item: PackItem,
  columns: number,
): { cols: number; rows: number } {
  const rawCols = Number.isFinite(item.cols) ? Math.floor(item.cols) : 1;
  const rawRows = Number.isFinite(item.rows) ? Math.floor(item.rows) : 1;
  return {
    cols: Math.min(columns, Math.max(1, rawCols)),
    rows: Math.max(1, rawRows),
  };
}

/**
 * Pack items onto a `columns`-wide grid with the line-filling skyline walk.
 * Fixed items (an `at` anchor) are honored first; free items then pack into
 * the lowest, leftmost level foundations, with the per-step winner chosen
 * across width classes so row remainders get filled by the smaller blocks
 * behind them in reading order.
 */
export function packGrid(
  items: readonly PackItem[],
  options: PackGridOptions = {},
): PackGrid {
  const columns = Math.max(1, Math.floor(options.columns ?? 12));
  if (items.length === 0) {
    return { columns, rows: 0, placements: [] };
  }

  // --- Reading order ---------------------------------------------------------
  //
  // Pinned first, then everything else — stable within each group (input
  // order decides; no secondary key, no clock). `position` in this sequence
  // is the exported `order` value, and it is also the FIFO order the packer
  // serves free items in.

  const sequence = items
    .map((item, i) => ({ item, i, pinned: item.pinned === true }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.i - b.i;
    })
    .map((entry, position) => ({
      ...entry,
      position,
      footprint: normalizedFootprint(entry.item, columns),
    }));

  // --- Skyline -------------------------------------------------------------------
  //
  // heights[c] = first unfilled row of column c. Fixed items register first
  // (reading order) so free items pack around and below them; the frontier of
  // a footprint's columns rises to at least the fixed item's bottom edge.
  // Heights merge by max, so overlapping fixed items resolve deterministically
  // (later in reading order never lowers the frontier).

  const heights = new Array<number>(columns).fill(0);
  const placed = new Array<PackPlacement | null>(sequence.length).fill(null);

  const occupy = (from: number, to: number, bottom: number): void => {
    for (let c = from; c < to; c++) heights[c] = Math.max(heights[c] ?? 0, bottom);
  };

  for (const entry of sequence) {
    const at = entry.item.at;
    if (at === undefined) continue;
    const { cols, rows } = entry.footprint;
    const x = Math.min(Math.max(0, Math.floor(at.x)), columns - cols);
    const y = Math.max(0, Math.floor(at.y));
    occupy(x, x + cols, y + rows);
    placed[entry.position] = {
      id: entry.item.id,
      cols,
      rows,
      x,
      y,
      order: entry.position,
      pinned: entry.pinned,
    };
  }

  const place = (position: number, x: number, y: number): void => {
    const entry = sequence[position];
    if (entry === undefined) return;
    const { cols, rows } = entry.footprint;
    for (let c = x; c < x + cols; c++) heights[c] = y + rows;
    placed[position] = {
      id: entry.item.id,
      cols,
      rows,
      x,
      y,
      order: entry.position,
      pinned: entry.pinned,
    };
  };

  // Pending free sequence positions per tile width, each a FIFO in reading
  // order. Instead of marching the queue in blind input order — which walks
  // past a row remainder the moment the next block is too wide for it — each
  // step places the pending block whose best level foundation sits LOWEST,
  // ties going to the earliest reading order. The instant a remainder exists
  // that only smaller blocks fit, the earliest such block is pulled up into
  // it. That is the fill-the-line rule; the selection scan is bounded (≤ a
  // few width classes × grid width), keeping the whole pack linear.

  const free = sequence.filter((entry) => entry.item.at === undefined);
  const widthClasses = [...new Set(free.map((entry) => entry.footprint.cols))].sort(
    (a, b) => a - b,
  );
  const pending = new Map<number, number[]>();
  for (const width of widthClasses) pending.set(width, []);
  for (const entry of free) {
    pending.get(entry.footprint.cols)?.push(entry.position);
  }

  /** Lowest LEVEL window for a footprint width, leftmost on ties; null if none. */
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

  for (let step = 0; step < free.length; step++) {
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
      const won = sequence[winner.position];
      pending.get(won?.footprint.cols ?? 0)?.shift();
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
    const rescueEntry = sequence[rescue];
    const width = rescueEntry?.footprint.cols ?? 1;
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

  const placements = placed
    .filter((p): p is PackPlacement => p !== null)
    .sort((a, b) => a.order - b.order);
  const rows = heights.reduce((max, h) => (h > max ? h : max), 0);
  return { columns, rows, placements };
}
