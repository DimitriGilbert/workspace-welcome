/**
 * Snapped drag/resize controller for the grid canvas (master plan §3.3, §5 W3).
 *
 * THE dnd-kit-swap seam: everything pointer/keyboard about moving and
 * resizing lives in this hook and nowhere else. Widgets, the canvas, and
 * themes never touch drag mechanics — if dnd-kit replaces the hand-rolled
 * controller later, only this file changes.
 *
 * Pointer path: pointerdown on a handle → `setPointerCapture` best-effort
 * (synthetic-event safe) with window-level move/up listeners as the real
 * transport (they receive retargeted captured events too, so one code path
 * serves both). The gesture PREVIEWS via the snapped ghost outline and
 * commits on pointerup: the moved widget is pinned in the session store and
 * the region re-packs around it.
 *
 * Keyboard path is PRIMARY (and the scripted test surface): handles are
 * focusable buttons with aria-labels; arrow keys move/resize by one cell
 * with LIVE commit (session write + re-pack per keypress) — a resize arrow
 * grows along its handle's direction and Shift+Arrow resizes the opposite
 * edge (negative direction); Escape reverts the widget to its session-start
 * placement (see `grid-session.ts`); every outcome is announced through a
 * single `aria-live="polite"` message the canvas renders.
 *
 * Clamps: motion never exceeds the grid (x within `[0, columns - cols]`,
 * y ≥ 0) and resize never goes below the registry `min` (supplied per widget
 * by the canvas via the registry lookup) nor past column 1 / row 1 — a north
 * or west resize moves the widget's ORIGIN (x/y shift while cols/rows grow),
 * so its clamps bound the origin. Gestures that would overlap an immovable
 * widget (authored anchor or session-pinned) are REFUSED — moves AND
 * resizes alike: the pointer path previews on the ghost and refuses at
 * commit (the widget is still at its pre-gesture placement), the keyboard
 * path refuses the keypress live; every refusal is announced. The packer
 * never pushes fixed blocks. No new dependencies — hand-rolled (settled).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import { commitArrangement, getBaseline } from "./grid-session";
import type { SessionPlacement } from "./grid-session";
import { settleArrangement } from "@/lib/grid-layout/pack-grid";
import type { ParsedSize } from "./size-class";

/** Resize affordance directions: the four edges (north/south/east/west) and
 * the four corners. North/west growth moves the widget's origin (x/y shift
 * while cols/rows grow); south/east growth keeps the origin. */
export type ResizeEdge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

/** Human direction words for announcements, keyed by resize direction. */
const EDGE_WORDS: Record<ResizeEdge, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  nw: "north-west",
  ne: "north-east",
  sw: "south-west",
  se: "south-east",
};

/** Arrow-key resize vocabulary: which footprint axis the key drives and the
 * grid-space sign of one step. Handle direction + Shift resolve the final
 * growth sign (see `resizeKeyDown`). */
const RESIZE_KEYS = {
  ArrowUp: { axis: "rows", delta: -1 },
  ArrowDown: { axis: "rows", delta: 1 },
  ArrowLeft: { axis: "cols", delta: -1 },
  ArrowRight: { axis: "cols", delta: 1 },
} as const;

/** What a gesture does: reposition, or grow/shrink from a resize handle. */
export type DragMode = "move" | ResizeEdge;

/** Per-widget metadata the canvas derives from the registry + preset. */
export interface DragWidgetMeta {
  /** Region grid the widget lives in (the pack/re-pack scope). */
  regionId: string;
  /** Human label for aria-labels and announcements. */
  label: string;
  /** Registry cell floor — resize clamps to it (default 1x1). */
  min: ParsedSize;
}

/** A committed or previewed placement, as the controller sees it. */
export interface DragPlacement {
  id: string;
  regionId: string;
  x: number;
  y: number;
  cols: number;
  rows: number;
  /** Immovable for move-collision: authored `at` anchors and session-pinned
   * widgets never yield their cells (owner decision — the packer has no
   * pushing), so a move landing on one is REFUSED. Absent = movable. */
  fixed?: boolean;
}

/** Axis-aligned rectangle overlap in grid cells — the move-collision test. */
function placementsOverlap(a: DragPlacement, b: DragPlacement): boolean {
  return (
    a.x < b.x + b.cols &&
    b.x < a.x + a.cols &&
    a.y < b.y + b.rows &&
    b.y < a.y + a.rows
  );
}

/**
 * Resize geometry for any direction: applies the signed per-axis cell deltas
 * of a gesture to `origin`. Positive growth grows the footprint; growing via
 * the north/west edges moves the ORIGIN instead (y/x decrease while rows/cols
 * grow — the opposite edge stays put). Clamps: never below the registry min
 * (`minCols`/`minRows`), never above column 1 / row 1 (`x, y ≥ 0`), and east
 * growth never passes the grid's right edge. South growth is unbounded (the
 * grid's auto-rows extend downward). Pure — pointer preview and keyboard
 * steps share it so both paths clamp identically.
 */
function applyResize(
  origin: DragPlacement,
  edge: ResizeEdge,
  columns: number,
  minCols: number,
  minRows: number,
  deltaCols: number,
  deltaRows: number,
): DragPlacement {
  const next = { ...origin };
  if (edge === "e" || edge === "ne" || edge === "se") {
    next.cols = clamp(origin.cols + deltaCols, minCols, Math.max(minCols, columns - origin.x));
  }
  if (edge === "w" || edge === "nw" || edge === "sw") {
    const grow = clamp(-deltaCols, minCols - origin.cols, origin.x);
    next.x = origin.x - grow;
    next.cols = origin.cols + grow;
  }
  if (edge === "s" || edge === "sw" || edge === "se") {
    next.rows = Math.max(minRows, origin.rows + deltaRows);
  }
  if (edge === "n" || edge === "ne" || edge === "nw") {
    const grow = clamp(-deltaRows, minRows - origin.rows, origin.y);
    next.y = origin.y - grow;
    next.rows = origin.rows + grow;
  }
  return next;
}

export interface UseGridDragOptions {
  /** Session-store key — the page id. */
  pageId: string;
  /** Current viewport column count (the active grid width). */
  columns: number;
  /** Row unit height in px (the preset's `cell.h`). */
  cellH: number;
  /** Grid gap in px. */
  gap: number;
  /** Metadata for every placed widget, keyed by widget instance id. */
  widgets: ReadonlyMap<string, DragWidgetMeta>;
  /** The committed placements the gestures start from. */
  placements: readonly DragPlacement[];
  /** Region grid element lookup — px math needs the board's width. */
  regionElement: (regionId: string) => HTMLElement | null;
}

/** Live gesture identity the canvas reads (e.g. to stamp `data-dragging`). */
export interface ActiveDrag {
  widgetId: string;
  mode: DragMode;
}

export interface GridDragController {
  /** The in-flight pointer gesture, if any. */
  active: ActiveDrag | null;
  /** Snapped ghost outline target (pointer path only — keyboard commits live). */
  ghost: DragPlacement | null;
  /** Last announcement text; render in an `aria-live="polite"` region. */
  message: string;
  startMove(widgetId: string, regionId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
  startResize(
    widgetId: string,
    regionId: string,
    edge: ResizeEdge,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void;
  moveKeyDown(widgetId: string, event: ReactKeyboardEvent<HTMLButtonElement>): void;
  resizeKeyDown(
    widgetId: string,
    edge: ResizeEdge,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void;
}

interface PointerInteraction {
  widgetId: string;
  regionId: string;
  mode: DragMode;
  pointerId: number;
  handle: HTMLButtonElement;
  startClientX: number;
  startClientY: number;
  origin: DragPlacement;
  preview: DragPlacement;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * The drag/resize controller. One instance per board; all handlers are
 * referentially stable — everything mutable flows through refs, so the
 * window-level listeners never go stale across re-renders/re-packs.
 */
export function useGridDrag(options: UseGridDragOptions): GridDragController {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [ghost, setGhost] = useState<DragPlacement | null>(null);
  const [message, setMessage] = useState("");
  const interactionRef = useRef<PointerInteraction | null>(null);

  // Latest-value mirror: window listeners and live commits read current
  // options without re-binding (and without reading stale render closures).
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const findPlacement = useCallback((widgetId: string): DragPlacement | null => {
    return latest.current.placements.find((p) => p.id === widgetId) ?? null;
  }, []);

  const cellUnits = useCallback(
    (regionId: string): { unitX: number; unitY: number } => {
      const { cellH, gap, columns, regionElement } = latest.current;
      const board = regionElement(regionId);
      const width = board?.getBoundingClientRect().width ?? 0;
      const columnWidth = columns > 0 ? (width - gap * (columns - 1)) / columns : 0;
      return {
        unitX: (columnWidth > 0 ? columnWidth : cellH) + gap,
        unitY: cellH + gap,
      };
    },
    [],
  );

  const announce = useCallback((text: string): void => {
    setMessage(text);
  }, []);

  /**
   * The first IMMOVABLE widget (an authored `at` anchor — preset geometry)
   * whose cells the target would overlap, or null. Authored anchors never
   * move and never yield, so a drop onto one is refused. Session pins are
   * NOT blockers: an explicit user drop always wins — pinned occupants are
   * swapped or re-homed by `settleArrangement` (owner round 5: pins protect
   * placements from automatic reflow, never from the user).
   */
  const findFixedBlocker = useCallback((target: DragPlacement): DragPlacement | null => {
    for (const other of latest.current.placements) {
      if (other.id === target.id || other.regionId !== target.regionId) continue;
      if (other.fixed !== true) continue;
      if (placementsOverlap(target, other)) return other;
    }
    return null;
  }, []);

  const commitPlacement = useCallback(
    (next: DragPlacement, mode: DragMode, direction?: string): void => {
      const { pageId, widgets, columns } = latest.current;
      const regionPlacements = latest.current.placements.filter(
        (p) => p.regionId === next.regionId,
      );
      // An explicit drop is NEVER refused for occupancy: the dragged widget
      // lands exactly at the preview and `settleArrangement` re-homes the
      // occupants it displaced (swap for same-size tiles, push below
      // otherwise). Only displaced widgets re-home — nothing else moves.
      const items = regionPlacements.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        cols: p.cols,
        rows: p.rows,
      }));
      const old = items.find((i) => i.id === next.id) ?? null;
      const settled = settleArrangement(
        items.map((i) =>
          i.id === next.id
            ? { ...i, x: next.x, y: next.y, cols: next.cols, rows: next.rows }
            : i,
        ),
        next.id,
        old,
      );
      const displaced = settled.filter((i) => {
        const before = items.find((item) => item.id === i.id);
        return i.id !== next.id && before !== undefined && (before.x !== i.x || before.y !== i.y);
      });
      const arrangementItems: Record<string, SessionPlacement> = {};
      for (const item of settled) {
        arrangementItems[item.id] = { x: item.x, y: item.y, cols: item.cols, rows: item.rows };
      }
      // The pre-mutation cells — the baseline "Escape reverts to" is where
      // this edit FOUND each edited widget (see commitArrangement).
      const preItems: Record<string, SessionPlacement> = {};
      for (const p of regionPlacements) {
        preItems[p.id] = { x: p.x, y: p.y, cols: p.cols, rows: p.rows };
      }
      commitArrangement(
        pageId,
        next.regionId,
        columns,
        arrangementItems,
        displaced.map((i) => i.id).concat(next.id),
        preItems,
      );
      const label = widgets.get(next.id)?.label ?? next.id;
      announce(
        mode === "move"
          ? `${label} moved to column ${next.x + 1}, row ${next.y + 1}`
          : direction === undefined
            ? `${label} resized to ${next.cols} by ${next.rows} cells`
            : `${label} resized ${direction} to ${next.cols} by ${next.rows} cells`,
      );
    },
    [announce],
  );

  const revertToSessionStart = useCallback(
    (widgetId: string): void => {
      const { pageId, widgets, columns } = latest.current;
      const baseline = getBaseline(pageId, widgetId);
      const label = widgets.get(widgetId)?.label ?? widgetId;
      if (baseline === null) {
        announce(`${label} has no session changes to revert`);
        return;
      }
      // The widget returns to its session-start cell; anything occupying it
      // yields below (same incremental settle as a move — no refusals).
      const regionId = latest.current.placements.find((p) => p.id === widgetId)?.regionId;
      if (regionId === undefined) {
        announce(`${label} returned to its session start position`);
        return;
      }
      const items = latest.current.placements
        .filter((p) => p.regionId === regionId)
        .map((p) => ({ id: p.id, x: p.x, y: p.y, cols: p.cols, rows: p.rows }));
      const settled = settleArrangement(
        items.map((i) =>
          i.id === widgetId
            ? { ...i, x: baseline.x, y: baseline.y, cols: baseline.cols, rows: baseline.rows }
            : i,
        ),
        widgetId,
        items.find((i) => i.id === widgetId) ?? null,
      );
      const arrangementItems: Record<string, SessionPlacement> = {};
      for (const item of settled) {
        arrangementItems[item.id] = { x: item.x, y: item.y, cols: item.cols, rows: item.rows };
      }
      const preItems: Record<string, SessionPlacement> = {};
      for (const i of items) {
        preItems[i.id] = { x: i.x, y: i.y, cols: i.cols, rows: i.rows };
      }
      commitArrangement(pageId, regionId, columns, arrangementItems, [widgetId], preItems);
      announce(`${label} returned to its session start position`);
    },
    [announce],
  );

  const endInteraction = useCallback((): void => {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (interaction) {
      try {
        interaction.handle.releasePointerCapture(interaction.pointerId);
      } catch {
        // Capture may already be gone (pointercancel, DOM teardown) — the
        // window listeners below are the real transport either way.
      }
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onWindowKeyDown, true);
    setActive(null);
    setGhost(null);
  }, []);

  // --- Window-level transport (stable identities for add/remove) -----------

  const onPointerMove = useCallback((event: PointerEvent): void => {
    const interaction = interactionRef.current;
    if (interaction === null || event.pointerId !== interaction.pointerId) return;
    const { columns, widgets } = latest.current;
    const { unitX, unitY } = cellUnits(interaction.regionId);
    const dx = event.clientX - interaction.startClientX;
    const dy = event.clientY - interaction.startClientY;
    const { origin } = interaction;
    const meta = widgets.get(interaction.widgetId);
    const minCols = Math.max(1, meta?.min.cols ?? 1);
    const minRows = Math.max(1, meta?.min.rows ?? 1);

    let preview: DragPlacement;
    if (interaction.mode === "move") {
      preview = {
        ...origin,
        x: clamp(origin.x + Math.round(dx / unitX), 0, Math.max(0, columns - origin.cols)),
        y: Math.max(0, origin.y + Math.round(dy / unitY)),
      };
    } else {
      preview = applyResize(
        origin,
        interaction.mode,
        columns,
        minCols,
        minRows,
        Math.round(dx / unitX),
        Math.round(dy / unitY),
      );
    }
    interaction.preview = preview;
    setGhost(preview);
  }, [cellUnits]);

  const onPointerUp = useCallback(
    (event: PointerEvent): void => {
      const interaction = interactionRef.current;
      if (interaction === null || event.pointerId !== interaction.pointerId) return;
      const preview = interaction.preview;
      const mode = interaction.mode;
      const { widgets } = latest.current;
      endInteraction();
      const blocker = findFixedBlocker(preview);
      if (blocker !== null) {
        // Refuse: the target would overlap a widget that can't move. Nothing
        // was committed during the gesture, so the widget is still at its
        // pre-gesture placement — only the ghost needs to go.
        const label = widgets.get(interaction.widgetId)?.label ?? interaction.widgetId;
        const blockerLabel = widgets.get(blocker.id)?.label ?? blocker.id;
        announce(
          mode === "move"
            ? `${label} can't move there — ${blockerLabel} occupies that spot`
            : `${label} can't resize there — ${blockerLabel} occupies that spot`,
        );
        return;
      }
      commitPlacement(preview, mode, mode === "move" ? undefined : EDGE_WORDS[mode]);
    },
    [announce, commitPlacement, endInteraction, findFixedBlocker],
  );

  const onPointerCancel = useCallback(
    (event: PointerEvent): void => {
      const interaction = interactionRef.current;
      if (interaction === null || event.pointerId !== interaction.pointerId) return;
      const label = latest.current.widgets.get(interaction.widgetId)?.label ?? interaction.widgetId;
      endInteraction();
      announce(`${label} ${interaction.mode === "move" ? "move" : "resize"} cancelled`);
    },
    [announce, endInteraction],
  );

  const onWindowKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      const interaction = interactionRef.current;
      if (interaction === null || event.key !== "Escape") return;
      event.preventDefault();
      const widgetId = interaction.widgetId;
      endInteraction();
      revertToSessionStart(widgetId);
    },
    [endInteraction, revertToSessionStart],
  );

  const startInteraction = useCallback(
    (
      widgetId: string,
      regionId: string,
      mode: DragMode,
      event: ReactPointerEvent<HTMLButtonElement>,
    ): void => {
      if (interactionRef.current !== null) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const origin = latest.current.placements.find((p) => p.id === widgetId);
      if (origin === undefined) return;
      event.preventDefault();
      const handle = event.currentTarget;
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Best-effort: the window-level move/up listeners work without it.
      }
      interactionRef.current = {
        widgetId,
        regionId,
        mode,
        pointerId: event.pointerId,
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        origin,
        preview: origin,
      };
      setActive({ widgetId, mode });
      setGhost(null);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("keydown", onWindowKeyDown, true);
    },
    [onPointerCancel, onPointerMove, onPointerUp, onWindowKeyDown],
  );

  // --- Public handlers ------------------------------------------------------

  const startMove = useCallback(
    (widgetId: string, regionId: string, event: ReactPointerEvent<HTMLButtonElement>): void => {
      startInteraction(widgetId, regionId, "move", event);
    },
    [startInteraction],
  );

  const startResize = useCallback(
    (
      widgetId: string,
      regionId: string,
      edge: ResizeEdge,
      event: ReactPointerEvent<HTMLButtonElement>,
    ): void => {
      startInteraction(widgetId, regionId, edge, event);
    },
    [startInteraction],
  );

  const moveKeyDown = useCallback(
    (widgetId: string, event: ReactKeyboardEvent<HTMLButtonElement>): void => {
      const origin = findPlacement(widgetId);
      if (origin === null) return;
      const { columns, widgets } = latest.current;
      const label = widgets.get(widgetId)?.label ?? widgetId;
      const directions = {
        ArrowLeft: { dx: -1, dy: 0, word: "left" },
        ArrowRight: { dx: 1, dy: 0, word: "right" },
        ArrowUp: { dx: 0, dy: -1, word: "up" },
        ArrowDown: { dx: 0, dy: 1, word: "down" },
      } as const;
      if (event.key === "Escape") {
        event.preventDefault();
        revertToSessionStart(widgetId);
        return;
      }
      const step = directions[event.key as keyof typeof directions];
      if (step === undefined) return;
      event.preventDefault();
      const x =
        step.dx === 0
          ? origin.x
          : clamp(origin.x + step.dx, 0, Math.max(0, columns - origin.cols));
      const y = step.dy === 0 ? origin.y : Math.max(0, origin.y + step.dy);
      if (x === origin.x && y === origin.y) {
        announce(`${label} is already at the ${step.word} edge`);
        return;
      }
      const next = { ...origin, x, y };
      const blocker = findFixedBlocker(next);
      if (blocker !== null) {
        const blockerLabel = widgets.get(blocker.id)?.label ?? blocker.id;
        announce(`${label} can't move ${step.word} — ${blockerLabel} occupies that spot`);
        return;
      }
      commitPlacement(next, "move");
    },
    [announce, commitPlacement, findFixedBlocker, findPlacement, revertToSessionStart],
  );

  const resizeKeyDown = useCallback(
    (
      widgetId: string,
      edge: ResizeEdge,
      event: ReactKeyboardEvent<HTMLButtonElement>,
    ): void => {
      const origin = findPlacement(widgetId);
      if (origin === null) return;
      const { columns, widgets } = latest.current;
      const meta = widgets.get(widgetId);
      const label = meta?.label ?? widgetId;
      if (event.key === "Escape") {
        event.preventDefault();
        revertToSessionStart(widgetId);
        return;
      }
      const key = RESIZE_KEYS[event.key as keyof typeof RESIZE_KEYS];
      if (key === undefined) return;
      const horizontal = edge === "e" || edge === "ne" || edge === "se";
      const westward = edge === "w" || edge === "nw" || edge === "sw";
      const vertical = edge === "s" || edge === "se" || edge === "sw";
      const northward = edge === "n" || edge === "ne" || edge === "nw";
      const colsAxis = key.axis === "cols";
      // A key outside the handle's axes is left to the browser (same as the
      // move handle ignoring cross-axis arrows).
      if (colsAxis ? !(horizontal || westward) : !(vertical || northward)) return;
      event.preventDefault();
      const minCols = Math.max(1, meta?.min.cols ?? 1);
      const minRows = Math.max(1, meta?.min.rows ?? 1);
      // Growth is positive along the handle's outward direction; Shift+Arrow
      // resizes the opposite edge — the negative direction.
      const outward = colsAxis ? (horizontal ? 1 : -1) : vertical ? 1 : -1;
      const requested = key.delta * outward * (event.shiftKey ? -1 : 1);
      // `applyResize` speaks pointer-delta convention (a west/north GROW is a
      // negative delta — the edge moves left/up), so a keyboard growth amount
      // is negated for the origin-shifting directions.
      const next = applyResize(
        origin,
        edge,
        columns,
        minCols,
        minRows,
        colsAxis ? (horizontal ? requested : -requested) : 0,
        colsAxis ? 0 : vertical ? requested : -requested,
      );
      const unchanged =
        next.x === origin.x &&
        next.y === origin.y &&
        next.cols === origin.cols &&
        next.rows === origin.rows;
      if (unchanged) {
        // Clamped from both sides: a blocked grow means the grid edge (or the
        // origin floor) caps the footprint — its maximum; a blocked shrink is
        // the registry minimum.
        announce(
          requested > 0
            ? `${label} is already at its maximum size`
            : `${label} is already at its minimum size`,
        );
        return;
      }
      // The announcement names the edge being resized, i.e. the direction of
      // this handle's axis (a corner keypress moves one axis at a time).
      const direction = colsAxis ? (horizontal ? "east" : "west") : vertical ? "south" : "north";
      const blocker = findFixedBlocker(next);
      if (blocker !== null) {
        const blockerLabel = widgets.get(blocker.id)?.label ?? blocker.id;
        announce(`${label} can't resize ${direction} — ${blockerLabel} occupies that spot`);
        return;
      }
      commitPlacement(next, edge, direction);
    },
    [announce, commitPlacement, findFixedBlocker, findPlacement, revertToSessionStart],
  );

  return {
    active,
    ghost,
    message,
    startMove,
    startResize,
    moveKeyDown,
    resizeKeyDown,
  };
}
