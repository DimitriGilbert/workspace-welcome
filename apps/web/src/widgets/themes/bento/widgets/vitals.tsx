/**
 * Bento's vitals band (master plan §5 T2-bento): widget-for-widget ports of
 * the design's `health-tile.tsx`, `activity-tile.tsx`, and `stack-tile.tsx`.
 *
 * Data comes from the shared modules the design's `bento-metrics.ts` was
 * consolidated into — `healthSummary` / `weeklyActivity` /
 * `stackDistribution` over `useWorkspace()`; the pixels are ui parts
 * (Gauge, Chart, Donut, SegBar, HBars, Stat, AnimatedNumber). Every rung
 * renders one stretched root so the density probe measures an honestly
 * filled box, and the `Chart` part appears only on rungs that clear its
 * 200x160 floor — smaller rungs author non-chart presentations (Stat
 * numerals, SegBar geometry) per the charts policy (ruling 5).
 */
import { useMemo } from "react";
import type { ReactNode } from "react";

import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";
import { Chart } from "@workspace-welcome/ui/components/chart";
import { Donut } from "@workspace-welcome/ui/components/donut";
import { Gauge } from "@workspace-welcome/ui/components/gauge";
import { HBars } from "@workspace-welcome/ui/components/h-bars";
import { SegBar } from "@workspace-welcome/ui/components/seg-bar";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Tone } from "@workspace-welcome/ui/lib/tokens";

import { healthSummary, stackDistribution, weeklyActivity } from "@/lib/scan-metrics";
import type { HealthSummary } from "@/lib/scan-metrics";

import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** One stretched root per rung — the vitals-skeleton density convention. */
function BandFill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-col", className)}>
      {children}
    </div>
  );
}

/** Quiet mono meta line under the shell header (the design's `b-label` row). */
function BandMeta({ children }: { children: ReactNode }) {
  return (
    <p className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------- health --- */

type HealthCell = { label: string; value: number; tone?: Tone };

function healthCells(summary: HealthSummary): HealthCell[] {
  return [
    { label: "Clean", value: summary.clean, tone: "positive" },
    { label: "Flagged", value: summary.flagged, tone: summary.flagged > 0 ? "warning" : undefined },
    { label: "Dormant 30d+", value: summary.dormant },
    { label: "Touched 7d", value: summary.activeThisWeek, tone: "info" },
  ];
}

function healthTone(score: number): Tone {
  return score >= 80 ? "positive" : score >= 55 ? "warning" : "critical";
}

/**
 * Workspace health — the derived 0-100 numeral on bento's 240° gauge arc
 * (ui Gauge), with the four counts that explain it beside it.
 */
export function BentoHealth({ size }: RegisteredWidgetProps) {
  const { projects, now } = useWorkspace();
  const summary = useMemo(() => healthSummary(projects, now), [projects, now]);
  const cells = healthCells(summary);
  const gauge = (
    <div className="min-w-0 flex-1 self-center @[340px]:max-w-[240px]">
      <Gauge
        value={summary.score}
        label="of 100"
        ariaLabel={`Workspace health ${summary.score} of 100`}
      />
    </div>
  );
  const full = (
    <BandFill className="flex-row flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      {gauge}
      <div className="grid min-w-0 flex-1 grid-cols-2 content-center gap-x-6 gap-y-3">
        {cells.map((cell) => (
          <Stat key={cell.label} label={cell.label} value={cell.value} tone={cell.tone} size="sm" />
        ))}
      </div>
    </BandFill>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <BandFill className="items-center justify-center px-2">
            <Stat
              label="Health"
              value={`${summary.score}/100`}
              tone={healthTone(summary.score)}
              size="sm"
            />
          </BandFill>
        ),
        "2x1": (
          <BandFill className="flex-row items-center px-3 py-1">
            {gauge}
            <Stat label="Projects" value={summary.total} size="sm" className="shrink-0" />
          </BandFill>
        ),
        "2x2": full,
        "3x3": full,
      }}
    >
      {full}
    </WidgetShell>
  );
}

/* ----------------------------------------------------------- activity --- */

/**
 * Activity — trailing 16-week histogram of last-touch events (ui Chart,
 * area variant) with the workspace total and peak week beside it.
 */
export function BentoActivity({ size }: RegisteredWidgetProps) {
  const { projects, now } = useWorkspace();
  const weekly = useMemo(() => weeklyActivity(projects, 16, now), [projects, now]);
  const total = weekly.reduce((sum, point) => sum + point.count, 0);
  const peak = weekly.reduce(
    (best, point) => (point.count > best.count ? point : best),
    weekly[0] ?? { label: "", count: 0 },
  );
  const counter = (
    <span className="flex items-baseline gap-1.5">
      <AnimatedNumber
        value={total}
        motion="roll"
        className="text-2xl font-semibold tabular-nums text-foreground"
      />
      <span className="text-xs text-muted-foreground">projects touched in 16 weeks</span>
    </span>
  );
  const body = (
    <BandFill className="gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {counter}
        {peak.count > 0 ? <BandMeta>peak {peak.count} · wk of {peak.label}</BandMeta> : null}
      </div>
      <div className="min-h-0 w-full flex-1">
        <Chart
          variant="area"
          points={weekly.map((point) => ({ label: point.label, value: point.count }))}
          maxPoints={16}
          ariaLabel="Projects touched per week over the trailing 16 weeks"
        />
      </div>
    </BandFill>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <BandFill className="items-center justify-center px-2">
            <Stat label="Touched 16w" value={total} size="sm" />
          </BandFill>
        ),
        "2x1": (
          <BandFill className="justify-center gap-1 px-3 py-2">
            {counter}
            {peak.count > 0 ? <BandMeta>peak {peak.count} · wk of {peak.label}</BandMeta> : null}
          </BandFill>
        ),
        "2x2": body,
        "3x3": body,
      }}
    >
      {body}
    </WidgetShell>
  );
}

/* ------------------------------------------------------------- stacks --- */

/**
 * Stack mix — the workspace's manifest distribution as a donut (default
 * chart-token ramp = the design's six-color ramp) with share rows beside it.
 */
export function BentoStacks({ size }: RegisteredWidgetProps) {
  const { projects } = useWorkspace();
  const slices = useMemo(() => stackDistribution(projects), [projects]);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const lead = slices[0];
  const leadLine =
    lead === undefined ? null : (
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground/90">{lead.label}</span> leads with{" "}
        {lead.count} of {total} projects
        {slices.length > 1
          ? `; ${slices.slice(1).map((slice) => slice.label).join(", ")} fill the rest.`
          : "."}
      </p>
    );
  const donut = (
    <Donut
      size={120}
      center={{ value: String(total), label: "projects" }}
      slices={slices.map((slice) => ({ label: slice.label, value: slice.count }))}
      ariaLabel={`Stack mix: ${slices.map((slice) => `${slice.label} ${slice.count}`).join(", ")}`}
    />
  );
  const body = (
    <BandFill className="justify-center gap-3 px-4 py-3">
      <div className="flex min-h-0 flex-wrap items-center justify-center gap-4">
        {donut}
        {leadLine}
      </div>
      <HBars
        maxRows={6}
        ariaLabel="Projects by stack"
        rows={slices.map((slice) => ({
          label: slice.label,
          value: slice.count,
          display: `${Math.round((slice.count / Math.max(total, 1)) * 100)}%`,
        }))}
        className="min-h-0 w-full flex-1"
      />
    </BandFill>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <BandFill className="items-center justify-center px-2">
            <Stat label="Projects" value={total} size="sm" />
          </BandFill>
        ),
        "2x1": (
          <BandFill className="justify-center gap-2 px-3 py-2">
            <SegBar
              height={10}
              ariaLabel={`Stack mix: ${slices.map((slice) => `${slice.label} ${slice.count}`).join(", ")}`}
              segments={slices.map((slice) => ({ value: slice.count, label: slice.label }))}
            />
            {leadLine}
          </BandFill>
        ),
        "2x2": (
          <BandFill className="justify-center gap-3 px-3 py-2">
            {donut}
            {leadLine}
          </BandFill>
        ),
        "3x3": body,
      }}
    >
      {body}
    </WidgetShell>
  );
}
