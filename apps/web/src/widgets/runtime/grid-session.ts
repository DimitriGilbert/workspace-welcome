/**
 * Session arrangement store (master plan §5 W3; settled #4, owner rounds 3-5).
 *
 * Module-scope, keyed by page id. A manual move/resize commits the WHOLE
 * region arrangement (the settled board after the mutation) — an explicit
 * user drop is never refused for occupancy: the dragged widget lands exactly
 * at its preview and widgets it displaced are re-homed by the packer's
 * `settleArrangement` before the commit. The arrangement renders verbatim —
 * pins protect placements from automatic reflow, they never block a user.
 * The store lives in module memory — never `sessionStorage`/`localStorage` —
 * so a reload resets it and the authored preset re-packs (settled #4).
 *
 * The store is a tiny observable: the grid canvas subscribes per page via
 * `useSyncExternalStore`, and every write replaces the page snapshot
 * immutably. SSR: the server never writes, and reads before the first client
 * commit return null, so server HTML is the authored layout — hydration
 * matches pixel for pixel.
 */

/** One manually-committed footprint + position, in grid cells. */
export interface SessionPlacement {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

/** The committed arrangement of one region: every widget's placement. */
export interface RegionArrangement {
  /** Grid width the arrangement was made at; a breakpoint change falls back
   * to the authored pack until the next edit re-records it. */
  columns: number;
  /** Widget id → placement, for EVERY widget of the region. */
  items: Record<string, SessionPlacement>;
}

interface PageSession {
  regions: Record<string, RegionArrangement>;
  /** Placement of each edited widget at its FIRST edit this session — the
   * baseline "Escape reverts to". */
  baselines: Record<string, SessionPlacement>;
}

const sessions = new Map<string, PageSession>();
const listeners = new Map<string, Set<() => void>>();

function emit(pageId: string): void {
  const set = listeners.get(pageId);
  if (set === undefined) return;
  for (const listener of set) listener();
}

/** The page's whole session snapshot (null before the first commit) —
 * reference-stable while unchanged, the external-store contract. */
export function getPageSession(pageId: string): PageSession | null {
  return sessions.get(pageId) ?? null;
}

/** Subscribe to a page's arrangement; returns the unsubscribe function. */
export function subscribeSession(pageId: string, listener: () => void): () => void {
  let set = listeners.get(pageId);
  if (set === undefined) {
    set = new Set();
    listeners.set(pageId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/**
 * Commit the settled arrangement of one region after a mutation. `editedIds`
 * are the widgets the mutation touched (the moved/resized one plus anything
 * it displaced) — their baseline ("Escape reverts to") is captured on their
 * first edit and never overwritten.
 */
export function commitArrangement(
  pageId: string,
  regionId: string,
  columns: number,
  items: Readonly<Record<string, SessionPlacement>>,
  editedIds: readonly string[],
): void {
  // IMMUTABLE snapshot swap: the canvas subscribes through
  // useSyncExternalStore — mutating the page object in place would keep the
  // snapshot reference identical and React would skip the re-render.
  const previous = sessions.get(pageId) ?? { regions: {}, baselines: {} };
  const baselines = { ...previous.baselines };
  for (const id of editedIds) {
    if (baselines[id] === undefined) {
      const item = items[id];
      if (item !== undefined) baselines[id] = { ...item };
    }
  }
  sessions.set(pageId, {
    regions: { ...previous.regions, [regionId]: { columns, items: { ...items } } },
    baselines,
  });
  emit(pageId);
}

/** The placement a widget had at its first edit this session (Escape target). */
export function getBaseline(pageId: string, widgetId: string): SessionPlacement | null {
  return sessions.get(pageId)?.baselines[widgetId] ?? null;
}

/** Drop a page's whole session — used by tests; the store also resets
 * naturally on reload. */
export function clearPageSession(pageId: string): void {
  if (!sessions.has(pageId)) return;
  sessions.delete(pageId);
  emit(pageId);
}
