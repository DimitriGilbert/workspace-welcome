/**
 * The item-agnostic bento packer for the widget system (master plan §5, W2).
 *
 * This is the skyline packer + reading order ported from the mosaic layout
 * (apps/web/src/lib/mosaic-layout), stripped of everything project-specific:
 * no recency scoring, no tiers, no paths. The caller decides WHAT each item
 * is and HOW BIG it is; this module decides WHERE it lands.
 *
 * Packing. A column skyline that FILLS LINES: each item lands on the lowest,
 * leftmost resting position it fits — the position whose resulting frontier
 * under the footprint is lowest — so when a wide block can't use the remaining
 * row width, the smaller blocks behind it in reading order are pulled up to
 * complete the row, and holes punched by fixed items are claimed by whatever
 * fits them instead of stranding dead zones. Rows come out ragged only when
 * the input genuinely can't fill them.
 *
 * This packer is ALSO the mutation re-pack: after a manual move/resize the
 * canvas re-runs it with the committed placement as a FIXED item, so free
 * widgets skyline-fill AROUND the user's pin — the board stays tight (no
 * islands, no mid-board voids), the pin is honored verbatim, and a void
 * survives only where no free footprint fits the space a pin left.
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

  // --- Occupancy skyline ------------------------------------------------------
  //
  // Fixed items (an `at` anchor — authored anchors AND committed manual
  // placements) register first as exact rectangles; free items then skyline-fill
  // around them: each step places the pending block at the LOWEST position where
  // its rectangle intersects nothing already placed (leftmost on ties, earliest
  // reading order across width classes). Rectangles — not a heights frontier —
  // because manual pins can float mid-board: the space above and beside a pin
  // must stay fillable, or every mutation strands voids around it (owner round
  // 4: fill AROUND pinned widgets). Rows come out ragged only when the remaining
  // footprints genuinely cannot tile the space a pin left.

  const rects: Rect[] = [];
  const placed = new Array<PackPlacement | null>(sequence.length).fill(null);

  const overlapsRect = (r: Rect, cand: Rect): boolean =>
    r.x < cand.x + cand.cols && cand.x < r.x + r.cols && r.y < cand.y + cand.rows && cand.y < r.y + r.rows;

  /** Lowest y where a `cols`×`rows` rectangle at column `x` intersects
   * nothing placed. Candidates are 0 and the bottom edges of every
   * x-overlapping rect (the minimal working y is always one of those — a
   * blocking rect's own bottom), so the scan is bounded by the placed count
   * and stays correct with rects floating mid-board. */
  const lowestFitY = (x: number, cols: number, rows: number): number => {
    const bottoms = rects
      .filter((r) => r.x < x + cols && x < r.x + r.cols)
      .map((r) => r.y + r.rows)
      .sort((a, b) => a - b);
    let y = 0;
    for (;;) {
      const cand: Rect = { x, y, cols, rows };
      if (!rects.some((r) => overlapsRect(r, cand))) return y;
      const next = bottoms.find((b) => b > y);
      if (next === undefined) return y;
      y = next;
    }
  };

  const placeRect = (position: number, x: number, y: number): void => {
    const entry = sequence[position];
    if (entry === undefined) return;
    const { cols, rows } = entry.footprint;
    rects.push({ x, y, cols, rows });
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

  for (const entry of sequence) {
    const at = entry.item.at;
    if (at === undefined) continue;
    const { cols } = entry.footprint;
    const x = Math.min(Math.max(0, Math.floor(at.x)), Math.max(0, columns - cols));
    const y = Math.max(0, Math.floor(at.y));
    placeRect(entry.position, x, y);
  }

  // Pending free sequence positions per tile width, each a FIFO in reading
  // order. Each step places the pending block whose lowest non-intersecting
  // position sits highest on the board (lowest y), ties going to the earliest
  // reading order — the fill-the-line rule against real rectangles, so remainders
  // beside and above floating pins get claimed by whichever footprint fits.

  const free = sequence.filter((entry) => entry.item.at === undefined);
  const widthClasses = [...new Set(free.map((entry) => entry.footprint.cols))].sort(
    (a, b) => a - b,
  );
  const pending = new Map<number, number[]>();
  for (const width of widthClasses) pending.set(width, []);
  for (const entry of free) {
    pending.get(entry.footprint.cols)?.push(entry.position);
  }

  for (let step = 0; step < free.length; step++) {
    let winner: { x: number; y: number; position: number } | null = null;
    for (const width of widthClasses) {
      const queue = pending.get(width);
      const head = queue?.[0];
      if (queue === undefined || head === undefined) continue;
      const entry = sequence[head];
      const { cols, rows } = entry?.footprint ?? { cols: width, rows: 1 };
      for (let x = 0; x + cols <= columns; x++) {
        const y = lowestFitY(x, cols, rows);
        if (
          winner === null ||
          y < winner.y ||
          (y === winner.y && head < winner.position)
        ) {
          winner = { x, y, position: head };
        }
        if (y === 0) break; // cannot beat the top row
      }
    }
    if (winner === null) break;
    const won = sequence[winner.position];
    pending.get(won?.footprint.cols ?? 0)?.shift();
    placeRect(winner.position, winner.x, winner.y);
  }

  const placements = placed
    .filter((p): p is PackPlacement => p !== null)
    .sort((a, b) => a.order - b.order);
  const rows = rects.reduce((max, r) => (r.y + r.rows > max ? r.y + r.rows : max), 0);
  return { columns, rows, placements };
}

/* ------------------------------------------------------------------------- */
/* Incremental mutation (manual move/resize) — position-preserving            */
/* ------------------------------------------------------------------------- */

interface Rect {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

const xOverlapItem = (a: ArrangementItem, x: number, cols: number): boolean =>
  a.x < x + cols && x < a.x + a.cols;

/** One placed rectangle of a live arrangement (the canvas's current output). */
export interface ArrangementItem {
  id: string;
  x: number;
  y: number;
  cols: number;
  rows: number;
  /** Manually placed (session-edited) — protected from automatic compaction. */
  pinned?: boolean;
}

const rectHit = (a: ArrangementItem, b: ArrangementItem): boolean =>
  a.id !== b.id &&
  a.x < b.x + b.cols &&
  b.x < a.x + a.cols &&
  a.y < b.y + b.rows &&
  b.y < a.y + a.rows;

/**
 * The INCREMENTAL mutation re-pack: one widget (`movedId`) has been placed at
 * a new rectangle; resolve the board so the drop lands EXACTLY at the preview
 * and NOTHING else moves unless the drop displaced it.
 *
 * 1. SWAP: when the moved widget's old rectangle is free of everything else
 *    and exactly one occupant of the new rectangle has the same footprint,
 *    they swap — the classic same-size tile exchange, zero other movement.
 * 2. PUSH: every widget the new rectangle overlaps (ascending y) re-homes
 *    BELOW it — x kept, lowest y where it intersects nothing, chains downward
 *    through anything its new span then hits. Never upward: re-homing is
 *    strictly a consequence of the drop.
 * 3. GRAVITY into the vacated cells: widgets directly below the moved
 *    widget's OLD rectangle (same column band) rise into it while the space
 *    stays clear — band-local only, so no unrelated widget ever teleports
 *    across the board and no wave of reordering fans out.
 *
 * Pure; deterministic; terminates (pushes only move items down, gravity only
 * up, both bounded by the grid).
 */
export function settleArrangement(
  items: readonly ArrangementItem[],
  movedId: string,
  oldRect: ArrangementItem | null,
): ArrangementItem[] {
  const out: ArrangementItem[] = items.map((i) => ({ ...i }));
  const moved = out.find((i) => i.id === movedId);
  if (moved === undefined) return out;

  const others = (): ArrangementItem[] => out.filter((i) => i.id !== movedId);

  // --- 1. Swap (move only; the old rect must be otherwise free) -------------
  if (oldRect !== null) {
    const occupants = others().filter((i) => rectHit(i, moved));
    const oldFree = !others().some((i) => rectHit(i, oldRect));
    if (oldFree && occupants.length === 1) {
      const occupant = occupants[0];
      if (occupant.cols === moved.cols && occupant.rows === moved.rows) {
        occupant.x = oldRect.x;
        occupant.y = oldRect.y;
      }
    }
  }

  // --- 2. Push displaced occupants below the new rectangle ------------------
  const movedBottom = moved.y + moved.rows;
  const vacated: Rect[] = [];
  if (oldRect !== null) vacated.push({ ...oldRect });
  const displaced = others()
    .filter((i) => rectHit(i, moved))
    .sort((a, b) => a.y - b.y);
  for (const item of displaced) {
    // Lowest y where the item clears everything placed so far, starting at
    // the moved widget's bottom (it yields downward, never upward).
    let y = movedBottom;
    for (;;) {
      const cand: ArrangementItem = { ...item, y };
      const hit = out.some((i) => rectHit(i, cand));
      if (!hit) break;
      const next = Math.max(
        movedBottom,
        ...out.filter((i) => i.id !== item.id && rectHit(i, cand)).map((i) => i.y + i.rows),
      );
      if (next <= y) break;
      y = next;
    }
    if (y !== item.y) vacated.push({ x: item.x, y: item.y, cols: item.cols, rows: item.rows });
    item.y = y;
  }

  // --- 3. Compact the vacated cells (taste law: no voids) -------------------
  // The columns/rows a mutation emptied close ranks: FREE widgets slide
  // cell-by-cell into the vacated space — vertically from below, then
  // horizontally from the right — stopping at the first blocker and never
  // touching pinned placements. Band-local and stepwise, so the board reads
  // as closed ranks after every move without cross-band teleports.
  const compact = (vac: Rect): void => {
    let moved2 = true;
    while (moved2) {
      moved2 = false;
      // vertical: free items overlapping the band from below slide up
      const below = out
        .filter((i) => !i.pinned && i.id !== movedId && i.y >= vac.y && xOverlapItem(i, vac.x, vac.cols))
        .sort((a, b) => a.y - b.y);
      for (const item of below) {
        let y = item.y;
        while (y > vac.y) {
          const cand: ArrangementItem = { ...item, y: y - 1 };
          if (out.some((o) => o.id !== item.id && rectHit(o, cand))) break;
          y -= 1;
          item.y = y;
          moved2 = true;
        }
      }
      // horizontal: free items right of the band on the same rows slide left
      const right = out
        .filter(
          (i) =>
            !i.pinned &&
            i.id !== movedId &&
            i.x >= vac.x + vac.cols &&
            i.y < vac.y + vac.rows &&
            i.y + i.rows > vac.y,
        )
        .sort((a, b) => a.x - b.x);
      for (const item of right) {
        let x = item.x;
        while (x > vac.x) {
          const cand: ArrangementItem = { ...item, x: x - 1 };
          if (out.some((o) => o.id !== item.id && rectHit(o, cand))) break;
          x -= 1;
          item.x = x;
          moved2 = true;
        }
      }
    }
  };
  for (const vac of vacated) compact(vac);

  return out;
}
