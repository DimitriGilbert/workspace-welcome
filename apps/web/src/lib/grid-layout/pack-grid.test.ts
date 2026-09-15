/**
 * pack-grid tests (`node --import tsx --test src/lib/grid-layout/pack-grid.test.ts`)
 * — node:test over the pure module (the packages/api idiom): behavior guards
 * on the fresh skyline pack (the shared rectangle math must never drift), and
 * the settle suite pinning the displaced re-home fix — a one-cell move
 * re-homes the widgets it displaced into the nearest compact cells (the
 * vacated old rect, the notch the drop punched, the band beside the stack)
 * instead of pushing them below the fold into bottom-of-board exile.
 *
 * Every scenario is a literal arrangement — no fixtures, no clock. Each
 * `settle` run asserts the standing invariants: the drop lands EXACTLY at
 * its preview, the output never overlaps, and untouched widgets (pinned
 * ones included) never move. Exact position maps pin the deterministic
 * outcomes; where the geometry allows it, `assertColumnsContiguous` pins
 * the no-hole compaction law (a void may survive only where no movable
 * footprint fits — pin- or drop-pinched space).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { packGrid, settleArrangement } from "./pack-grid";
import type { ArrangementItem } from "./pack-grid";

/** Arrangement literal with the optional pin flag spelled only when set. */
function at(
  id: string,
  x: number,
  y: number,
  cols: number,
  rows: number,
  pinned = false,
): ArrangementItem {
  return pinned ? { id, x, y, cols, rows, pinned: true } : { id, x, y, cols, rows };
}

/** [x, y] per id — the assertion-friendly projection of a settle output. */
function positions(items: readonly ArrangementItem[]): Record<string, [number, number]> {
  return Object.fromEntries(items.map((i) => [i.id, [i.x, i.y] as [number, number]]));
}

/** Total board height in rows (the ragged bottom edge). */
function boardRows(items: readonly ArrangementItem[]): number {
  return items.reduce((max, i) => Math.max(max, i.y + i.rows), 0);
}

/** No two placed widgets may ever share a cell. */
function assertNoOverlap(items: readonly ArrangementItem[]): void {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a === undefined || b === undefined) continue;
      const overlap =
        a.x < b.x + b.cols && b.x < a.x + a.cols && a.y < b.y + b.rows && b.y < a.y + a.rows;
      assert.ok(!overlap, `settle output overlaps: ${a.id} × ${b.id}`);
    }
  }
}

/**
 * Compaction law, stated precisely: in every column the occupied cells form
 * ONE contiguous run — a column may START late (the drop itself pinched
 * space no footprint fits), but no gap may open BETWEEN widgets: nothing
 * floats over a void. Asserted only on scenarios whose geometry lets every
 * freed cell be reclaimed.
 */
function assertColumnsContiguous(items: readonly ArrangementItem[], columns: number): void {
  for (let c = 0; c < columns; c++) {
    const spans = items
      .filter((i) => c >= i.x && c < i.x + i.cols)
      .map((i) => [i.y, i.y + i.rows] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    let end: number | null = null;
    for (const [start, stop] of spans) {
      if (end !== null && start > end) {
        assert.fail(`column ${c} has a hole between rows ${end} and ${start}`);
      }
      end = Math.max(end ?? stop, stop);
    }
  }
}

/**
 * Run one committed gesture the way use-grid-drag does: the moved widget is
 * stamped at its preview rect, `settleArrangement` resolves the board, and
 * the standing invariants are asserted (drop exact, no overlap). The
 * pre-move placement of the moved widget is passed as `oldRect`.
 */
function settle(
  board: readonly ArrangementItem[],
  movedId: string,
  next: { x: number; y: number; cols: number; rows: number },
): ArrangementItem[] {
  const old = board.find((i) => i.id === movedId);
  assert.ok(old !== undefined, `fixture is missing the moved widget ${movedId}`);
  const settled = settleArrangement(
    board.map((i) => (i.id === movedId ? { ...i, ...next } : i)),
    movedId,
    old,
  );
  assertNoOverlap(settled);
  const dropped = settled.find((i) => i.id === movedId);
  assert.ok(dropped !== undefined, "the moved widget vanished from the settle output");
  assert.deepEqual(
    { x: dropped.x, y: dropped.y, cols: dropped.cols, rows: dropped.rows },
    next,
    "an explicit drop must land exactly at its preview — never refused, never nudged",
  );
  return settled;
}

/* ------------------------------------------------------------------------- */
/* settleArrangement — the displaced re-home                                  */
/* ------------------------------------------------------------------------- */

test("bento: a one-cell move re-homes the displaced 6-col widget near its origin, not below the fold", () => {
  // 12-col dashboard band: the 6x3 pulse sits between the 4x3 attention and
  // the 2x4 rail mix; below it the 10x4 projects, then the 6x4 forge band.
  const bento: ArrangementItem[] = [
    at("chrome", 0, 0, 12, 1),
    at("attention", 0, 1, 4, 3),
    at("pulse", 4, 1, 6, 3),
    at("mix", 10, 1, 2, 4),
    at("projects", 0, 4, 10, 4),
    at("health", 10, 5, 2, 3),
    at("forge", 0, 8, 6, 4),
  ];
  // mix moves LEFT one cell: its new rect clips pulse's edge AND projects'
  // top-right corner, so both are displaced. Pre-fix they were pushed below
  // the drop with x kept — pulse marched to (4,12), projects to (0,15), a
  // 19-row board with a 6x4 hole beside forge. The skyline re-home plants
  // pulse at (0,4) — attention's row band, 3 rows from its origin — and
  // projects right below forge; gravity then pulls forge up a row and
  // slides health in beside pulse. 15 rows, no hole deep enough to hide in.
  const settled = settle(bento, "mix", { x: 9, y: 1, cols: 2, rows: 4 });
  assert.deepEqual(positions(settled), {
    chrome: [0, 0],
    attention: [0, 1],
    mix: [9, 1],
    pulse: [0, 4],
    health: [6, 4],
    forge: [0, 7],
    projects: [0, 11],
  });
  assert.equal(boardRows(settled), 15, "same bottom edge as the pre-fix exile, minus the hole");
  const pulseResult = settled.find((i) => i.id === "pulse");
  assert.ok(
    pulseResult !== undefined && pulseResult.y < 6,
    "the displaced 6-col widget re-homes near its origin band, not at the fold",
  );
  // The cells mix's move pinched (cols 4-8 × rows 1-3) fit no MOVABLE
  // footprint — attention is untouched and projects is 10 wide — so a void
  // there is the mandated outcome, not a settle failure.
});

test("meadow: a rail displaced under a moved grid re-homes compactly beside/below it, not exiled under empty space", () => {
  // 12-col board: the 8x6 project grid with a 4-col rail (report, momentum)
  // beside it and forge as the band below.
  const meadow: ArrangementItem[] = [
    at("grid", 0, 0, 8, 6),
    at("report", 8, 0, 4, 3),
    at("momentum", 8, 3, 4, 3),
    at("forge", 0, 6, 8, 2),
  ];
  // The grid moves RIGHT one cell, its edge sweeping the rail's column.
  // Pre-fix, report chained to (8,6) and momentum to (8,9) — the rail sat
  // below its own emptied column with a 3x6 strip of dead page above. The
  // re-home pulls both into the lowest clear slots: report into the rail's
  // own column under the grid's new edge, momentum up beside forge.
  const settled = settle(meadow, "grid", { x: 1, y: 0, cols: 8, rows: 6 });
  assert.deepEqual(positions(settled), {
    grid: [1, 0],
    forge: [0, 6],
    report: [8, 6],
    momentum: [0, 8],
  });
  assert.equal(boardRows(settled), 11, "the rail must not stack into a spire below the fold");
  assertColumnsContiguous(settled, 12);
});

test("jam: a full-width stack can only yield below the fold — push-below survives as the degenerate re-home", () => {
  // A 4-col board of full-width tiles: a's one-cell drop onto b leaves no
  // 4-wide slot above the fold, so b re-homes below c (and gravity then
  // closes the ranks a's old cell left behind).
  const settled = settle(
    [at("a", 0, 0, 4, 2), at("b", 0, 2, 4, 2), at("c", 0, 4, 4, 2)],
    "a",
    { x: 0, y: 1, cols: 4, rows: 2 },
  );
  assert.deepEqual(positions(settled), { a: [0, 1], c: [0, 3], b: [0, 5] });
  assertColumnsContiguous(settled, 4);
});

test("swap: a same-size tile exchange moves exactly the two widgets", () => {
  const settled = settle(
    [at("a", 0, 0, 4, 2), at("b", 4, 0, 4, 2), at("c", 8, 0, 4, 2)],
    "a",
    { x: 4, y: 0, cols: 4, rows: 2 },
  );
  assert.deepEqual(positions(settled), { a: [4, 0], b: [0, 0], c: [8, 0] });
  assertColumnsContiguous(settled, 12);
});

test("re-home fills the vacated old rect when the displaced footprint fits it", () => {
  // The mover lands on a SHORTER widget: no same-size swap applies, and the
  // 2x1 occupant re-homes straight UP into the 2x2 cells the mover left.
  const settled = settle(
    [
      at("mover", 0, 0, 2, 2),
      at("occupant", 2, 0, 2, 1),
      at("pin", 0, 2, 2, 2, true),
      at("below", 0, 4, 2, 2),
    ],
    "mover",
    { x: 2, y: 0, cols: 2, rows: 2 },
  );
  assert.deepEqual(positions(settled), {
    mover: [2, 0],
    occupant: [0, 0],
    pin: [0, 2],
    below: [0, 4],
  });
  // Pinned placements never move (compaction cannot slide them); the free
  // widget below stays blocked under the pin — the pin's void is honored.
  const pin = settled.find((i) => i.id === "pin");
  assert.deepEqual(pin, { id: "pin", x: 0, y: 2, cols: 2, rows: 2, pinned: true });
});

test("pins protect from automatic reflow, never from the user's explicit drop", () => {
  // Owner round 5: the drop lands exactly on a pinned occupant — the pin
  // yields its cells (here via the same-size swap into the vacated rect).
  const settled = settle(
    [at("mover", 0, 0, 2, 2), at("pin", 2, 0, 2, 2, true)],
    "mover",
    { x: 2, y: 0, cols: 2, rows: 2 },
  );
  assert.deepEqual(positions(settled), { mover: [2, 0], pin: [0, 0] });
});

test("gravity: widgets below a vacated band rise into it while it stays clear", () => {
  // a drops straight down into open space — nothing displaced — and c
  // rises cell-by-cell into a's old band; b cannot slide left past c.
  const settled = settle(
    [at("a", 0, 0, 4, 3), at("b", 4, 0, 4, 3), at("c", 0, 3, 4, 2), at("d", 4, 3, 4, 2)],
    "a",
    { x: 0, y: 5, cols: 4, rows: 3 },
  );
  assert.deepEqual(positions(settled), { a: [0, 5], b: [4, 0], c: [0, 0], d: [4, 3] });
});

test("determinism: identical inputs produce deep-equal settles and packs", () => {
  const bento: ArrangementItem[] = [
    at("chrome", 0, 0, 12, 1),
    at("attention", 0, 1, 4, 3),
    at("pulse", 4, 1, 6, 3),
    at("mix", 10, 1, 2, 4),
    at("projects", 0, 4, 10, 4),
    at("health", 10, 5, 2, 3),
    at("forge", 0, 8, 6, 4),
  ];
  const run = (): ArrangementItem[] =>
    settleArrangement(
      bento.map((i) => (i.id === "mix" ? { ...i, x: 9 } : { ...i })),
      "mix",
      bento.find((i) => i.id === "mix") ?? null,
    );
  assert.deepEqual(run(), run());
  const pack = (): ReturnType<typeof packGrid> =>
    packGrid(
      [
        { id: "a", cols: 4, rows: 3 },
        { id: "b", cols: 6, rows: 3, pinned: true },
        { id: "c", cols: 2, rows: 4, at: { x: 9, y: 1 } },
      ],
      { columns: 12 },
    );
  assert.deepEqual(pack(), pack());
});

/** Deterministic mulberry32 PRNG — the sweep below replays identically
 * forever (no clock, no randomness in the module under test either). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("invariant sweep: random packed boards + moves keep every settle law", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rand = mulberry32(seed);
    const columns = 2 + Math.floor(rand() * 11);
    // A valid starting board: pack random items, session-pin a few of the
    // placements, then commit a random move (often onto other widgets).
    const items = Array.from({ length: 1 + Math.floor(rand() * 10) }, (_, i) => ({
      id: `w${i}`,
      cols: 1 + Math.floor(rand() * Math.min(columns, 8)),
      rows: 1 + Math.floor(rand() * 5),
      ...(rand() < 0.25 ? { pinned: true } : {}),
    }));
    const board: ArrangementItem[] = packGrid(items, { columns }).placements.map((p) =>
      rand() < 0.25
        ? { id: p.id, x: p.x, y: p.y, cols: p.cols, rows: p.rows, pinned: true }
        : { id: p.id, x: p.x, y: p.y, cols: p.cols, rows: p.rows },
    );
    const moved = board[Math.floor(rand() * board.length)];
    assert.ok(moved !== undefined, "a packed board always has a movable widget");
    const drop: ArrangementItem = {
      id: moved.id,
      x: Math.floor(rand() * (columns - moved.cols + 1)),
      y: Math.floor(rand() * (boardRows(board) + 3)),
      cols: moved.cols,
      rows: moved.rows,
    };
    const hits = (a: ArrangementItem, b: ArrangementItem): boolean =>
      a.id !== b.id &&
      a.x < b.x + b.cols && b.x < a.x + a.cols &&
      a.y < b.y + b.rows && b.y < a.y + a.rows;
    const untouched = board.filter((i) => i.id !== moved.id && !hits(i, drop));
    const run = (): ArrangementItem[] =>
      settleArrangement(
        board.map((i) => (i.id === moved.id ? { ...i, x: drop.x, y: drop.y } : i)),
        moved.id,
        moved,
      );
    const settled = run();
    assert.deepEqual(run(), settled, `seed ${seed}: settle is not deterministic`);
    assertNoOverlap(settled);
    const dropped = settled.find((i) => i.id === moved.id);
    assert.ok(
      dropped !== undefined && dropped.x === drop.x && dropped.y === drop.y,
      `seed ${seed}: the drop was nudged`,
    );
    for (const before of untouched) {
      const after = settled.find((i) => i.id === before.id);
      assert.ok(after !== undefined, `seed ${seed}: ${before.id} vanished`);
      assert.ok(
        after.x <= before.x && after.y <= before.y,
        `seed ${seed}: untouched ${before.id} moved down/right (${before.x},${before.y}→${after.x},${after.y})`,
      );
      assert.ok(
        before.pinned !== true || (after.x === before.x && after.y === before.y),
        `seed ${seed}: pinned ${before.id} moved`,
      );
    }
  }
});

/* ------------------------------------------------------------------------- */
/* packGrid — fresh-pack guards over the shared skyline math                  */
/* ------------------------------------------------------------------------- */

test("packGrid: free items fill lines lowest-leftmost, order = input order", () => {
  const packed = packGrid(
    [
      { id: "a", cols: 4, rows: 3 },
      { id: "b", cols: 6, rows: 3 },
      { id: "c", cols: 2, rows: 4 },
    ],
    { columns: 12 },
  );
  assert.deepEqual(packed, {
    columns: 12,
    rows: 4,
    placements: [
      { id: "a", cols: 4, rows: 3, x: 0, y: 0, order: 0, pinned: false },
      { id: "b", cols: 6, rows: 3, x: 4, y: 0, order: 1, pinned: false },
      { id: "c", cols: 2, rows: 4, x: 10, y: 0, order: 2, pinned: false },
    ],
  });
});

test("packGrid: an authored anchor is honored exactly, x clamped into the grid", () => {
  const packed = packGrid(
    [
      { id: "a", cols: 4, rows: 2, at: { x: 10, y: 2 } },
      { id: "b", cols: 4, rows: 2 },
    ],
    { columns: 12 },
  );
  const a = packed.placements.find((p) => p.id === "a");
  const b = packed.placements.find((p) => p.id === "b");
  assert.deepEqual(
    a === undefined ? null : { x: a.x, y: a.y },
    { x: 8, y: 2 },
    "the anchor lands verbatim, clamped so the footprint stays inside the grid",
  );
  assert.deepEqual(b === undefined ? null : { x: b.x, y: b.y }, { x: 0, y: 0 });
  assert.equal(packed.rows, 4);
});

test("packGrid: pinned items lead the reading order and pack first", () => {
  const packed = packGrid(
    [
      { id: "a", cols: 2, rows: 2 },
      { id: "p", cols: 2, rows: 2, pinned: true },
    ],
    { columns: 12 },
  );
  assert.deepEqual(packed.placements, [
    { id: "p", cols: 2, rows: 2, x: 0, y: 0, order: 0, pinned: true },
    { id: "a", cols: 2, rows: 2, x: 2, y: 0, order: 1, pinned: false },
  ]);
});

test("packGrid: empty input packs to an empty board", () => {
  assert.deepEqual(packGrid([], { columns: 8 }), { columns: 8, rows: 0, placements: [] });
});
