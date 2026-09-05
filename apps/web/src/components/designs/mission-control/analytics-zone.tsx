import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project, Root } from "@workspace-welcome/api/lib/types";

import {
  activityCounts,
  activityGridFromCounts,
  alertsPieRows,
  dirtyLeaders,
  heatLevel,
  severityLedger,
  stackPieRows,
} from "./metrics";
import { createMcColumnHelper, McTable } from "./mc-table";

/**
 * Uniform widget shell for the console's side zones. Every block — heatmap,
 * donuts, bar leaders, the report widget's sections — slots into the same
 * frame, so the zones grow without redesign.
 */
export function Widget({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mc-panel">
      <header className="flex items-baseline gap-2 border-b border-[var(--mc-line-strong)] px-3.5 py-2">
        <h2 className="mc-label">{title}</h2>
        {meta ? (
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
            {meta}
          </span>
        ) : null}
        {action ? <span className={meta ? "ml-3" : "ml-auto"}>{action}</span> : null}
      </header>
      <div className="px-3.5 py-3">{children}</div>
    </section>
  );
}

const HEAT_FILL = [
  "color-mix(in oklch, var(--foreground) 8%, transparent)",
  "color-mix(in oklch, var(--mc-accent) 28%, transparent)",
  "color-mix(in oklch, var(--mc-accent) 52%, transparent)",
  "color-mix(in oklch, var(--mc-accent) 76%, transparent)",
  "var(--mc-accent)",
];

/**
 * The console's heatmap instrument — weeks × weekdays grid of daily counts,
 * fill from the shared recency-tinted ladder. The analytics zone feeds it
 * fleet touches; the project page feeds it one repo's commit days. Counts
 * come in as a Map over `YYYY-M-D` local day keys.
 */
export function HeatmapInstrument({
  counts,
  weeks = 12,
  now,
  ariaLabel,
  cellMax,
}: {
  counts: Map<string, number>;
  weeks?: number;
  now: number;
  ariaLabel: string;
  /** Cap per-cell width (px) and center the grid — for wide cards where 1fr
   *  tracks would inflate the cells into blocks. */
  cellMax?: number;
}) {
  const grid = activityGridFromCounts(counts, weeks, now);
  const touches = grid.reduce((sum, col) => sum + col.reduce((s, c) => s + c.count, 0), 0);

  return (
    <div className="flex flex-col gap-2.5">
      <div
        role="img"
        aria-label={`${ariaLabel}, ${touches} touches over ${weeks} weeks`}
        className="grid grid-flow-col gap-[3px]"
        style={{
          gridTemplateColumns:
            cellMax !== undefined
              ? `repeat(${weeks}, ${cellMax}px)`
              : `repeat(${weeks}, minmax(0, 1fr))`,
          gridTemplateRows: "repeat(7, auto)",
          justifyContent: cellMax !== undefined ? "center" : undefined,
        }}
      >
        {grid.map((col, w) =>
          col.map((cell, d) => (
            <span
              key={`${w}-${d}`}
              aria-hidden
              title={cell.label}
              className={cn("aspect-square w-full rounded-[1px]", cell.future && "invisible")}
              style={{ background: HEAT_FILL[cell.future ? 0 : heatLevel(cell.count)] }}
            />
          )),
        )}
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>{weeks}wk</span>
        <span aria-hidden className="ml-auto flex items-center gap-[3px]">
          {HEAT_FILL.map((fill, i) => (
            <span key={i} className="size-2 rounded-[1px]" style={{ background: fill }} />
          ))}
        </span>
        <span>now</span>
      </div>
    </div>
  );
}

/** Fleet-wide 12-week activity heatmap, buckets of real activity instants. */
function ActivityHeatmap({ projects, now }: { projects: Project[]; now: number }) {
  const counts = activityCounts(projects, now);
  const touches = [...counts.values()].reduce((sum, c) => sum + c, 0);

  return (
    <Widget title="Activity" meta={`${touches} / 12wk`}>
      <HeatmapInstrument
        counts={counts}
        weeks={12}
        now={now}
        ariaLabel="Fleet activity heatmap over the last 12 weeks"
      />
    </Widget>
  );
}

/**
 * The console's donut instrument — one numeral in the hole, slices from a
 * flat {key,label,value,fill} series. Shared by the analytics zone (alerts,
 * stack mix) and the project page's Code tab (language mix), so every
 * distribution on both surfaces reads the same way.
 */
export function DonutChart({
  slices,
  center,
  size,
}: {
  slices: { key: string; value: number; fill: string }[];
  /** Numeral rendered in the hole (e.g. the total). */
  center: string;
  /** Tailwind classes for the OUTER box — it must carry a definite height
   *  (h-32, h-full, flex-1 …) so the responsive container fills it. */
  size: string;
}) {
  return (
    <div className={cn("relative", size)}>
      <div className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="key"
              innerRadius="66%"
              outerRadius="96%"
              paddingAngle={2}
              isAnimationActive
              animationDuration={400}
              stroke="none"
            >
              {slices.map((slice) => (
                <Cell key={slice.key} style={{ fill: slice.fill }} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[26px] font-medium leading-none tabular-nums text-foreground"
      >
        {center}
      </span>
    </div>
  );
}

/**
 * Alert census as a donut: the fleet's open alert count reads as one numeral
 * in the hole; slices are severities. The codes that drive each slice stay in
 * the legend rows — glyphs and numerals over labels.
 */
function AlertsPie({ projects }: { projects: Project[] }) {
  const rows = severityLedger(projects);
  const slices = alertsPieRows(projects);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <Widget title="Alerts" meta="all clear">
        <div className="flex items-center gap-2 py-1">
          <span aria-hidden className="size-1.5 bg-[var(--state-positive)]" />
          <p className="font-mono text-[11px] text-muted-foreground">
            0 open — fleet nominal
          </p>
        </div>
      </Widget>
    );
  }

  return (
    <Widget title="Alerts" meta={`${total} open`}>
      <DonutChart slices={slices} center={String(total)} size="h-28" />
      <div className="mt-2 flex flex-col">
        {rows
          .filter((r) => r.count > 0)
          .map((row) => (
            <div
              key={row.severity}
              className="flex items-baseline gap-2.5 border-t border-[var(--mc-line)] py-1.5 first:border-t-0"
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 self-center",
                  row.severity === "error" && "bg-[var(--sev-error)]",
                  row.severity === "warn" && "bg-[var(--sev-warn)]",
                  row.severity === "info" && "bg-[var(--sev-info)]",
                )}
              />
              <span className="w-8 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {row.severity === "warn" ? "wrn" : row.severity === "error" ? "err" : "inf"}
              </span>
              <span
                className={cn(
                  "font-mono text-base leading-none tabular-nums",
                  row.severity === "error" && "text-[var(--sev-error)]",
                  row.severity === "warn" && "text-[var(--sev-warn)]",
                  row.severity === "info" && "text-[var(--sev-info)]",
                )}
              >
                {row.count}
              </span>
              <span className="ml-auto max-w-[15ch] truncate text-right font-mono text-[9.5px] text-muted-foreground">
                {row.codes
                  .slice(0, 2)
                  .map((c) => `${c.code}×${c.count}`)
                  .join("  ")}
                {row.codes.length > 2 ? "…" : ""}
              </span>
            </div>
          ))}
      </div>
    </Widget>
  );
}

/** Stack census as a donut with an icon-keyed legend. */
function StackPie({ projects }: { projects: Project[] }) {
  const slices = useMemo(() => stackPieRows(projects), [projects]);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  return (
    <Widget title="Stack mix" meta={`${total} units`}>
      <div className="flex items-center gap-3">
        <div className="relative h-24 w-24 shrink-0">
          <DonutChart
            slices={slices}
            center={String(total)}
            size="h-24"
          />
        </div>
        <ul className="min-w-0 flex-1">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-baseline gap-2 py-[3px]">
              <span
                aria-hidden
                className="size-2 shrink-0 self-center"
                style={{ background: slice.fill }}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {slice.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-foreground">
                {slice.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Widget>
  );
}

interface DirtyLeaderDatum {
  name: string;
  path: string;
  dirty: number;
}

interface RootRow {
  id: string;
  label: string;
  path: string;
  count: number;
}

const rootHelper = createMcColumnHelper<RootRow>();

const rootColumns = rootHelper.columns([
  rootHelper.accessor((r) => r.label, {
    id: "root",
    sortFn: "alphanumeric",
    size: 90,
    header: "Root",
    cell: (ctx) => (
      <span className="block truncate text-[11.5px] text-foreground" title={ctx.row.original.path}>
        {ctx.getValue()}
      </span>
    ),
  }),
  rootHelper.accessor((r) => r.count, {
    id: "units",
    sortFn: "alphanumeric",
    size: 44,
    header: "Units",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[11px] tabular-nums text-[var(--mc-accent)]">
        {ctx.getValue()}
      </span>
    ),
  }),
]);

/** Scan roots as a sortable table — TanStack everywhere, no list stragglers. */
function RootsTable({
  roots,
  projects,
  rootErrors,
}: {
  roots: Root[];
  projects: Project[];
  rootErrors: { rootId: string; path: string; message: string }[];
}) {
  const rows = useMemo<RootRow[]>(
    () =>
      roots.map((root) => ({
        id: root.id,
        label: root.label || root.path,
        path: root.path,
        count: projects.filter((p) => p.rootId === root.id).length,
      })),
    [roots, projects],
  );
  return (
    <div className="flex flex-col gap-2">
      <McTable
        columns={rootColumns}
        data={rows}
        ariaLabel="Registered scan roots: label, project count"
        initialSort={[{ id: "units", desc: true }]}
        minWidth={140}
        empty={<span className="mc-label">no roots registered</span>}
      />
      {rootErrors.map((e) => (
        <p key={e.rootId} className="font-mono text-[10px] leading-relaxed text-[var(--sev-error)]">
          Unreadable <span className="break-all">{e.path}</span>: {e.message}
        </p>
      ))}
    </div>
  );
}

/** Registered scan roots with live per-root project counts and read errors. */
function RootsPanel({
  roots,
  projects,
  rootErrors,
  error,
}: {
  roots: Root[];
  projects: Project[];
  rootErrors: { rootId: string; path: string; message: string }[];
  error?: string;
}) {
  return (
    <Widget
      title="Roots"
      meta={error ? "unavailable" : `${roots.length} registered`}
      action={
        <Link
          to="/settings"
          className="inline-flex items-center gap-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
        >
          Manage <ArrowUpRight aria-hidden className="size-3" />
        </Link>
      }
    >
      {error ? (
        <p className="font-mono text-[10px] leading-relaxed text-[var(--sev-error)]">{error}</p>
      ) : (
        <RootsTable roots={roots} projects={projects} rootErrors={rootErrors} />
      )}
    </Widget>
  );
}

/**
 * The analytics zone: fleet-wide widgets computed from the same scan payload
 * as the stage — heatmap, alert donut, stack donut, dirty-leaders bars and
 * the roots ledger. Resizable inside the desktop panel group; reflows below
 * the stage on narrow viewports.
 */
export function AnalyticsZone({
  projects,
  roots,
  rootErrors,
  rootsError,
  now,
  onOpenProject,
}: {
  projects: Project[];
  roots: Root[];
  rootErrors: { rootId: string; path: string; message: string }[];
  rootsError?: string;
  now: number;
  /** Bar-chart click target — the route's project-page navigator. */
  onOpenProject: (path: string) => void;
}) {
  return (
    <div className="mc-chart flex flex-col gap-3" data-mc-analytics="">
      <ActivityHeatmap projects={projects} now={now} />
      {/* Half-width pairs: [alerts | stack mix] over [dirty | roots — the
          roots widget sits UNDERNEATH the stack mix]. Stacks to one column
          on narrow viewports. */}
      <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
        <AlertsPie projects={projects} />
        <StackPie projects={projects} />
        <DirtyLeadersNav projects={projects} onOpenProject={onOpenProject} />
        <RootsPanel roots={roots} projects={projects} rootErrors={rootErrors} error={rootsError} />
      </div>
    </div>
  );
}

/** DirtyLeadersChart with the navigator wired through props (no globals). */
function DirtyLeadersNav({
  projects,
  onOpenProject,
}: {
  projects: Project[];
  onOpenProject: (path: string) => void;
}) {
  const leaders = useMemo(() => dirtyLeaders(projects, 6), [projects]);
  if (leaders.length === 0) return null;
  const data: DirtyLeaderDatum[] = leaders.map((r) => ({
    name: r.name,
    path: r.path,
    dirty: r.dirty,
  }));

  return (
    <Widget title="Dirty leaders" meta={`${leaders.reduce((s, r) => s + r.dirty, 0)} files`}>
      <dl className="sr-only">
        {data.map((d) => (
          <div key={d.path}>
            <dt>{d.name}</dt>
            <dd>{d.dirty} uncommitted files — activating the bar opens the project</dd>
          </div>
        ))}
      </dl>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="name"
              width={96}
              tickLine={false}
              axisLine={false}
              tick={{
                fontSize: 10,
                fill: "var(--muted-foreground)",
                fontFamily: "var(--font-mono)",
              }}
              tickFormatter={(value: string) =>
                value.length > 12 ? `${value.slice(0, 11)}…` : value
              }
            />
            <Bar
              dataKey="dirty"
              barSize={9}
              isAnimationActive
              animationDuration={400}
              className="mc-chart-bar"
              onClick={(datum) => {
                const payload: unknown = datum.payload;
                if (payload !== null && typeof payload === "object" && "path" in payload) {
                  const path = (payload as { path?: unknown }).path;
                  if (typeof path === "string") onOpenProject(path);
                }
              }}
            >
              {data.map((d) => (
                <Cell key={d.path} style={{ fill: "var(--sev-warn)" }} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        click a bar to open its project
      </p>
    </Widget>
  );
}
