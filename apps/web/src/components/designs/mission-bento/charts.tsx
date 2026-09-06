import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CadencePoint } from "./report-utils";

interface CadenceTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: CadencePoint }[];
}

function CadenceTooltip({ active, payload }: CadenceTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="mb-panel px-3 py-2 shadow-xl">
      <p className="mb-label">{point.period}</p>
      <p className="mb-num mt-1 text-sm text-foreground">
        {point.commits} <span className="text-[10px] text-muted-foreground">commits</span>
      </p>
    </div>
  );
}

/**
 * The commit-cadence AREA chart — one rendering shared by the signal line,
 * hero tiles and the project page. An area (not bars): cadence is a
 * continuous time series, and the console's chart mix must stay diverse.
 * Sizes to its parent (height "100%") — the caller owns the box; the chart
 * never leaves a bottom gap inside it.
 */
export function CadenceChart({
  series,
  height = "100%",
  accent = "var(--mb-accent)",
}: {
  series: readonly CadencePoint[];
  height?: number | "100%";
  accent?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="mb-cadence-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: accent, stopOpacity: 0.45 }} />
            <stop offset="100%" style={{ stopColor: accent, stopOpacity: 0.04 }} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={false}
          interval="equidistantPreserveStart"
          minTickGap={28}
          tickMargin={5}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={38} />
        <Tooltip
          content={(props) => <CadenceTooltip active={props.active} payload={props.payload} />}
          cursor={{ stroke: "oklch(1 0 0 / 0.16)" }}
        />
        <Area
          type="monotone"
          dataKey="commits"
          stroke={accent}
          strokeWidth={2}
          fill="url(#mb-cadence-fill)"
          dot={{ r: 2.5, strokeWidth: 0, fill: accent }}
          activeDot={{ r: 3.5, strokeWidth: 0 }}
          isAnimationActive
          animationDuration={450}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface DonutSegment {
  name: string;
  value: number;
  fill: string;
}

/**
 * Radial split donut for two-part distributions (token in/out, …). Renders
 * edge-to-edge in its parent and centers the total.
 */
export function SplitDonut({
  segments,
  center,
  centerLabel,
}: {
  segments: readonly DonutSegment[];
  center: string;
  centerLabel?: string;
}) {
  return (
    <div className="relative h-full min-h-0 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart width={200} height={200}>
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius="66%"
            outerRadius="94%"
            paddingAngle={3}
            strokeWidth={0}
            isAnimationActive
            animationDuration={450}
          >
            {segments.map((segment) => (
              <Cell key={segment.name} fill={segment.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="mb-num text-[22px] text-foreground">{center}</span>
        {centerLabel ? <span className="mb-label mt-0.5">{centerLabel}</span> : null}
      </div>
    </div>
  );
}
