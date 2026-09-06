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
 * hydration: `useViewportColumns` initializes on the DESKTOP count and syncs
 * via matchMedia in an effect (one reflow post-mount). Narrow viewports
 * re-pack: authored `at` anchors clamp inside the packer, session-pinned
 * widgets stay fixed, everything else re-packs in reading order.
 *
 * Affordances (drag handle + E/S/SE resize handles) are canvas-rendered
 * buttons inside the frame, wired to `useGridDrag` — the dnd-kit-swap seam.
 * The frame's stretch selector targets non-button children only, so the
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

import { EMPTY_SESSION_PLACEMENTS, getSessionPlacements, subscribeSession } from "./grid-session";
import type { WidgetNode } from "./layout-types";
import { parseSize, resolveSizeClass, SIZE_LADDER } from "./size-class";
import type { SizeClass } from "./size-class";
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

/**
 * THE centralized viewport-columns hook (§3.3): initializes on the DESKTOP
 * count (SSR renders desktop first paint everywhere, no measurement before
 * hydration) and syncs matchMedia in an effect — one reflow post-mount.
 */
export function useViewportColumns(columns: ViewportColumns): number {
  const [gridColumns, setGridColumns] = useState(columns.desktop);
  const { desktop, tablet, phone } = columns;
  useEffect(() => {
    const phoneQuery = window.matchMedia(PHONE_QUERY);
    const tabletQuery = window.matchMedia(TABLET_QUERY);
    const sync = (): void => {
      setGridColumns(phoneQuery.matches ? phone : tabletQuery.matches ? tablet : desktop);
    };
    sync();
    phoneQuery.addEventListener("change", sync);
    tabletQuery.addEventListener("change", sync);
    return () => {
      phoneQuery.removeEventListener("change", sync);
      tabletQuery.removeEventListener("change", sync);
    };
  }, [desktop, tablet, phone]);
  return gridColumns;
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

/** Pack one region at the current width: session overrides pin first as
 * fixed items, authored `at` anchors clamp inside the packer, everything
 * else packs in reading order. Pure data in, placements out. */
function packRegion(
  nodes: readonly WidgetNode[],
  columns: number,
  overrides: Readonly<Record<string, { x: number; y: number; cols: number; rows: number }>>,
): PlacedWidget[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const items: PackItem[] = nodes.map((node) => {
    const override = overrides[node.id];
    if (override !== undefined) {
      return {
        id: node.id,
        cols: override.cols,
        rows: override.rows,
        pinned: true,
        at: { x: override.x, y: override.y },
      };
    }
    const footprint = parseSize(node.size) ?? { cols: 1, rows: 1 };
    return { id: node.id, cols: footprint.cols, rows: footprint.rows, pinned: false, at: node.at };
  });
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

/** The §3.3 container style: preset-driven vars + the grid template. */
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
 * Resize hit zones (W3): small, precise, invisible strip buttons — the
 * CENTERED 20% of the E/S edge, 2rem deep inward; the SE corner is 2rem ×
 * 2rem. They are live for pointers unconditionally (`pointer-events: auto`,
 * never container-level pointer math), so ONLY these zones intercept resize
 * gestures and all content elsewhere (buttons, links, charts, tabs) receives
 * pointer events normally. They remain focusable <button>s — the keyboard
 * resize path depends on it.
 */
const RESIZE_HANDLES: readonly { edge: ResizeEdge; word: string; className: string }[] = [
  { edge: "e", word: "east", className: "top-[40%] right-0 bottom-[40%] w-8 cursor-ew-resize" },
  { edge: "s", word: "south", className: "right-[40%] bottom-0 left-[40%] h-8 cursor-ns-resize" },
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
  const gridColumns = useViewportColumns(columns);
  const regionRefs = useRef(new Map<string, HTMLElement | null>());

  // Placement commit is synchronous (pure data → pack below); readiness is
  // what must wait for hydration — hence the post-mount effect stamp.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const getPlacements = useCallback(() => getSessionPlacements(pageId), [pageId]);
  const subscribe = useCallback(
    (listener: () => void) => subscribeSession(pageId, listener),
    [pageId],
  );
  const overrides = useSyncExternalStore(subscribe, getPlacements, () => EMPTY_SESSION_PLACEMENTS);

  const packed = useMemo(
    () =>
      regions.map((region) => ({
        id: region.id,
        placements: packRegion(region.nodes, gridColumns, overrides),
      })),
    [regions, gridColumns, overrides],
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
          fixed: placed.pinned || placed.node.at !== undefined,
        })),
      ),
    [packed],
  );

  const drag = useGridDrag({
    pageId,
    columns: gridColumns,
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
          style={gridStyle(gridColumns, cell.h, gap)}
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
                      className="absolute top-1 left-1 z-20 flex size-6 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--pinned-accent,var(--primary)) focus-visible:outline-none hover:text-foreground"
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
                        aria-label={`Resize ${label} ${handle.word}. Arrow keys adjust by one cell; Escape returns to the session start position.`}
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
            <GhostMark ghost={drag.ghost} columns={gridColumns} cellH={cell.h} gap={gap} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
