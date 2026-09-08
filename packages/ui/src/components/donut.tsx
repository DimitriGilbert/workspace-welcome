import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Donut — hand-SVG ring chart for a distribution (language share, severity
 * mix). Zero-value slices vanish; non-zero slices keep a small gap so
 * adjacent colors never merge. The optional center carries a headline figure.
 * Ported (read-only) from meadow's `charts.tsx` Donut; tokens-only colors.
 *
 * ## The donut sizes to the box it is given
 *
 * With `fill`, the ring scales to its mounted box (`min(boxW, boxH)`, capped
 * at `size`) instead of rendering a fixed pixel island — the widget hands the
 * donut a definite sub-box and the ring fills it. Without `fill` the ring is
 * the fixed `size` (the parts-preview register).
 *
 * ## The legend follows the widget's shape
 *
 * Pass the widget's legend rows as `legend` and the component owns the
 * composition: a WIDE container (>= the `DONUT_LEGEND_BREAKPOINT` container
 * query) sets the ring and the legend BESIDE each other (ring left, legend
 * filling the remaining width); a NARROW container stacks them — ring
 * centered, legend BELOW as tight full-width rows. The widget authors its
 * rows once; the shape decision is the component's.
 *
 * ## Mount animation
 *
 * The arcs sweep in on mount (dasharray transition from zero, ~400ms — the
 * design instrument's register). `prefers-reduced-motion` renders the final
 * state immediately; no animation is ever disabled elsewhere by this part.
 */

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

export interface DonutCenter {
  value: string;
  label: string;
}

export interface DonutProps {
  slices: DonutSlice[];
  /** Outer size in px (default 148). With `fill` this is the MAXIMUM —
   * the ring scales to fill its container box instead (band-driven). */
  size?: number;
  /** Fill the parent box (square via the svg's meet framing) instead of
   * rendering at the fixed `size`. */
  fill?: boolean;
  /** Headline figure in the hole; MIN_CONTENT is 110×110 with, 64×64 without. */
  center?: DonutCenter;
  /** The widget's legend rows. Wide container: beside the ring; narrow:
   * below it as tight full-width rows. */
  legend?: ReactNode;
  /** Accessible description; defaults to a slice summary. */
  ariaLabel?: string;
  className?: string;
}

/** Floor when the center figure is shown. */
export const MIN_CONTENT = { w: 110, h: 110 };
/** Floor for the bare ring (no center). */
export const MIN_CONTENT_BARE = { w: 64, h: 64 };
/** Container width at or above which the legend sits BESIDE the ring. */
export const LEGEND_BREAKPOINT = "420px";

/** Default slice ramp — the theme's chart tokens, --chart-1..6. */
const RAMP = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

/** Mount sweep: the arcs grow from zero over ~400ms (one flip after paint). */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return mounted;
}

export function Donut({
  slices,
  size = 148,
  fill = false,
  center,
  legend,
  ariaLabel,
  className,
}: DonutProps) {
  const mounted = useMounted();
  const hasLegend = legend !== undefined && legend !== null && legend !== false;
  const stroke = Math.max(10, Math.round(size / 7));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const active = slices.filter((s) => s.value > 0);
  const gap = active.length > 1 ? 2.5 : 0;

  let acc = 0;
  const arcs = active.map((s, i) => {
    const frac = total === 0 ? 0 : s.value / total;
    const dash = Math.max(0, frac * c - gap);
    const arc = { ...s, color: s.color ?? RAMP[i % RAMP.length], dash, offset: acc, index: i };
    acc += frac * c;
    return arc;
  });

  const label =
    ariaLabel ??
    (slices.length > 0
      ? slices.map((s) => `${s.label} ${s.value}`).join(", ")
      : "empty distribution");

  const ring = (
    <div
      className={cn("relative", fill ? "h-full w-full min-h-0 min-w-0" : "shrink-0")}
      style={fill ? { maxHeight: size, maxWidth: size } : { width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className={fill ? "h-full w-full" : undefined}
        width={fill ? undefined : size}
        height={fill ? undefined : size}
        role="img"
        aria-label={label}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={stroke}
            strokeDasharray={mounted ? `${a.dash} ${c - a.dash}` : `0 ${c}`}
            strokeDashoffset={-a.offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-[stroke-dasharray] duration-400 ease-out motion-reduce:transition-none"
          >
            <title>{`${a.label}: ${Math.round((a.value / (total || 1)) * 100)}%`}</title>
          </circle>
        ))}
      </svg>
      {center ? (
        // Below ~90px the hole is too small for text — drop it, keep the ring.
        <div className="absolute inset-0 hidden flex-col items-center justify-center @[90px]:flex">
          <span className="text-[26px] leading-none font-semibold tabular-nums text-foreground">
            {center.value}
          </span>
          <span className="mt-1 text-[9px] tracking-wide text-muted-foreground uppercase">
            {center.label}
          </span>
        </div>
      ) : null}
    </div>
  );

  if (!hasLegend) {
    return (
      <div
        data-part="donut"
        className={cn("@container flex h-full w-full min-h-0 items-center justify-center", className)}
        style={{ minWidth: MIN_CONTENT.w }}
      >
        {ring}
      </div>
    );
  }

  // Ring + legend as ONE shape-aware unit: beside on wide containers, the
  // legend below as tight full-width rows on narrow ones.
  return (
    <div
      data-part="donut"
      className={cn(
        "@container flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-3 overflow-hidden",
        // Wide: the ring beside its legend — the widget's shape decides.
        "@[420px]:flex-row @[420px]:items-stretch @[420px]:gap-6",
        className,
      )}
      style={{ minWidth: MIN_CONTENT.w }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center @[420px]:h-full">
        {ring}
      </div>
      <div className="flex w-full min-w-0 shrink-0 flex-col justify-center @[420px]:h-full @[420px]:w-auto @[420px]:min-w-0 @[420px]:flex-1 @[420px]:shrink">
        {legend}
      </div>
    </div>
  );
}
