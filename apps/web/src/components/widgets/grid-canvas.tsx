/**
 * GridCanvas — the CSS-grid board (master plan §3.3, §5 W3).
 *
 * One board per page; one CSS grid per region (stack regions AND expanded
 * flow regions — flows re-pack through `packGrid` on every viewport change
 * exactly like stacks, they simply carry no authored anchors). The container
 * is styled per §3.3 through the preset-driven vars:
 *
 *     grid-template-columns: repeat(var(--grid-cols), minmax(0, 1fr));
 *     grid-auto-rows: var(--cell-h);
 *     gap: var(--grid-gap);
 *
 * Each placed widget is a DIRECT grid child placed by inline
 * `gridColumn`/`gridRow` and stamps the placement data-attribute contract
 * (`data-widget/x/y/cols/rows/size`) — the probe surface, SSR-stable, never
 * parsed from computed style. The frame is canvas-owned (one per widget, so
 * grid-children count === widget count) because W1's frozen `WidgetShell`
 * does not forward arbitrary data attributes; the shell renders as the
 * frame's only child and stretches to fill it.
 *
 * `data-ready` is stamped on the board root in a `useEffect` after hydration
 * + placement commit — never gated on query completion (report widgets
 * legitimately render ReportGate skeletons). Placements are pure data, so
 * server HTML is pixel-identical and no measurement happens before
 * hydration: `useViewportBoard` initializes on the DESKTOP count and syncs
 * via matchMedia in an effect (one reflow post-mount). Narrow viewports
 * re-pack: authored `at` anchors clamp inside the packer, session-pinned
 * widgets stay fixed, everything else re-packs in reading order.
 *
 * Affordances (drag handle + eight resize handles — the N/S/E/W edges plus
 * the four corners) are canvas-rendered buttons inside the frame, wired to
 * `useGridDrag` — the dnd-kit-swap seam. North/west resize moves the
 * widget's origin (x/y shift while cols/rows grow). The frame's stretch
 * selector targets non-button children only, so the
 * affordance buttons keep their authored hit-zone sizes instead of being
 * stretched across the widget (which once made edge clicks trigger drag/
 * resize everywhere — content must win everywhere but the small zones).
 * The drag ghost is a snapped outline positioned by `calc` over the same
 * grid metrics; it exists only during a pointer gesture, i.e. client-only.
 *
 * Resolved ambiguities vs. the plan text (recorded here, single source):
 * - `PageLayout` v1 has no gap field, so the canvas owns the gap:
 *   {@link DEFAULT_GRID_GAP_PX}, prop-overridable until the format grows one.
 * - `data-size` is the current footprint resolved against `SIZE_LADDER`
 *   (exact for ladder footprints, nearest-below for custom ones).
 * - Escape reverts by re-pinning the widget at its recorded session-start
 *   placement — exact restoration even after other widgets re-packed.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

import { packGrid } from "@/lib/grid-layout/pack-grid";
import type { PackItem } from "@/lib/grid-layout/pack-grid";
import { getPageSession, subscribeSession } from "@/lib/widget/grid-session";
import { nodeSizeForBreakpoint } from "@/lib/widget/layout-types";
import type { WidgetNode } from "@/lib/widget/layout-types";
import { parseSize, resolveSizeClass, SIZE_LADDER } from "@/lib/widget/size-class";
import type { SizeClass } from "@/lib/widget/size-class";

import { GridItemContext } from "./widget-shell";
import { useGridDrag } from "./use-grid-drag";
import type { DragWidgetMeta, ResizeEdge } from "./use-grid-drag";

/** Default region-grid gap in px. PageLayout v1 carries no gap field. */
export const DEFAULT_GRID_GAP_PX = 12;

/** Viewport breakpoint set — phone ≤ 639px, tablet ≤ 1023px, desktop above. */
const PHONE_QUERY = "(max-width: 639px)";
const TABLET_QUERY = "(max-width: 1023px)";

/** Per-breakpoint grid column counts (the preset's `columns`). */
export interface ViewportColumns {
  desktop: number;
  tablet: number;
  phone: number;
}

/** The board the canvas currently packs into: the column count AND which
 * preset breakpoint is active (v2 per-breakpoint node overrides key off the
 * breakpoint, not off the column count — counts can coincide across keys). */
export interface ViewportBoard {
  columns: number;
  breakpoint: "desktop" | "tablet" | "phone";
}

/**
 * THE centralized viewport-columns hook (§3.3): initializes on the DESKTOP
 * count (SSR renders desktop first paint everywhere, no measurement before
 * hydration) and syncs matchMedia in an effect — one reflow post-mount.
 * Narrow viewports re-pack through the matching breakpoint key, so v2
 * `tablet`/`phone` node overrides shadow the authored size exactly when
 * their board is active.
 */
export function useViewportBoard(columns: ViewportColumns): ViewportBoard {
  const [board, setBoard] = useState<ViewportBoard>({
    columns: columns.desktop,
    breakpoint: "desktop",
  });
  const { desktop, tablet, phone } = columns;
  useEffect(() => {
    const phoneQuery = window.matchMedia(PHONE_QUERY);
    const tabletQuery = window.matchMedia(TABLET_QUERY);
    const sync = (): void => {
      setBoard(
        phoneQuery.matches
          ? { columns: phone, breakpoint: "phone" }
          : tabletQuery.matches
            ? { columns: tablet, breakpoint: "tablet" }
            : { columns: desktop, breakpoint: "desktop" },
      );
    };
    sync();
    phoneQuery.addEventListener("change", sync);
    tabletQuery.addEventListener("change", sync);
    return () => {
      phoneQuery.removeEventListener("change", sync);
      tabletQuery.removeEventListener("change", sync);
    };
  }, [desktop, tablet, phone]);
  return board;
}

/** One region's resolved nodes — flow regions arrive already expanded (W4
 * `render-layout` runs the generators), so this component is flow-agnostic. */
export interface PlacedRegion {
  id: string;
  nodes: readonly WidgetNode[];
}

export interface GridCanvasProps {
  /** Session-store key — stable per page (e.g. `${theme}:${dashboard}`). */
  pageId: string;
  /** Breakpoint column counts from the preset. */
  columns: ViewportColumns;
  /** Row-unit density in px from the preset (`cell.h`). */
  cell: { h: number };
  /** Region-grid gap in px. Default {@link DEFAULT_GRID_GAP_PX}. */
  gap?: number;
  /** The page's regions with nodes already resolved against the registry. */
  regions: readonly PlacedRegion[];
  /** Builds one widget's element (a `WidgetShell` tree) from its node +
   * current footprint; rendered as the frame's only child, inside
   * `GridItemContext`. */
  renderItem: (node: WidgetNode, size: { cols: number; rows: number; sizeClass: SizeClass }) => ReactNode;
  /** Registry min clamp lookup by widget REGISTRY key (resize floor).
   * Unparseable/absent results default to 1x1. */
  minOf?: (widget: string) => SizeClass | undefined;
  /** Human label lookup by registry key — aria-labels + announcements.
   * Default: the registry key itself. */
  labelOf?: (widget: string) => string;
  /** Drag/resize affordances on every top-level widget. Turn off for
   * static boards (preview render, embedded views). Default true. */
  interactive?: boolean;
  className?: string;
}

interface PlacedWidget {
  node: WidgetNode;
  x: number;
  y: number;
  cols: number;
  rows: number;
  /** Pinned by a session edit (manual wins until reload — settled #4). */
  pinned: boolean;
}

/** Pack one region at the current width — the AUTHORED/global strategy:
 * session overrides pin first as fixed items, authored `at` anchors clamp
 * inside the packer, everything else packs in reading order. Each node packs
 * with its active-breakpoint footprint (`nodeSizeForBreakpoint` — v2
 * overrides shadow the base size).
 *
 * Authored anchors pin the DESKTOP board only — the arrangement the preset
 * authors (its intentional holes included). Narrower boards re-pack through
 * the sizing law: an anchor carries one shared `{x, y}`, which cannot
 * re-band, so honoring it at the clamped narrower columns would overlap
 * placements. */
function packRegion(
  nodes: readonly WidgetNode[],
  columns: number,
  breakpoint: ViewportBoard["breakpoint"],
): PlacedWidget[] {
  const items: PackItem[] = nodes.map((node) => {
    const footprint = parseSize(nodeSizeForBreakpoint(node, breakpoint)) ?? { cols: 1, rows: 1 };
    return {
      id: node.id,
      cols: footprint.cols,
      rows: footprint.rows,
      pinned: false,
      at: breakpoint === "desktop" ? node.at : undefined,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return packGrid(items, { columns }).placements.flatMap((placement) => {
    const node = byId.get(placement.id);
    return node === undefined
      ? []
      : [
          {
            node,
            x: placement.x,
            y: placement.y,
            cols: placement.cols,
            rows: placement.rows,
            pinned: placement.pinned,
          },
        ];
  });
}

function gridStyle(columns: number, cellH: number, gap: number): CSSProperties {
  return {
    "--grid-cols": columns,
    "--cell-h": `${cellH}px`,
    "--grid-gap": `${gap}px`,
    gridTemplateColumns: "repeat(var(--grid-cols), minmax(0, 1fr))",
    gridAutoRows: "var(--cell-h)",
    gap: "var(--grid-gap)",
  } as CSSProperties;
}

function GripGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 16" className="size-3 fill-current">
      {[2, 8].flatMap((cx) =>
        [3, 8, 13].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.4" />),
      )}
    </svg>
  );
}

/**
 * Resize hit zones (W3, extended to all eight directions): small, precise,
 * invisible strip buttons — each EDGE handle is the CENTERED 20% of that
 * edge, 2rem deep inward; each CORNER is 2rem × 2rem. They are live for
 * pointers unconditionally (`pointer-events: auto`, never container-level
 * pointer math), so ONLY these zones intercept resize gestures and all
 * content elsewhere (buttons, links, charts, tabs) receives pointer events
 * normally. They remain focusable <button>s — the keyboard resize path
 * depends on it.
 */
const RESIZE_HANDLES: readonly { edge: ResizeEdge; word: string; className: string }[] = [
  { edge: "n", word: "north", className: "top-0 right-[40%] left-[40%] h-8 cursor-ns-resize" },
  { edge: "s", word: "south", className: "right-[40%] bottom-0 left-[40%] h-8 cursor-ns-resize" },
  { edge: "e", word: "east", className: "top-[40%] right-0 bottom-[40%] w-8 cursor-ew-resize" },
  { edge: "w", word: "west", className: "top-[40%] bottom-[40%] left-0 w-8 cursor-ew-resize" },
  { edge: "nw", word: "north-west", className: "top-0 left-0 size-8 cursor-nwse-resize" },
  { edge: "ne", word: "north-east", className: "top-0 right-0 size-8 cursor-nesw-resize" },
  { edge: "sw", word: "south-west", className: "bottom-0 left-0 size-8 cursor-nesw-resize" },
  { edge: "se", word: "south-east", className: "right-0 bottom-0 size-8 cursor-nwse-resize" },
];

/** Snapped ghost outline — pointer-gesture preview only (client-only by
 * construction: no gesture can exist during SSR). Positioned by calc over
 * the grid metrics; no DOM measurement anywhere. */
function GhostMark({
  ghost,
  columns,
  cellH,
  gap,
}: {
  ghost: { x: number; y: number; cols: number; rows: number };
  columns: number;
  cellH: number;
  gap: number;
}) {
  const track = `(100% - ${gap * (columns - 1)}px) / ${columns}`;
  return (
    <div
      aria-hidden="true"
      data-drag-ghost=""
      className="pointer-events-none absolute z-10 rounded-sm border-2 border-dashed border-(--pinned-accent,var(--primary)) bg-primary/5"
      style={{
        left: `calc(${track} * ${ghost.x} + ${ghost.x * gap}px)`,
        width: `calc(${track} * ${ghost.cols} + ${(ghost.cols - 1) * gap}px)`,
        top: `${ghost.y * (cellH + gap)}px`,
        height: `${ghost.rows * cellH + (ghost.rows - 1) * gap}px`,
      }}
    />
  );
}

export function GridCanvas({
  pageId,
  columns,
  cell,
  gap = DEFAULT_GRID_GAP_PX,
  regions,
  renderItem,
  minOf,
  labelOf,
  interactive = true,
  className,
}: GridCanvasProps) {
  const board = useViewportBoard(columns);
  const regionRefs = useRef(new Map<string, HTMLElement | null>());

  // Placement commit is synchronous (pure data → pack below); readiness is
  // what must wait for hydration — hence the post-mount effect stamp.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const getSession = useCallback(
    () => getPageSession(pageId),
    [pageId],
  );
  const subscribe = useCallback(
    (listener: () => void) => subscribeSession(pageId, listener),
    [pageId],
  );
  // The session snapshot (null on the server and before the first commit) —
  // reference-stable while unchanged, the external-store contract.
  const session = useSyncExternalStore(subscribe, getSession, () => null);

  const packed = useMemo(
    () =>
      regions.map((region) => {
        // A committed arrangement renders VERBATIM — an explicit drop is never
        // overridden. It governs only while the grid width matches the width
        // it was made at and it covers every node of the region (a filter
        // change re-packs globally until the next edit).
        const arrangement = session?.regions[region.id];
        const usable =
          arrangement !== undefined &&
          arrangement.columns === board.columns &&
          region.nodes.every((node) => arrangement.items[node.id] !== undefined);
        if (usable) {
          const placements = region.nodes.map((node) => {
            const item = arrangement.items[node.id];
            return {
              node,
              x: item.x,
              y: item.y,
              cols: item.cols,
              rows: item.rows,
              pinned: true,
            };
          });
          return { id: region.id, placements };
        }
        return {
          id: region.id,
          placements: packRegion(region.nodes, board.columns, board.breakpoint),
        };
      }),
    [regions, board, session, pageId],
  );

  const widgetMeta = useMemo(() => {
    const meta = new Map<string, DragWidgetMeta>();
    for (const region of packed) {
      for (const placed of region.placements) {
        meta.set(placed.node.id, {
          regionId: region.id,
          label: labelOf?.(placed.node.widget) ?? placed.node.widget,
          min: parseSize(minOf?.(placed.node.widget) ?? "") ?? { cols: 1, rows: 1 },
        });
      }
    }
    return meta;
  }, [packed, labelOf, minOf]);

  const dragPlacements = useMemo(
    () =>
      packed.flatMap((region) =>
        region.placements.map((placed) => ({
          id: placed.node.id,
          regionId: region.id,
          x: placed.x,
          y: placed.y,
          cols: placed.cols,
          rows: placed.rows,
          // Authored anchors and session-pinned widgets can't be displaced,
          // so moves landing on them are refused by the controller.
          // Authored anchors are the only immovable geometry — session pins
          // never block an explicit user drop (owner round 5).
          fixed: placed.node.at !== undefined,
        })),
      ),
    [packed],
  );

  const drag = useGridDrag({
    pageId,
    columns: board.columns,
    cellH: cell.h,
    gap,
    widgets: widgetMeta,
    placements: dragPlacements,
    regionElement: useCallback(
      (regionId: string) => regionRefs.current.get(regionId) ?? null,
      [],
    ),
  });

  return (
    <div
      data-widget-board={pageId}
      data-ready={ready ? "" : undefined}
      className={cn("relative flex flex-col gap-6", className)}
    >
      <div aria-live="polite" className="sr-only">
        {drag.message}
      </div>
      {packed.map((region) => (
        <div
          key={region.id}
          data-region={region.id}
          ref={(element) => {
            regionRefs.current.set(region.id, element);
          }}
          className="relative grid"
          style={gridStyle(board.columns, cell.h, gap)}
        >
          {region.placements.map((placed) => {
            const { node } = placed;
            const footprint: SizeClass = `${placed.cols}x${placed.rows}`;
            const sizeClass = resolveSizeClass(SIZE_LADDER, footprint);
            const label = widgetMeta.get(node.id)?.label ?? node.widget;
            const dragging = drag.active?.widgetId === node.id;
            return (
              <div
                key={node.id}
                data-widget={node.id}
                data-x={placed.x}
                data-y={placed.y}
                data-cols={placed.cols}
                data-rows={placed.rows}
                data-size={sizeClass}
                data-pinned={placed.pinned ? "" : undefined}
                data-dragging={dragging ? "" : undefined}
                className="group relative min-h-0 min-w-0 [&>*:not(button)]:h-full [&>*]:min-h-0 [&>*]:min-w-0"
                style={{
                  gridColumn: `${placed.x + 1} / span ${placed.cols}`,
                  gridRow: `${placed.y + 1} / span ${placed.rows}`,
                }}
              >
                <GridItemContext.Provider
                  value={{ cols: placed.cols, rows: placed.rows, sizeClass, interactive }}
                >
                  {renderItem(node, { cols: placed.cols, rows: placed.rows, sizeClass })}
                </GridItemContext.Provider>
                {interactive ? (
                  <>
                    <button
                      type="button"
                      data-drag-handle=""
                      aria-label={`Move ${label}. Arrow keys move by one cell; Escape returns to the session start position.`}
                      // z-30 lifts the grip above the NW resize corner's
                      // 2rem×2rem zone (both z-20 siblings would otherwise
                      // order by DOM position) — the move affordance must
                      // stay reachable at the top-left corner.
                      //
                      // ALWAYS pointer-live: hover-gated pointer-events
                      // (`group-hover:pointer-events-auto`) compiles into
                      // `@media (hover: hover)` — headless/CDP drivers and
                      // touch report hover:none, and the grip becomes
                      // ungrabbable exactly when the harness needs it (the
                      // always-live NW resize zone already claims this same
                      // corner, so nothing new is blocked). Opacity stays
                      // hover-gated: the affordance only needs to be
                      // visible, not conditionally hittable.
                      className="absolute top-1 left-1 z-30 flex size-6 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--pinned-accent,var(--primary)) focus-visible:outline-none hover:text-foreground"
                      onPointerDown={(event) => drag.startMove(node.id, region.id, event)}
                      onKeyDown={(event) => drag.moveKeyDown(node.id, event)}
                    >
                      <GripGlyph />
                    </button>
                    {RESIZE_HANDLES.map((handle) => (
                      <button
                        key={handle.edge}
                        type="button"
                        data-resize-handle={handle.edge}
                        aria-label={`Resize ${label} ${handle.word}. Arrow keys resize in the handle's direction, Shift+Arrow resizes the opposite edge; Escape returns to the session start position.`}
                        className={cn(
                          // Live hit zone: always pointer-events-auto (small
                          // by construction above), visually revealed on
                          // hover/focus only.
                          "absolute z-20 touch-none rounded-sm opacity-0",
                          "group-hover:opacity-100 hover:bg-muted/40",
                          "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--pinned-accent,var(--primary)) focus-visible:outline-none",
                          handle.className,
                        )}
                        onPointerDown={(event) => drag.startResize(node.id, region.id, handle.edge, event)}
                        onKeyDown={(event) => drag.resizeKeyDown(node.id, handle.edge, event)}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            );
          })}
          {drag.ghost?.regionId === region.id ? (
            <GhostMark ghost={drag.ghost} columns={board.columns} cellH={cell.h} gap={gap} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
