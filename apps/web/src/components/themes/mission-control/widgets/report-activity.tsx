/**
 * McReportActivity — the ACTIVITY report widget: the snitch-style cadence
 * time graph; the meta titlebar slot carries the totals + generated age +
 * HTML link. The owner collapsed the design's GRAPH/TABLE toggle class of
 * things — the chart is the section, no view switch under it.
 *
 * The plot is this theme's own full-bleed area graph. The ui `Chart` engine
 * is anchored to a [0, auto] nice-number domain with internal chart-library
 * margins — on a flat-left series that strands the panel's upper-left as
 * plotting void, which the owner rejected. McAreaGraph keeps the engine's
 * register (monotone curve over an accent wash) but computes the TIGHT
 * domain — the peak rides the top edge, the baseline the bottom edge —
 * paints the under-curve area edge to edge, and carries zero internal
 * padding: the graph IS the panel. The period axis renders as an HTML
 * label row under the plot (exact positions, no SVG text distortion); the
 * meta line carries the exact totals. Below the graph's floor the rung
 * presents the totals trio instead (a real composition, never a lone
 * numeral).
 */
import { useId, useMemo } from "react";

import { Stat } from "@workspace-welcome/ui/components/stat";

import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/components/widgets/widget-shell";

import { McReportGate } from "./report-shared";

/** Pixel floor below which the rung ladders down to the totals trio. */
export const GRAPH_MIN = { w: 200, h: 140 };

/** Plot geometry in viewBox units — stretched to the box, stroke unscaled. */
const PLOT_W = 1000;
const PLOT_H = 400;

/**
 * Fritsch–Carlson monotone tangents over the uniform grid — the same
 * no-overshoot register as the engine's `type="monotone"`, hand-rolled so
 * the theme stays inside its import surface (invariant 1).
 */
function monotoneTangents(ys: number[]): number[] {
  const n = ys.length;
  const dx = 1 / (n - 1);
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const rise = ys[i + 1];
    if (rise === undefined) break;
    delta.push((rise - (ys[i] ?? 0)) / dx);
  }
  const m: number[] = new Array<number>(n).fill(0);
  const first = delta[0];
  const last = delta[n - 2];
  if (first !== undefined) m[0] = first;
  if (last !== undefined) m[n - 1] = last;
  for (let i = 1; i < n - 1; i++) {
    const d0 = delta[i - 1];
    const d1 = delta[i];
    if (d0 === undefined || d1 === undefined) continue;
    m[i] = d0 * d1 <= 0 ? 0 : (d0 + d1) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const d = delta[i];
    const m0 = m[i];
    const m1 = m[i + 1];
    if (d === undefined || m0 === undefined || m1 === undefined) continue;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m0 / d;
    const b = m1 / d;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d;
      m[i + 1] = t * b * d;
    }
  }
  return m;
}

/**
 * The plot paths in viewBox units: the monotone curve and the under-curve
 * area closing against the bottom edge. Tight domain — ys arrive already
 * scaled (peak = 0, baseline = PLOT_H).
 */
function plotPaths(ys: number[]): { line: string; area: string } {
  const n = ys.length;
  if (n === 0) return { line: "", area: "" };
  if (n === 1) {
    const y = ys[0] ?? PLOT_H;
    const flat = `M 0 ${y} L ${PLOT_W} ${y}`;
    return { line: flat, area: `${flat} L ${PLOT_W} ${PLOT_H} L 0 ${PLOT_H} Z` };
  }
  const m = monotoneTangents(ys);
  const dx = PLOT_W / (n - 1);
  let line = `M 0 ${(ys[0] ?? PLOT_H).toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    const t0 = m[i];
    const t1 = m[i + 1];
    if (y0 === undefined || y1 === undefined || t0 === undefined || t1 === undefined) continue;
    const x0 = i * dx;
    const x1 = (i + 1) * dx;
    line += ` C ${(x0 + dx / 3).toFixed(2)} ${(y0 + (t0 * (dx / PLOT_W)) / 3).toFixed(2)}`;
    line += ` ${(x1 - dx / 3).toFixed(2)} ${(y1 - (t1 * (dx / PLOT_W)) / 3).toFixed(2)}`;
    line += ` ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  const area = `${line} L ${PLOT_W} ${PLOT_H} L 0 ${PLOT_H} Z`;
  return { line, area };
}

/**
 * The full-bleed cadence graph. Renders the monotone curve over its wash
 * stretched to the whole box (non-scaling stroke keeps the 2px register);
 * `ariaLabel` carries the accessible summary — the meta line holds the
 * exact totals.
 */
function McAreaGraph({
  points,
  color,
  ariaLabel,
}: {
  points: { label: string; value: number }[];
  color: string;
  ariaLabel: string;
}) {
  const gradientId = useId();
  const max = points.reduce((peak, p) => Math.max(peak, p.value), 0);
  const n = points.length;
  const ys = points.map((p) => {
    if (max <= 0) return PLOT_H - 1;
    return PLOT_H - (p.value / max) * PLOT_H;
  });
  const { line, area } = plotPaths(ys);

  return (
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

export function McReportActivity(_props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const placed = useWidgetSize();

  const cadence = useMemo(
    () => (view === null ? [] : view.cadence.map((point) => ({ label: point.period, value: point.commits }))),
    [view],
  );
  const total = useMemo(() => cadence.reduce((sum, p) => sum + p.value, 0), [cadence]);
  // The graph windows the LAST 12 buckets (the engine's maxPoints register):
  // the full multi-year series at this width degrades into noise spikes.
  // The meta line still carries the whole-window totals.
  const shown = useMemo(() => cadence.slice(-12), [cadence]);

  const full = placed.cols >= 3 && placed.rows >= 3;

  return (
    <WidgetShell
      className="h-full w-full"
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
              <div className="relative min-h-0 min-w-0 flex-1">
                {/* Definite box: an absolutely-filled inset resolves to a real
                    rectangle so the full-bleed plot measures on first paint. */}
                <div className="absolute inset-0">
                  <McAreaGraph
                    points={shown}
                    color="var(--mc-accent)"
                    ariaLabel="Commit cadence over the report window"
                  />
                </div>
              </div>
              <PeriodAxis points={shown} />
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
