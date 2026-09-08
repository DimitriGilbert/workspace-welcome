/**
 * McReportActivity — the ACTIVITY report widget: the snitch-style cadence
 * time graph; the meta titlebar slot carries the totals + generated age +
 * HTML link. Pages ride the shell's WidgetTabs (the bento pulse pattern):
 * `graph` (the cadence plot), `by repo` (per-project commit leaders) and
 * `table` (the period census) — tabs render only when the report carries
 * more than the graph (a repo scope IS one repo).
 *
 * The plot is this theme's own full-bleed area graph. The ui `Chart` engine
 * is anchored to a [0, auto] nice-number domain with internal chart-library
 * margins — on a flat-left series that strands the panel's upper-left as
 * plotting void, which the owner rejected. McAreaGraph keeps the engine's
 * register (monotone curve over an accent wash) but computes the TIGHT
 * domain — the peak rides the top edge, the baseline the bottom edge —
 * paints the under-curve area edge to edge, and carries zero internal
 * padding: the graph IS the panel. A unit register above the plot names the
 * measure and the peak, and a pointer crosshair reads the exact bucket out
 * (`{period} · {n} commits`) — the graph is never a bare shape. The period
 * axis renders as an HTML label row under the plot (exact positions, no SVG
 * text distortion); the meta line carries the exact totals. Below the
 * graph's floor the rung presents the totals trio instead (a real
 * composition, never a lone numeral).
 */
import { useId, useMemo, useState } from "react";

import { Stat } from "@workspace-welcome/ui/components/stat";

import { useReport } from "@/lib/contexts/report-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/components/widgets/widget-shell";

import { McReportGate, PLOT_H, PLOT_W, plotPaths, usePlotHover } from "./report-shared";

/** Pixel floor below which the rung ladders down to the totals trio. */
export const GRAPH_MIN = { w: 200, h: 140 };

/** Leader cap for the `by repo` page. */
const REPO_LEADER_LIMIT = 8;

/** The graph's window: LAST 12 buckets (the engine's maxPoints register) —
 * the full multi-year series at this width degrades into noise spikes. */
const GRAPH_BUCKETS = 12;

/**
 * The measure noun for a bucket label: month keys ("2026-06") read as
 * "commits / mo"; anything else stays generic.
 */
function bucketUnit(labels: string[]): string {
  return labels.every((l) => /^\d{4}-\d{2}$/.test(l)) ? "mo" : "period";
}

/**
 * The full-bleed cadence graph with its pointer crosshair. Renders the
 * monotone curve over its wash stretched to the whole box (non-scaling
 * stroke keeps the 2px register); hovering reads the exact bucket in a mono
 * callout; `ariaLabel` carries the accessible summary — the meta line holds
 * the exact totals.
 */
function McAreaGraph({
  points,
  color,
  valueNoun,
  ariaLabel,
}: {
  points: { label: string; value: number }[];
  color: string;
  valueNoun: string;
  ariaLabel: string;
}) {
  const gradientId = useId();
  const { hover, onPointerMove, onPointerLeave } = usePlotHover(points.length);
  const max = points.reduce((peak, p) => Math.max(peak, p.value), 0);
  const n = points.length;
  const ys = points.map((p) => {
    if (max <= 0) return PLOT_H - 1;
    return PLOT_H - (p.value / max) * PLOT_H;
  });
  const { line, area } = plotPaths(ys);

  const xPct = hover !== null && n > 1 ? (hover / (n - 1)) * 100 : 0;
  const hovered = hover !== null ? points[hover] : undefined;
  const calloutLeft = Math.min(85, Math.max(15, xPct));

  return (
    <div
      className="relative h-full w-full"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.42} />
            <stop offset="60%" stopColor={color} stopOpacity={0.16} />
            <stop offset="100%" stopColor={color} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        {n > 0 ? (
          <>
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>
      {hovered !== undefined ? (
        <>
          <div
            aria-hidden
            className="absolute inset-y-0 w-px bg-(--mc-line-strong)"
            style={{ left: `${xPct}%` }}
          />
          <div
            aria-hidden
            className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-(--mc-panel) bg-(--mc-accent)"
            style={{ left: `${xPct}%`, top: `${((ys[hover ?? 0] ?? PLOT_H) / PLOT_H) * 100}%` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 border border-(--mc-line-strong) bg-(--mc-panel) px-2 py-1 font-mono text-[9.5px] leading-none whitespace-nowrap tabular-nums text-foreground"
            style={{ left: `${calloutLeft}%` }}
          >
            {hovered.label} · {hovered.value.toLocaleString()} {valueNoun}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Period labels at their exact x shares; middle ticks collapse below a
 * ~520px shell so the axis never collides at narrow rungs. */
function PeriodAxis({ points }: { points: { label: string; value: number }[] }) {
  const n = points.length;
  return (
    <div aria-hidden className="relative h-3.5 shrink-0">
      {points.map((point, i) => {
        const at = n <= 1 ? 0 : (i / (n - 1)) * 100;
        const anchor = i === 0 ? "0%" : i === n - 1 ? "-100%" : "-50%";
        return (
          <span
            key={`${point.label}-${i}`}
            className={`absolute top-0 font-mono text-[9px] leading-3 whitespace-nowrap text-muted-foreground${
              i > 0 && i < n - 1 ? " hidden @[520px]:inline" : ""
            }`}
            style={{ left: `${at}%`, transform: `translateX(${anchor})` }}
          >
            {point.label}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The unit register above the plot: what the y axis measures and the peak
 * it rides to — the tight domain's scale, readable at a glance.
 */
function UnitRow({
  points,
  valueNoun,
  unit,
}: {
  points: { label: string; value: number }[];
  valueNoun: string;
  unit: string;
}) {
  const peak = points.reduce((p, point) => Math.max(p, point.value), 0);
  return (
    <div className="flex shrink-0 items-baseline justify-between gap-2 pb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
      <span>
        {valueNoun} / {unit}
      </span>
      <span className="normal-case tracking-normal tabular-nums">peak {peak.toLocaleString()}</span>
    </div>
  );
}

/** Totals trio — the below-graph-floor presentation. */
function TotalsRun({ commits, contributors, repositories }: { commits: number; contributors: number; repositories: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
      <Stat label="Commits" value={commits} />
      <Stat label="Contributors" value={contributors} />
      <Stat label="Repos" value={repositories} tone="accent" />
    </div>
  );
}

/** One proportional ledger row — the mc register (hairline, mono, accent
 * fill), shared by the `by repo` page. */
function LeaderRow({
  name,
  value,
  max,
  whole,
}: {
  name: string;
  value: number;
  max: number;
  whole: number;
}) {
  const barShare = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center gap-2.5 border-t border-(--mc-line) px-1 first:border-t-0">
      <span className="w-28 shrink-0 truncate font-mono text-[11px] text-muted-foreground" title={name}>
        {name}
      </span>
      <span className="block h-1.5 min-w-0 flex-1 overflow-hidden bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)]">
        <span
          className="block h-full"
          style={{ width: `${barShare}%`, background: "var(--mc-accent)" }}
        />
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-muted-foreground">
        {whole > 0 ? Math.round((value / whole) * 100) : 0}%
      </span>
    </div>
  );
}

export function McReportActivity(_props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const placed = useWidgetSize();
  const [tab, setTab] = useState("graph");

  const cadence = useMemo(
    () => (view === null ? [] : view.cadence.map((point) => ({ label: point.period, value: point.commits }))),
    [view],
  );
  const total = useMemo(() => cadence.reduce((sum, p) => sum + p.value, 0), [cadence]);
  // The graph + table window the LAST 12 buckets: the full multi-year series
  // at this width degrades into noise spikes. The meta line still carries
  // the whole-window totals.
  const shown = useMemo(() => cadence.slice(-GRAPH_BUCKETS), [cadence]);
  const shownTotal = useMemo(() => shown.reduce((sum, p) => sum + p.value, 0), [shown]);

  // Per-project commit leaders (the `by repo` page) — straight from the
  // export's per-project cadence sums.
  const repoLeaders = useMemo(() => {
    if (view === null) return [];
    return view.export.projects
      .map((p) => ({ name: p.name, commits: p.cadence.reduce((sum, c) => sum + c.commits, 0) }))
      .filter((r) => r.commits > 0)
      .sort((a, b) => b.commits - a.commits)
      .slice(0, REPO_LEADER_LIMIT);
  }, [view]);

  const full = placed.cols >= 3 && placed.rows >= 3;

  // Pages: the graph always stands; the census pages render only when the
  // report carries more than the plot (a repo scope IS one repo; a
  // single-bucket window has no table to read).
  const pages = useMemo(() => {
    const list: { id: string; label: string }[] = [{ id: "graph", label: "graph" }];
    if (repoLeaders.length >= 2) list.push({ id: "repos", label: "by repo" });
    if (shown.length >= 2) list.push({ id: "table", label: "table" });
    return list;
  }, [repoLeaders.length, shown.length]);
  const active = pages.some((p) => p.id === tab) ? tab : "graph";

  const unit = useMemo(() => bucketUnit(shown.map((p) => p.label)), [shown]);

  return (
    <WidgetShell
      className="h-full w-full"
      tabs={view !== null && full && pages.length > 1 ? pages : undefined}
      activeTab={active}
      onTabChange={setTab}
      meta={
        view === null ? undefined : (
          <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
            {total} commits · {view.totals.contributors} contributors
          </span>
        )
      }
    >
      <McReportGate>
        {view === null ? null : full ? (
          cadence.length === 0 ? (
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden px-3.5 pb-3">
              <p className="py-2 font-mono text-[11px] text-muted-foreground">
                No cadence data in this window.
              </p>
            </div>
          ) : (
            // The graph IS the section: the tight-domain plot stretches over
            // the full content box under the titlebar, the period axis rides
            // its bottom edge — no gap rows, no dead zones.
            <div
              data-part-min-w={GRAPH_MIN.w}
              data-part-min-h={GRAPH_MIN.h}
              style={{ minWidth: GRAPH_MIN.w, minHeight: GRAPH_MIN.h }}
              className="mx-3.5 mb-1.5 flex min-h-0 min-w-0 flex-1 flex-col"
            >
              {active === "graph" ? (
                <>
                  <UnitRow points={shown} valueNoun="commits" unit={unit} />
                  <div className="relative min-h-0 min-w-0 flex-1">
                    {/* Definite box: an absolutely-filled inset resolves to a real
                        rectangle so the full-bleed plot measures on first paint. */}
                    <div className="absolute inset-0">
                      <McAreaGraph
                        points={shown}
                        color="var(--mc-accent)"
                        valueNoun="commits"
                        ariaLabel="Commit cadence over the report window"
                      />
                    </div>
                  </div>
                  <PeriodAxis points={shown} />
                </>
              ) : active === "repos" ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-0.5">
                  <p className="shrink-0 pb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    commits in window · {repoLeaders.length} of {view.totals.repositories} repos
                  </p>
                  {repoLeaders.map((r) => (
                    <LeaderRow
                      key={r.name}
                      name={r.name}
                      value={r.commits}
                      max={repoLeaders[0]?.commits ?? 0}
                      whole={total}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-0.5">
                  <div className="flex shrink-0 items-baseline gap-2.5 border-b border-(--mc-line-strong) px-1 pb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="min-w-0 flex-1">period</span>
                    <span className="w-12 shrink-0 text-right">commits</span>
                    <span className="w-9 shrink-0 text-right">share</span>
                  </div>
                  {shown.map((p) => (
                    <div
                      key={p.label}
                      className="flex min-h-0 min-w-0 flex-1 items-center gap-2.5 border-t border-(--mc-line) px-1 first:border-t-0"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                        {p.label}
                      </span>
                      <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
                        {p.value.toLocaleString()}
                      </span>
                      <span className="w-9 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-muted-foreground">
                        {shownTotal > 0 ? Math.round((p.value / shownTotal) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
            <TotalsRun
              commits={total}
              contributors={view?.totals.contributors ?? 0}
              repositories={view?.totals.repositories ?? 0}
            />
          </div>
        )}
      </McReportGate>
    </WidgetShell>
  );
}
