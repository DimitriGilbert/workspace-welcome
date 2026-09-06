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
 * with LIVE commit (session write + re-pack per keypress); Escape reverts
 * the widget to its session-start placement (see `grid-session.ts`); every
 * outcome is announced through a single `aria-live="polite"` message the
 * canvas renders.
 *
 * Clamps: motion never exceeds the grid (x within `[0, columns - cols]`,
 * y ≥ 0) and resize never goes below the registry `min` (supplied per widget
 * by the canvas via the registry lookup). Moves that would overlap an
 * immovable widget (authored anchor or session-pinned) are REFUSED — the
 * widget stays at its pre-move placement and the refusal is announced; the
 * packer never pushes fixed blocks. No new dependencies — hand-rolled
 * (settled).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import { commitSessionPlacement, revertSessionPlacement } from "./grid-session";
import type { SessionPlacement } from "./grid-session";
import type { ParsedSize } from "./size-class";

/** Resize affordance edges: east (width), south (height), south-east (both). */
export type ResizeEdge = "e" | "s" | "se";

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
   * The first immovable widget (`fixed: true` — authored anchor or pinned)
   * whose cells the target would overlap, or null. Movable widgets are never
   * blockers: the re-pack relocates them around the committed anchor without
   * pushing (owner decision — refuse rather than displace fixed blocks).
   */
  const findFixedBlocker = useCallback((target: DragPlacement): DragPlacement | null => {
    for (const other of latest.current.placements) {
      if (other.id === target.id || other.regionId !== target.regionId) continue;
      if (other.fixed !== true) continue;
      if (placementsOverlap(target, other)) return other;
    }
    return null;
  }, []);

  const commitPlacement = useCallback((next: DragPlacement, mode: DragMode): void => {
    const { pageId, widgets } = latest.current;
    const current = latest.current.placements.find((p) => p.id === next.id);
    const sessionStart: SessionPlacement = current
      ? { x: current.x, y: current.y, cols: current.cols, rows: current.rows }
      : { x: next.x, y: next.y, cols: next.cols, rows: next.rows };
    commitSessionPlacement(
      pageId,
      next.id,
      { x: next.x, y: next.y, cols: next.cols, rows: next.rows },
      sessionStart,
    );
    const label = widgets.get(next.id)?.label ?? next.id;
    announce(
      mode === "move"
        ? `${label} moved to column ${next.x + 1}, row ${next.y + 1}`
        : `${label} resized to ${next.cols} by ${next.rows} cells`,
    );
  }, [announce]);

  const revertToSessionStart = useCallback(
    (widgetId: string): void => {
      const { pageId, widgets } = latest.current;
      const restored = revertSessionPlacement(pageId, widgetId);
      const label = widgets.get(widgetId)?.label ?? widgetId;
      announce(
        restored === null
          ? `${label} has no session changes to revert`
          : `${label} returned to its session start position`,
      );
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
    const maxWidth = Math.max(minCols, columns - origin.x);

    let preview: DragPlacement;
    if (interaction.mode === "move") {
      preview = {
        ...origin,
        x: clamp(origin.x + Math.round(dx / unitX), 0, Math.max(0, columns - origin.cols)),
        y: Math.max(0, origin.y + Math.round(dy / unitY)),
      };
    } else {
      preview = { ...origin };
      if (interaction.mode === "e" || interaction.mode === "se") {
        preview.cols = clamp(origin.cols + Math.round(dx / unitX), minCols, maxWidth);
      }
      if (interaction.mode === "s" || interaction.mode === "se") {
        preview.rows = Math.max(minRows, origin.rows + Math.round(dy / unitY));
      }
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
      if (mode === "move") {
        const blocker = findFixedBlocker(preview);
        if (blocker !== null) {
          // Refuse: the drop target would overlap a widget that can't move.
          // Nothing was committed during the gesture, so the widget is still
          // at its pre-drag placement — only the ghost needs to go.
          const label = widgets.get(interaction.widgetId)?.label ?? interaction.widgetId;
          const blockerLabel = widgets.get(blocker.id)?.label ?? blocker.id;
          announce(`${label} can't move there — ${blockerLabel} occupies that spot`);
          return;
        }
      }
      commitPlacement(preview, mode);
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
      const horizontal = edge === "e" || edge === "se";
      const vertical = edge === "s" || edge === "se";
      const minCols = Math.max(1, meta?.min.cols ?? 1);
      const minRows = Math.max(1, meta?.min.rows ?? 1);
      const maxWidth = Math.max(minCols, columns - origin.x);
      const grows = event.key === "ArrowRight" || event.key === "ArrowDown";
      const shrinks = event.key === "ArrowLeft" || event.key === "ArrowUp";
      const horizontalKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const verticalKey = event.key === "ArrowUp" || event.key === "ArrowDown";
      if (!horizontalKey && !verticalKey) return;
      if ((horizontalKey && !horizontal) || (verticalKey && !vertical)) return;
      event.preventDefault();
      const nextCols = horizontal
        ? clamp(origin.cols + (grows ? 1 : -1), minCols, maxWidth)
        : origin.cols;
      const nextRows = vertical
        ? Math.max(minRows, origin.rows + (grows ? 1 : -1))
        : origin.rows;
      if (nextCols === origin.cols && nextRows === origin.rows) {
        announce(
          shrinks
            ? `${label} is already at its minimum size`
            : `${label} is already at its maximum size`,
        );
        return;
      }
      commitPlacement({ ...origin, cols: nextCols, rows: nextRows }, edge);
    },
    [announce, commitPlacement, findPlacement, revertToSessionStart],
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
