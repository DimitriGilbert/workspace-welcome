import { useEffect, useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Chart — THE one chart part of the widget system (single recharts engine).
 *
 * Two variants over one generic series: `"area"` for time-axis trends,
 * `"bars"` for true comparisons. Tokens-only color, fill-box root, headerless
 * (title/meta chrome belongs to the widget shell).
 *
 * CLIENT-ONLY MOUNT: SSR (and the first client render, so hydration matches)
 * renders a definite-box placeholder; a `useEffect` gate swaps in recharts
 * after mount. Grid rows are px-definite, so `h-full w-full` gives the
 * placeholder the same box the chart will occupy — no layout shift, no
 * hydration mismatch.
 *
 * Below MIN_CONTENT the chart itself does NOT degrade into a second renderer:
 * the widget's `sizes` ladder supplies non-chart presentation instead (Stat
 * numerals, Led, SegBar geometry). There is deliberately no compact-SVG
 * fallback in this file.
 */

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartProps {
  /** `"area"` renders a monotone line over a translucent wash; `"bars"` renders columns. */
  variant: "area" | "bars";
  /** One point per bucket, oldest first. */
  points: ChartPoint[];
  /** Stroke/fill color; defaults to the theme's primary chart token. */
  color?: string;
  /** Keep only the last N points (default 16). */
  maxPoints?: number;
  /** Show a small dot on each area point. */
  dots?: boolean;
  /** Format values in the tooltip (defaults to the raw numeral). */
  formatValue?: (value: number) => string;
  /** Accessible description — the chart is purely supplementary visually. */
  ariaLabel: string;
  className?: string;
}

/** Pixel floor below which callers must ladder down to non-chart parts. */
export const MIN_CONTENT = { w: 200, h: 160 };

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 10 };

function ChartPlaceholder({
  ariaLabel,
  className,
}: {
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-chart-placeholder=""
      className={cn("h-full w-full min-h-0 min-w-0", className)}
      style={{ minHeight: MIN_CONTENT.h, minWidth: MIN_CONTENT.w }}
    />
  );
}

export function Chart({
  variant,
  points,
  color = "var(--chart-1)",
  maxPoints = 16,
  dots = false,
  formatValue,
  ariaLabel,
  className,
}: ChartProps) {
  const gradientId = useId();
  const [mounted, setMounted] = useState(false);

  // Client-only gate: the first client render must equal the server HTML.
  useEffect(() => {
    setMounted(true);
  }, []);

  const shown = points.slice(-maxPoints);

  if (!mounted || shown.length === 0) {
    return <ChartPlaceholder ariaLabel={ariaLabel} className={className} />;
  }

  // Mount animation disabled (ui grant): board captures and harness frames
  // must never catch a mid-animation empty/flat chart — the series renders
  // filled on first paint.
  const animate = false;

  const tooltipProps = {
    cursor: { stroke: "var(--border)" },
    contentStyle: {
      backgroundColor: "var(--popover)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      fontSize: 11,
      color: "var(--popover-foreground)",
    },
    labelStyle: { color: "var(--muted-foreground)" },
    itemStyle: { color: "var(--foreground)" },
    formatter: formatValue
      ? (value: unknown) => formatValue(Number(value))
      : undefined,
  };

  const axes = (
    <>
      <CartesianGrid
        vertical={false}
        stroke="var(--border)"
        strokeDasharray="3 6"
      />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        minTickGap={28}
        tick={AXIS_TICK}
      />
      <YAxis hide domain={[0, "auto"]} />
    </>
  );

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-chart=""
      className={cn(
        "@container h-full w-full min-h-0 min-w-0",
        // Below ~200px container width the axis labels cost more than they
        // say — collapse them, keep the series.
        "[&_.recharts-xAxis]:hidden @[200px]:[&_.recharts-xAxis]:block",
        className,
      )}
      style={{ minHeight: MIN_CONTENT.h, minWidth: MIN_CONTENT.w }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {variant === "area" ? (
          <AreaChart data={shown} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            {axes}
            <Tooltip {...tooltipProps} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              fill={`url(#${gradientId})`}
              dot={
                dots
                  ? { r: 2.5, fill: color, stroke: "none" }
                  : false
              }
              activeDot={{ r: 3.5, fill: color, stroke: "none" }}
              isAnimationActive={animate}
            />
          </AreaChart>
        ) : (
          <BarChart data={shown} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            {axes}
            <Tooltip {...tooltipProps} />
            <Bar
              dataKey="value"
              fill={color}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive={animate}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
