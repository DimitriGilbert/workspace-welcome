/**
 * Bento's vitals band — widget-for-widget ports of the design's
 * `health-tile.tsx`, `activity-tile.tsx`, and `stack-tile.tsx`. The tiles
 * are the design's own glazed markup (BentoTile + b-label header rows +
 * the SVG gauge/donut); data derives from `useWorkspace()` through the
 * shared scan-metrics module, exactly the derivations the design route ran.
 *
 * The activity chart is the ui Chart part (the system's one chart engine,
 * an area chart with axes/grid/tooltip) — the theme stylesheet tunes its
 * ticks and cursor to the design's chart register. Smaller footprints keep
 * the same fluid layout; the band content wraps rather than re-laddering.
 */
import { useMemo } from "react";
import { Activity, History, Pin, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Chart } from "@workspace-welcome/ui/components/chart";

import { healthSummary, stackDistribution, weeklyActivity } from "@/lib/scan-metrics";

import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";

import { BentoTile, HealthGauge, RollNumber } from "../bits";
import { STACK_RAMP } from "../metrics";

/* ---------------------------------------------------------- BentoHealth */

const BAND_COLOR = {
  positive: "var(--state-positive)",
  warn: "var(--sev-warning)",
  error: "var(--sev-critical)",
} as const;

export function BentoHealth(_props: RegisteredWidgetProps) {
  const { projects, now } = useWorkspace();
  const summary = useMemo(() => healthSummary(projects, now), [projects, now]);
  const band =
    summary.score >= 80 ? "positive" : summary.score >= 55 ? "warn" : "error";
  const bandColor = BAND_COLOR[band];

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="b-label">Workspace health</h2>
        <span className="font-mono text-[0.68rem] text-muted-foreground">
          {summary.total} projects
        </span>
      </div>

      <div className="b-health-body flex min-h-0 flex-1 flex-wrap items-center justify-center gap-6 sm:justify-between">
        <HealthGauge score={summary.score} bandColor={bandColor}>
          <RollNumber
            value={summary.score}
            label={`Health score ${summary.score} out of 100`}
            className="b-num text-[44px]"
            style={{ color: bandColor }}
          />
          <span className="b-label mt-1">of 100</span>
        </HealthGauge>

        <dl className="grid flex-1 grid-cols-2 gap-x-8 gap-y-4 self-center">
          <HealthStat icon={ShieldCheck} label="Clean" value={summary.clean} tone="positive" />
          <HealthStat
            icon={Activity}
            label="Flagged"
            value={summary.flagged}
            tone={summary.flagged > 0 ? "warn" : undefined}
          />
          <HealthStat icon={History} label="Dormant 30d+" value={summary.dormant} />
          <HealthStat icon={Pin} label="Touched 7d" value={summary.activeThisWeek} tone="info" />
        </dl>
      </div>
    </BentoTile>
  );
}

type Tone = "positive" | "warn" | "info" | undefined;

function HealthStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: Tone;
}) {
  const color =
    tone === "positive"
      ? "var(--state-positive)"
      : tone === "warn"
        ? "var(--sev-warning)"
        : tone === "info"
          ? "var(--bento-c1)"
          : "var(--muted-foreground)";
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-3.5 shrink-0" style={{ color }} />
      <dt className="flex-1 text-xs text-muted-foreground">{label}</dt>
      <dd className="b-num text-lg" style={{ color: tone ? color : undefined }}>
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------- BentoActivity */

export function BentoActivity(_props: RegisteredWidgetProps) {
  const { projects, now } = useWorkspace();
  const data = useMemo(() => weeklyActivity(projects, 16, now), [projects, now]);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const peak = data.reduce(
    (best, d) => (d.count > best.count ? d : best),
    data[0] ?? { label: "", count: 0 },
  );

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="b-label">Activity</h2>
          <span className="flex items-baseline gap-1.5">
            <RollNumber value={total} className="b-num text-[26px] text-foreground" />
            <span className="text-xs text-muted-foreground">projects touched in 16 weeks</span>
          </span>
        </div>
        {peak.count > 0 ? (
          <span className="font-mono text-[0.68rem] text-muted-foreground">
            peak {peak.count} · wk of {peak.label}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <Chart
          variant="area"
          points={data.map((d) => ({ label: d.label, value: d.count }))}
          maxPoints={16}
          ariaLabel="Projects touched per week over the trailing 16 weeks"
          className="h-full w-full"
        />
      </div>
    </BentoTile>
  );
}

/* ---------------------------------------------------------- BentoStacks */

export function BentoStacks(_props: RegisteredWidgetProps) {
  const { projects } = useWorkspace();
  const slices = useMemo(() => stackDistribution(projects), [projects]);
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  let offset = 0;
  const segments = slices.map((s, i) => {
    const frac = total === 0 ? 0 : s.count / total;
    const R = 44;
    const CIRC = 2 * Math.PI * R;
    const GAP = 2.5;
    const dash = Math.max(frac * CIRC - GAP, 0.75);
    const seg = { slice: s, dash, offset, color: STACK_RAMP[i % STACK_RAMP.length] };
    offset += frac * CIRC;
    return seg;
  });

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="b-label">Stack mix</h2>
        <span className="font-mono text-[0.68rem] text-muted-foreground">by manifest</span>
      </div>

      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No projects match the filter.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          <div className="flex items-center gap-4">
            <div className="relative size-[112px] shrink-0">
              <svg viewBox="0 0 120 120" className="block size-full" aria-hidden>
                <circle cx="60" cy="60" r="44" fill="none" stroke="var(--bento-track-soft)" strokeWidth={14} />
                {segments.map((seg) => (
                  <circle
                    key={seg.slice.id}
                    cx="60"
                    cy="60"
                    r="44"
                    fill="none"
                    strokeWidth={14}
                    style={{ stroke: seg.color }}
                    strokeDasharray={`${seg.dash} ${2 * Math.PI * 44 - seg.dash}`}
                    strokeDashoffset={-seg.offset}
                    transform="rotate(-90 60 60)"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="b-num text-[26px]">{total}</span>
                <span className="b-label mt-0.5">projects</span>
              </div>
            </div>

            {/* Aggregate line next to the donut keeps the top zone dense. */}
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              <span className="b-num text-foreground/90">{segments[0]?.slice.label}</span>{" "}
              leads with {segments[0]?.slice.count} of {total} projects
              {segments.length > 1
                ? `; ${segments.slice(1).map((s) => s.slice.label).join(", ")} fill the rest.`
                : "."}
            </p>
          </div>

          <ul className="flex flex-col gap-1.5">
            {segments.map((seg) => {
              const pct = Math.round((seg.slice.count / total) * 100);
              return (
                <li key={seg.slice.id} className="flex items-center gap-2.5 text-xs">
                  <span aria-hidden className="size-2 shrink-0 rounded-[3px]" style={{ background: seg.color }} />
                  <span className="w-20 shrink-0 truncate text-muted-foreground" title={seg.slice.label}>
                    {seg.slice.label}
                  </span>
                  <span className="b-dirtybar min-w-0 flex-1">
                    <span style={{ width: `${Math.max(pct, 4)}%`, background: seg.color }} />
                  </span>
                  <span className="b-num w-6 shrink-0 text-right text-sm">{seg.slice.count}</span>
                  <span className="w-8 shrink-0 text-right font-mono text-[0.62rem] text-muted-foreground">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </BentoTile>
  );
}
