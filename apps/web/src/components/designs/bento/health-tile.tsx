import { Activity, History, Pin, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BentoTile } from "@/components/designs/bento/bento-tile";
import type { HealthSummary } from "@/components/designs/bento/bento-metrics";
import { RollNumber } from "@/components/designs/bento/roll-number";

interface HealthTileProps {
  summary: HealthSummary;
}

const ARC_LENGTH = 293.2; // 240 degrees of a r=70 circle

const BAND_COLOR = {
  positive: "var(--state-positive)",
  warn: "var(--sev-warn)",
  error: "var(--sev-error)",
} as const;

/**
 * Workspace health: one derived 0-100 numeral on a gauge arc, with the four
 * counts that explain it beside it. The arc color is the verdict — sage
 * when the workspace is clean, gold mid, red when errors dominate.
 */
export function HealthTile({ summary }: HealthTileProps) {
  const band =
    summary.score >= 80 ? "positive" : summary.score >= 55 ? "warn" : "error";
  const bandColor = BAND_COLOR[band];
  const filled = (summary.score / 100) * ARC_LENGTH;

  return (
    <BentoTile span="sp-health" className="b-band-h flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="b-label">Workspace health</h2>
        <span className="font-mono text-[0.68rem] text-muted-foreground">
          {summary.total} projects
        </span>
      </div>

      <div className="b-health-body flex min-h-0 flex-1 flex-wrap items-center justify-center gap-6 sm:justify-between">
        <div className="relative w-[170px] shrink-0">
          <svg viewBox="0 0 200 150" className="block w-full" aria-hidden>
            <path
              d="M 39.4 130 A 70 70 0 1 1 160.6 130"
              fill="none"
              stroke="oklch(1 0 0 / 0.07)"
              strokeWidth={11}
              strokeLinecap="round"
            />
            <path
              d="M 39.4 130 A 70 70 0 1 1 160.6 130"
              fill="none"
              style={{ stroke: bandColor }}
              strokeWidth={11}
              strokeLinecap="round"
              strokeDasharray={`${filled} 400`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
            <RollNumber
              value={summary.score}
              label={`Health score ${summary.score} out of 100`}
              className="b-num text-[44px]"
              style={{ color: bandColor }}
            />
            <span className="b-label mt-1">of 100</span>
          </div>
        </div>

        <dl className="grid flex-1 grid-cols-2 gap-x-8 gap-y-4 self-center">
          <HealthStat
            icon={ShieldCheck}
            label="Clean"
            value={summary.clean}
            tone="positive"
          />
          <HealthStat
            icon={Activity}
            label="Flagged"
            value={summary.flagged}
            tone={summary.flagged > 0 ? "warn" : undefined}
          />
          <HealthStat
            icon={History}
            label="Dormant 30d+"
            value={summary.dormant}
          />
          <HealthStat
            icon={Pin}
            label="Touched 7d"
            value={summary.activeThisWeek}
            tone="info"
          />
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
        ? "var(--sev-warn)"
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
