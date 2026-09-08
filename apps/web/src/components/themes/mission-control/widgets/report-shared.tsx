/**
 * Shared report-zone plumbing for the mc report kinds (T2 port of the
 * design's `ReportZone` chrome, `components/designs/mission-control/
 * report-widgets.tsx`).
 *
 * The report state machine, staleness rules, generation pipeline and the
 * normalized view all live in the system (`ReportGate` part + the report
 * context) — this file only authors the zone's presentation slots: a
 * box-filling MISSING state (the design's dashed CTA block) and the
 * generated-at/HTML meta line, so every report kind gates identically.
 */
import { useCallback, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { ReportGate } from "@/components/parts";
import { useReport } from "@/lib/contexts/report-context";

/**
 * Plot geometry in viewBox units — stretched to the box, stroke unscaled.
 * The mc tight-domain graphs (activity cadence, AI per-day lines) share the
 * same 1000×400 register so the non-scaling 2px stroke reads identically.
 */
export const PLOT_W = 1000;
export const PLOT_H = 400;

/**
 * Fritsch–Carlson monotone tangents over the uniform grid — the same
 * no-overshoot register as the chart engine's `type="monotone"`, hand-rolled
 * so the theme stays inside its import surface (invariant 1).
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
export function plotPaths(ys: number[]): { line: string; area: string } {
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
 * Pointer-tracked plot hover: maps the pointer's x fraction onto the nearest
 * bucket index of a uniform series. The mc graphs render the crosshair +
 * value callout from `hover` — the one "info on hover" register.
 */
export function usePlotHover(count: number): {
  hover: number | null;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
} {
  const [hover, setHover] = useState<number | null>(null);
  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (count <= 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const frac = (event.clientX - rect.left) / rect.width;
      const idx = Math.min(count - 1, Math.max(0, Math.round(frac * (count - 1))));
      setHover(idx);
    },
    [count],
  );
  const onPointerLeave = useCallback(() => setHover(null), []);
  return { hover, onPointerMove, onPointerLeave };
}

export const REPORT_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center border border-(--mc-line-strong) bg-[color-mix(in_oklch,var(--mc-accent)_14%,transparent)] px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors hover:border-(--mc-accent) hover:text-(--mc-accent) focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** The design's dashed MISSING block, stretched to fill its rung. */
export function ReportMissingFill() {
  const report = useReport();
  return (
    <div className="flex h-full min-h-0 w-full flex-col justify-center gap-3 border border-dashed border-(--mc-line-strong) px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        No report on record
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {report.scope.kind === "scan"
          ? "A comparative git report for every project under this root — cadence, health, code mix, AI spend."
          : "A git report for this project — cadence, health, code mix, contributors, AI spend."}
      </p>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <button
          type="button"
          disabled={report.generating}
          onClick={() => report.generate()}
          className={REPORT_BUTTON_CLASS}
        >
          {report.generating ? "Generating…" : "Generate report"}
        </button>
        {report.command !== null ? (
          <code className="block w-full min-w-0 break-all font-mono text-[9.5px] leading-relaxed text-muted-foreground">
            {report.command}
          </code>
        ) : null}
        {report.commandError !== null ? (
          <span role="alert" className="font-mono text-[10px] text-(--sev-critical)">
            {report.commandError}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The one gate every mc report kind renders behind: box-filling loading and
 * missing slots keep the rung honest (the gate's defaults are chrome-height
 * strips), content is retained under `running`, stale renders the chip +
 * regenerate over the children. The gate root FILLS the shell's content box
 * so the widget bodies (the design's chart-fill panels) stretch like the
 * prototype's.
 */
export function McReportGate({ children }: { children: ReactNode }) {
  return (
    <ReportGate
      className="flex h-full min-h-0 w-full flex-col"
      loading={<Skeleton className="h-full w-full" />}
      missing={<ReportMissingFill />}
    >
      {children}
    </ReportGate>
  );
}
