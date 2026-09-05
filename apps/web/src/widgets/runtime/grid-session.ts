/**
 * Session placement store (master plan §5 W3; settled decision #4).
 *
 * Module-scope, keyed by page id. A manual drag/resize shadows the authored
 * layout for the SESSION only: the store lives in module memory — never in
 * `sessionStorage`/`localStorage` — so a reload resets it (settled #4). Every
 * value is plain JSON ({@link SessionPlacement}), so a persistence layer can
 * serialize the exact same shape later without translation.
 *
 * The store is a tiny observable: the grid canvas subscribes per page through
 * `useSyncExternalStore`, and every write replaces the page snapshot
 * immutably (stable identity while unchanged — the external-store contract).
 *
 * SSR: the server never writes, and reads before the first client commit
 * return the shared EMPTY snapshot, so server HTML is the authored layout and
 * hydration matches pixel for pixel.
 */

/** One manually-committed footprint + position, in grid cells. */
export interface SessionPlacement {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

/** Current session overrides for one page, keyed by widget instance id. */
export type SessionPlacements = Readonly<Record<string, SessionPlacement>>;

/** Shared empty snapshot — also the `useSyncExternalStore` server snapshot. */
export const EMPTY_SESSION_PLACEMENTS: SessionPlacements = Object.freeze({});

interface PageSession {
  /** Placement of each edited widget at its FIRST edit this session. */
  baselines: Record<string, SessionPlacement>;
  /** Current overrides — the snapshot subscribers see. */
  overrides: Record<string, SessionPlacement>;
}

const sessions = new Map<string, PageSession>();
const listeners = new Map<string, Set<() => void>>();

function emit(pageId: string): void {
  const set = listeners.get(pageId);
  if (set === undefined) return;
  for (const listener of set) listener();
}

/** Current overrides for a page (empty when the session has no edits). */
export function getSessionPlacements(pageId: string): SessionPlacements {
  return sessions.get(pageId)?.overrides ?? EMPTY_SESSION_PLACEMENTS;
}

/** Subscribe to a page's overrides; returns the unsubscribe function. */
export function subscribeSession(pageId: string, listener: () => void): () => void {
  let set = listeners.get(pageId);
  if (set === undefined) {
    set = new Set();
    listeners.set(pageId, set);
  }
  const subscribers = set;
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Commit a manual move/resize: the widget is pinned at `placement` (moved
 * widgets lead the re-pack as fixed items) and shadows any authored `at`
 * anchor until reload. `sessionStart` is the widget's placement at the
 * moment of its FIRST edit — the baseline "Escape reverts to" — and is
 * captured once, on that first commit.
 */
export function commitSessionPlacement(
  pageId: string,
  widgetId: string,
  placement: SessionPlacement,
  sessionStart: SessionPlacement,
): void {
  const previous =
    sessions.get(pageId) ?? { baselines: {}, overrides: {} };
  const baselines =
    previous.baselines[widgetId] === undefined
      ? { ...previous.baselines, [widgetId]: { ...sessionStart } }
      : previous.baselines;
  sessions.set(pageId, {
    baselines,
    overrides: { ...previous.overrides, [widgetId]: { ...placement } },
  });
  emit(pageId);
}

/**
 * Revert one widget to its session-start placement: the override is re-pinned
 * at the recorded baseline so the widget lands EXACTLY where the session
 * found it, regardless of how other widgets re-packed around it. Returns the
 * restored baseline, or null when the widget has no session edits to revert.
 */
export function revertSessionPlacement(
  pageId: string,
  widgetId: string,
): SessionPlacement | null {
  const page = sessions.get(pageId);
  const baseline = page?.baselines[widgetId];
  if (page === undefined || baseline === undefined) return null;
  sessions.set(pageId, {
    ...page,
    overrides: { ...page.overrides, [widgetId]: { ...baseline } },
  });
  emit(pageId);
  return { ...baseline };
}

/** Drop a page's whole session (edits + baselines) — used on unmount in
 * principle, and by tests; the store also resets naturally on reload. */
export function clearPageSession(pageId: string): void {
  if (!sessions.has(pageId)) return;
  sessions.delete(pageId);
  emit(pageId);
}
