/**
 * board-persist — persisted widget arrangements (localStorage `ww.board.v1`).
 *
 * WHAT persists: the per-page manual arrangement snapshots the session store
 * (`grid-session.ts`) commits after every gesture — one page per
 * `${theme}:${page}` key (e.g. `bento:dashboard`), each carrying the page
 * preset's `version` and one `RegionArrangement` per region. Nothing else
 * lives here: the session store stays the single write funnel and stays
 * module-memory only; this module is a purely additive seed/mirror layer
 * around it (`use-board-persistence.ts` wires it to the board).
 *
 * VERSION CONTRACT (layout-types.ts): a saved page stores the format
 * generation it was made at; `reconcileVersion` drops entries whose stored
 * version ≠ the preset's CURRENT version, so a preset version bump can never
 * render a stale-footprint arrangement.
 *
 * ONE-PAINT TRADEOFF (owner-accepted, same as `ww.prefs.v1`): the server and
 * the first client paint cannot read localStorage, so a hard reload renders
 * the AUTHORED preset once and the saved arrangement swaps in on mount.
 *
 * MULTI-TAB: last-write-wins, by design — no `storage`-event sync. Two tabs
 * editing the same board each write-through their own commits; the last
 * writer's page snapshot replaces the other's on its next commit. Quota /
 * private-mode write failures are swallowed (theme-prefs pattern): the board
 * stays fully live for the session, persistence silently degrades to
 * session-only.
 *
 * Pure core (parse/serialize/upsert/drop/reconcile) is node-testable without
 * a DOM; the storage adapter guards `typeof window` so importing this module
 * on the server is inert.
 */
import type { RegionArrangement, SessionPlacement } from "./grid-session";

/** localStorage key — namespaced, versioned (the `v` envelope field). */
export const BOARD_STORAGE_KEY = "ww.board.v1";

/** One page's saved arrangement set, stamped with the preset format version
 * it was made at (see `reconcileVersion`). */
export interface SavedBoardPage {
  version: 1 | 2;
  regions: Record<string, RegionArrangement>;
}

/** The persisted envelope. `pages` is keyed by session page id
 * (`${theme}:${page}`) — the same key the session store uses. */
export interface SavedBoards {
  v: 1;
  pages: Record<string, SavedBoardPage>;
}

/** Upper bound on a saved page's total placements. A page beyond it is
 * garbage by construction (real boards carry tens of items, not thousands) —
 * dropping the whole page is the honest read, and it caps the parse cost of
 * hostile/corrupted blobs. */
const MAX_PAGE_ITEMS = 2_000;

/** Upper bound on any single cell coordinate/extent. Finite integers beyond
 * this are treated as corrupted values, not placements the grid should ever
 * honor (the DOM data-attributes would carry the garbage onward). */
const MAX_CELLS = 100_000;

/** A fresh empty store — a NEW object per call, never a shared constant, so
 * a caller mutating a parse result can never leak into the next read. */
function emptyBoards(): SavedBoards {
  return { v: 1, pages: {} };
}

/** Number.isInteger already rejects NaN/Infinity; the bound check keeps
 * absurd-but-finite garbage out of the placements. */
function isCellCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_CELLS
  );
}

/** One item's placement guard: origin ≥ 0, extent ≥ 1, all finite integers
 * within the cell bound. */
function isSavedPlacement(value: unknown): value is SessionPlacement {
  if (typeof value !== "object" || value === null) return false;
  const { x, y, cols, rows } = value as Record<string, unknown>;
  return (
    isCellCount(x) &&
    isCellCount(y) &&
    isCellCount(cols) &&
    cols >= 1 &&
    isCellCount(rows) &&
    rows >= 1
  );
}

/** One region's arrangement guard: positive-integer column count plus a
 * well-formed items record. */
function parseSavedRegion(value: unknown): RegionArrangement | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.columns !== "number" ||
    !Number.isInteger(candidate.columns) ||
    candidate.columns < 1 ||
    candidate.columns > MAX_CELLS
  ) {
    return null;
  }
  if (typeof candidate.items !== "object" || candidate.items === null) return null;
  if (Array.isArray(candidate.items)) return null; // items is a record, never a list
  const items: Record<string, SessionPlacement> = {};
  for (const [id, item] of Object.entries(candidate.items)) {
    if (!isSavedPlacement(item)) continue; // drop the item, keep its siblings
    items[id] = { x: item.x, y: item.y, cols: item.cols, rows: item.rows };
  }
  return { columns: candidate.columns, items };
}

/**
 * Defensive parse (theme-prefs pattern): anything that isn't the expected
 * envelope — invalid JSON, non-object, `v !== 1`, missing/invalid `pages` —
 * reads as empty. Per page: the `version` must be 1 or 2 and every region is
 * validated individually; a malformed region/item is DROPPED, not fatal to
 * its siblings or the store (a corrupted cell must not cost the user their
 * whole saved dashboard). A page exceeding {@link MAX_PAGE_ITEMS} total
 * items, or with a non-object `regions`, is invalid as a whole and dropped.
 */
export function parseSavedBoards(raw: string | null): SavedBoards {
  if (raw === null || raw.length === 0) return emptyBoards();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyBoards();
  }
  if (typeof data !== "object" || data === null) return emptyBoards();
  const envelope = data as Record<string, unknown>;
  if (envelope.v !== 1) return emptyBoards();
  if (typeof envelope.pages !== "object" || envelope.pages === null) {
    return emptyBoards();
  }
  if (Array.isArray(envelope.pages)) return emptyBoards(); // pages is a record
  const boards = emptyBoards();
  for (const [pageId, page] of Object.entries(envelope.pages)) {
    const saved = parseSavedPage(page);
    if (saved !== null) boards.pages[pageId] = saved;
  }
  return boards;
}

function parseSavedPage(value: unknown): SavedBoardPage | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 && candidate.version !== 2) return null;
  if (typeof candidate.regions !== "object" || candidate.regions === null) {
    return null;
  }
  if (Array.isArray(candidate.regions)) return null; // regions is a record
  const regions: Record<string, RegionArrangement> = {};
  let totalItems = 0;
  for (const [regionId, region] of Object.entries(candidate.regions)) {
    const parsed = parseSavedRegion(region);
    if (parsed === null) continue; // drop the region, keep the page
    totalItems += Object.keys(parsed.items).length;
    if (totalItems > MAX_PAGE_ITEMS) return null; // page invalid as a whole
    regions[regionId] = parsed;
  }
  return { version: candidate.version, regions };
}

/** Serialize a store for localStorage (the write side of the round trip). */
export function serializeSavedBoards(boards: SavedBoards): string {
  return JSON.stringify(boards);
}

/** Insert/replace one page — IMMUTABLE: a new store object, the input
 * untouched (callers may keep a snapshot for Undo while mutating forward). */
export function upsertPage(
  boards: SavedBoards,
  pageId: string,
  page: SavedBoardPage,
): SavedBoards {
  return { v: 1, pages: { ...boards.pages, [pageId]: page } };
}

/** Remove one page; the input object is returned UNCHANGED (same reference)
 * when the page is absent — nothing dropped means nothing to copy. */
export function dropPage(boards: SavedBoards, pageId: string): SavedBoards {
  if (!(pageId in boards.pages)) return boards;
  const pages = { ...boards.pages };
  delete pages[pageId];
  return { v: 1, pages };
}

/** Drop EVERY page of one theme (prefix `${theme}:` — the session key
 * namespace). Returns the pruned store plus the dropped page ids in
 * insertion order, so the caller can report/Undo honestly. */
export function dropPagesWithPrefix(
  boards: SavedBoards,
  theme: string,
): { boards: SavedBoards; droppedPageIds: string[] } {
  const prefix = `${theme}:`;
  const droppedPageIds = Object.keys(boards.pages).filter((pageId) =>
    pageId.startsWith(prefix),
  );
  if (droppedPageIds.length === 0) return { boards, droppedPageIds };
  const pages: Record<string, SavedBoardPage> = {};
  for (const [pageId, page] of Object.entries(boards.pages)) {
    if (!pageId.startsWith(prefix)) pages[pageId] = page;
  }
  return { boards: { v: 1, pages }, droppedPageIds };
}

/**
 * The version contract's enforcement point (layout-types.ts): a saved page
 * reconciles with the preset's CURRENT format generation or is dropped
 * (null). v1 arrangements cannot be reinterpreted under v2's per-breakpoint
 * overrides — the footprints they pin may no longer exist on the ladder.
 */
export function reconcileVersion(
  page: SavedBoardPage,
  currentVersion: 1 | 2,
): SavedBoardPage | null {
  return page.version === currentVersion ? page : null;
}

/**
 * Storage adapter — guarded reads/writes (theme-prefs pattern). SSR reads
 * return empty (the server must render the authored preset) and writes
 * no-op; quota/private-mode failures are swallowed so a full localStorage
 * never takes the board down — persistence degrades to session-only.
 */
export function readSavedBoards(): SavedBoards {
  if (typeof window === "undefined") return emptyBoards();
  try {
    return parseSavedBoards(window.localStorage.getItem(BOARD_STORAGE_KEY));
  } catch {
    return emptyBoards();
  }
}

export function writeSavedBoards(boards: SavedBoards): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BOARD_STORAGE_KEY, serializeSavedBoards(boards));
  } catch {
    // Private mode / quota — the session board stays live; nothing to do.
  }
}
