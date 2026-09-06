import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Project } from "@workspace-welcome/api/lib/types";

import { BentoTile } from "@/components/designs/bento/bento-tile";
import { weeklyActivity } from "@/components/designs/bento/bento-metrics";

interface ActivityTileProps {
  projects: Project[];
}

/**
 * Trailing 16-week histogram of last-touch events across the workspace —
 * the shape of recent work, computed from updatedAt / last commit / last
 * opened, whichever is newest per project.
 */
export function ActivityTile({ projects }: ActivityTileProps) {
  const data = weeklyActivity(projects);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const peak = data.reduce(
    (best, d) => (d.count > best.count ? d : best),
    data[0] ?? { label: "", count: 0 },
  );

  return (
    <BentoTile span="sp-activity" className="b-band-h flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="b-label">Activity</h2>
          <span className="flex items-baseline gap-1.5">
            <span className="b-num text-[26px] text-foreground">{total}</span>
            <span className="text-xs text-muted-foreground">
              projects touched in 16 weeks
            </span>
          </span>
        </div>
        {peak.count > 0 ? (
          <span className="font-mono text-[0.68rem] text-muted-foreground">
            peak {peak.count} · wk of {peak.label}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="bento-activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  style={{ stopColor: "var(--bento-c1)", stopOpacity: 0.42 }}
                />
                <stop
                  offset="100%"
                  style={{ stopColor: "var(--bento-c1)", stopOpacity: 0 }}
                />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={Math.max(1, Math.ceil(data.length / 6))}
              tickMargin={8}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} />
            <Tooltip
              content={(props) => (
                <ActivityTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                />
              )}
              cursor={{ stroke: "oklch(1 0 0 / 0.14)" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Projects touched"
              strokeWidth={2}
              style={{ stroke: "var(--bento-c1)" }}
              fill="url(#bento-activity-fill)"
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </BentoTile>
  );
}

/** Structural subset of the recharts tooltip props this tooltip reads. */
interface ActivityTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: { count?: number } }[];
  label?: string | number;
}

function ActivityTooltip({ active, payload, label }: ActivityTooltipProps) {
  if (!active || !payload?.length) return null;
  const week = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-xl">
      <p className="font-mono text-[0.68rem] text-muted-foreground">
        week of {label}
      </p>
      <p className="text-sm font-semibold">
        {week?.count} {week?.count === 1 ? "project" : "projects"} touched
      </p>
    </div>
  );
}
