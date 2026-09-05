/**
 * McVitals — the console masthead (T2 port of the design's `VitalsBoard`,
 * `components/designs/mission-control/command-bar.tsx`; replaces the M3
 * `vitals-skeleton` kind). The fleet reports itself in six tabular figures
 * before a single project name appears — units, live-this-week, triage,
 * pins, uncommitted files, unpushed commits — color only where a threshold
 * trips (the design's accent/warn registers mapped onto the ui Tone tokens:
 * the design's `--mc-accent` equals this theme's `--state-positive`).
 *
 * The band is ui `VitalsBand` (Stat + spring `AnimatedNumber` per cell —
 * the design's chasing-spring masthead). Rungs: `1x1` the unit count, `2x1`
 * the first three figures, `2x2` up the full six-cell band. Every rung
 * renders one fill-box wrapper so the density probe measures an honestly
 * filled box; the Stat/VitalsBand MIN_CONTENT floors ride the wrappers as
 * `data-part-min-*` + layout floors (the ui readout parts render fixed
 * roots, so the wrapper stamps, per the vitals-skeleton precedent).
 */
import { Stat, MIN_CONTENT as STAT_MIN_CONTENT } from "@workspace-welcome/ui/components/stat";
import {
  VitalsBand,
  MIN_CONTENT as VITALS_BAND_MIN_CONTENT,
} from "@workspace-welcome/ui/components/vitals-band";
import type { VitalsCell } from "@workspace-welcome/ui/components/vitals-band";
import type { Tone } from "@workspace-welcome/ui/lib/tokens";

import type { FleetVitals } from "@/lib/scan-metrics";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** The masthead's six figures, in the design's order and tone registers. */
function vitalsCells(vitals: FleetVitals): VitalsCell[] {
  return [
    { label: "Units", value: vitals.total },
    { label: "Active 7d", value: vitals.activeWeek, tone: "positive" satisfies Tone },
    {
      label: "Attention",
      value: vitals.attention,
      tone: vitals.attention > 0 ? ("warning" satisfies Tone) : undefined,
    },
    { label: "Pinned", value: vitals.pinned },
    {
      label: "Dirty files",
      value: vitals.dirtySum,
      tone: vitals.dirtySum > 0 ? ("warning" satisfies Tone) : undefined,
    },
    { label: "Unpushed", value: vitals.aheadSum, tone: "positive" satisfies Tone },
  ];
}

/** One numeral cell: the part's box, floored at its declared MIN_CONTENT. */
function StatCell({ cell }: { cell: VitalsCell }) {
  return (
    <div
      data-part-min-w={STAT_MIN_CONTENT.w}
      data-part-min-h={STAT_MIN_CONTENT.h}
      style={{ minWidth: STAT_MIN_CONTENT.w, minHeight: STAT_MIN_CONTENT.h }}
    >
      <Stat label={cell.label} value={cell.value} tone={cell.tone} />
    </div>
  );
}

/** The full band's box, floored at its declared MIN_CONTENT. */
function BandCell({ cells }: { cells: VitalsCell[] }) {
  return (
    <div
      data-part-min-w={VITALS_BAND_MIN_CONTENT.w}
      data-part-min-h={VITALS_BAND_MIN_CONTENT.h}
      style={{ minWidth: VITALS_BAND_MIN_CONTENT.w, minHeight: VITALS_BAND_MIN_CONTENT.h }}
      className="min-w-0"
    >
      <VitalsBand cells={cells} ariaLabel="Workspace vitals" className="h-full w-full items-center" />
    </div>
  );
}

export function McVitals(_props: RegisteredWidgetProps) {
  const { vitals } = useWorkspace();
  const cells = vitalsCells(vitals);

  return (
    <WidgetShell
      className="h-full w-full"
      sizes={{
        "1x1": (
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
            <StatCell cell={cells[0] ?? { label: "Units", value: vitals.total }} />
          </div>
        ),
        "2x1": (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-wrap items-center gap-x-6 gap-y-2 overflow-hidden px-3 pb-2">
            {cells.slice(0, 3).map((cell) => (
              <StatCell key={cell.label} cell={cell} />
            ))}
          </div>
        ),
        "2x2": (
          <div className="flex h-full min-h-0 w-full min-w-0 items-center overflow-hidden px-3 pb-2">
            <BandCell cells={cells} />
          </div>
        ),
      }}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 items-center overflow-hidden px-3 pb-2">
        <BandCell cells={cells} />
      </div>
    </WidgetShell>
  );
}
