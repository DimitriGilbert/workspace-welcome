/**
 * WidgetShell — the chrome + size machinery every widget renders (master plan §3.3).
 *
 * ## Self-degradation precedence (the ruling this shell implements)
 *
 * 1. **Authored size-class content wins within its declared rung.** `sizes` is keyed
 *    by `SizeClass`; the shell resolves the current footprint down the authored rungs
 *    via `resolveSizeClass` (largest defined rank ≤ current, else smallest defined —
 *    never throws, never undefined). `children` is the size-independent fallback of
 *    last resort (no `sizes` entry resolved, or none authored).
 * 2. **Part self-degradation handles pixel variance WITHIN a rung** — cell density
 *    (84–104 px row units) and viewport width change the box without changing its
 *    class. Parts do that with container queries; the shell provides the query
 *    root. Canvas-placed shells root a `container-type: size` container — the
 *    grid tracks give the shell a provably definite height (fixed px
 *    `grid-auto-rows` × rows, stretched `h-full` frame), so parts can run BOTH
 *    width and height conditions against the same container for rich/compact
 *    switching. Out-of-grid shells (composite slots, dialogs, the lab, explicit
 *    `size` props) keep `container-type: inline-size`: their height may be
 *    content-driven and size containment would collapse them. SSR-stable either
 *    way — the placement context exists during render, so server and client
 *    stamp the same class.
 *
 * The ladder is the author's tool; the container query is the part's. Both exist
 * because width can change without a class change.
 *
 * ## ui purity rule
 *
 * `useWidgetSize()` is NEVER consumed inside `packages/ui`. ui-package parts degrade
 * via container queries ONLY; only app-level parts (which know the ladder)
 * may branch on `useWidgetSize()`. The size context is an app runtime concern.
 *
 * ## Placement context
 *
 * - `GridItemContext` is provided by the grid canvas (W3) around each placed widget;
 *   the shell reads `{ cols, rows, sizeClass, interactive }` from it and re-provides
 *   `null` to its subtree so nested shells never inherit the outer placement.
 * - Outside the grid (composite slots, dialogs, the lab route) the parent passes
 *   `size={{ cols, rows }}` explicitly — deterministic, SSR-safe, no measurement.
 *   Resolution precedence: `size` prop > `GridItemContext` > 1x1 default.
 * - **Nested widgets** (authored composite slots via `WidgetNode.slots`) render their
 *   child `WidgetShell`s with `interactive={false}` — no drag/resize handles
 *   (settled #3). The resolved interactivity is stamped `data-interactive` for the
 *   canvas, which renders affordances only when it is true.
 */
import { createContext, useContext, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

import { resolveSizeClass, type ParsedSize, type SizeClass } from "@/lib/widget/size-class";

/** Canonical severity a shell can signal (decision 8). Themes map these to
 * `--sev-*` tokens; `neutral` is the unaccented default. */
export type WidgetTone = "critical" | "warning" | "info" | "neutral";

export interface WidgetTab {
  id: string;
  label: string;
}

export interface WidgetShellProps {
  /** Header title slot (MC mono-caps eyebrow / mb label / meadow icon chip — themes restyle via data-slots). */
  title?: ReactNode;
  /** Right-aligned header slot (timestamps, chips). */
  meta?: ReactNode;
  /** Header action slot (buttons), after `meta`. */
  action?: ReactNode;
  /** Tabs rendered via the ONE `WidgetTabs` implementation — shell-level view
   * switching and in-content tabs are one component, two placements. */
  tabs?: readonly WidgetTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Size-breakpoint content props (ruling 6): keyed by authored `SizeClass`,
   * resolved nearest-defined down the ladder. */
  sizes?: Partial<Record<SizeClass, ReactNode>>;
  /** Size-independent fallback of last resort. */
  children?: ReactNode;
  /** Theme chrome class override for the header row (default styling comes from
   * theme CSS targeting `[data-slot=widget-shell-header]`). */
  chrome?: string;
  tone?: WidgetTone;
  /** Explicit footprint for out-of-grid use; overrides `GridItemContext`. */
  size?: ParsedSize;
  /** Nested composite shells pass `false` (no drag/resize handles). Defaults to the
   * canvas-provided interactivity, else `true`. */
  interactive?: boolean;
  /** Extra classes for the root. */
  className?: string;
  /** Style passthrough — the canvas stamps inline `gridColumn`/`gridRow` here so
   * the shell stays a direct grid child (no wrapper divs; motion `layout` works). */
  style?: CSSProperties;
}

/** Placement context provided by the grid canvas; `null` outside the grid. */
export interface GridItemContextValue {
  cols: number;
  rows: number;
  sizeClass: SizeClass;
  interactive: boolean;
}

export const GridItemContext = createContext<GridItemContextValue | null>(null);

/** Published size a shell's subtree sees: actual footprint (`cols`/`rows`) plus the
 * RESOLVED rung (`sizeClass`) — the rung whose authored content is rendered. */
export interface WidgetSize {
  cols: number;
  rows: number;
  sizeClass: SizeClass;
}

const DEFAULT_WIDGET_SIZE: WidgetSize = { cols: 1, rows: 1, sizeClass: "1x1" };
const DEFAULT_PLACEMENT: ParsedSize = { cols: 1, rows: 1 };

const WidgetSizeContext = createContext<WidgetSize>(DEFAULT_WIDGET_SIZE);

/**
 * Structural size switch for parts CSS can't express (donut→segbar, tabs hiding
 * below compact). Outside any shell this returns the 1x1 default. Never consume in
 * `packages/ui` (see the ui purity rule above) — ui parts use container queries.
 */
export function useWidgetSize(): WidgetSize {
  return useContext(WidgetSizeContext);
}

const TONE_ACCENT_CLASS: Record<WidgetTone, string> = {
  critical: "bg-(--sev-critical)",
  warning: "bg-(--sev-warning)",
  info: "bg-(--sev-info)",
  neutral: "bg-muted-foreground/50",
};

/**
 * The ONE tabs implementation (refined-architect r1, ruling 5): shell-level view
 * switching (header placement) and in-content tabs (parts placement) both render
 * this component — documented distinct placements, one behavior contract
 * (controlled `activeTab`/`onTabChange`, deterministic SSR).
 */
export function WidgetTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: {
  tabs: readonly WidgetTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      data-slot="widget-tabs"
      className={cn("flex shrink-0 items-center gap-1 overflow-x-auto px-3", className)}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active || undefined}
            onClick={onTabChange ? () => onTabChange(tab.id) : undefined}
            className={cn(
              "shrink-0 rounded-none px-2 py-1 text-xs text-muted-foreground",
              "hover:text-foreground",
              active && "bg-muted text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function WidgetShell({
  title,
  meta,
  action,
  tabs,
  activeTab,
  onTabChange,
  sizes,
  children,
  chrome,
  tone = "neutral",
  size,
  interactive,
  className,
  style,
}: WidgetShellProps) {
  const gridItem = useContext(GridItemContext);

  const placement = size ?? (gridItem ? { cols: gridItem.cols, rows: gridItem.rows } : DEFAULT_PLACEMENT);
  const isInteractive = interactive ?? (gridItem ? gridItem.interactive : true);
  const footprint: SizeClass = `${placement.cols}x${placement.rows}`;

  const definedSizes = useMemo(() => Object.keys(sizes ?? {}) as SizeClass[], [sizes]);
  const resolvedClass = resolveSizeClass(definedSizes, footprint);
  const content = sizes?.[resolvedClass] ?? children;

  const hasHeader = title !== undefined || meta !== undefined || action !== undefined;
  const hasTabs = tabs !== undefined && tabs.length > 0;

  return (
    <GridItemContext.Provider value={null}>
      <WidgetSizeContext.Provider value={{ cols: placement.cols, rows: placement.rows, sizeClass: resolvedClass }}>
        <div
          data-slot="widget-shell"
          data-tone={tone}
          data-interactive={isInteractive ? "true" : "false"}
          // overflow-hidden = the shell owns its box: fixed-content widgets
          // (nowrap legends, fixed gauges, recharts staleness) never spill
          // into neighbouring cells or past the scope edge, at any footprint.
          // Drag/resize affordances are siblings of this element (the canvas
          // renders them), so clipping never touches them; popups portal out
          // via the theme scope. Not auto/scroll, so the no-inner-scroll
          // contract is untouched.
          //
          // Query root: canvas-placed shells get `container-type: size` —
          // the grid tracks define the shell's height, so height-aware
          // `@container` conditions are sound there (see the header note).
          // Everywhere else the shell stays inline-size: its height may be
          // content-driven, and size containment would collapse it.
          className={cn(
            gridItem !== null ? "[container-type:size]" : "@container",
            "flex min-h-0 min-w-0 flex-col overflow-hidden",
            className,
          )}
          style={style}
        >
          {hasHeader ? (
            <header
              data-slot="widget-shell-header"
              className={cn("flex shrink-0 items-center gap-2 px-3 pt-2", chrome)}
            >
              {title !== undefined ? (
                <div
                  data-slot="widget-shell-title"
                  className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground"
                >
                  <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_ACCENT_CLASS[tone])} />
                  <span className="truncate">{title}</span>
                </div>
              ) : null}
              {meta !== undefined || action !== undefined ? (
                <div data-slot="widget-shell-meta" className="ml-auto flex shrink-0 items-center gap-2">
                  {meta}
                  {action}
                </div>
              ) : null}
            </header>
          ) : null}
          {hasTabs ? (
            <WidgetTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} className="mt-1" />
          ) : null}
          {/* Stretches so the density probe measures the real box; height
              conditions run against the shell root's size container above. */}
          <div data-slot="widget-shell-content" className="min-h-0 flex-1">
            {content}
          </div>
        </div>
      </WidgetSizeContext.Provider>
    </GridItemContext.Provider>
  );
}
