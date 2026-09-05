/**
 * VitalsSkeleton — the M3 walking-skeleton widget kind (master plan §5 M3).
 *
 * One workspace kind proving the full composition ladder: it reads
 * `useWorkspace()` (the D5 provider), hands the provider's memoized fleet
 * vitals to the context-free P3 parts (`Stat`, `VitalsBand`), and authors
 * its presentation rungs as a `WidgetShell` `sizes` map — the shell resolves
 * the live footprint down the authored rungs via `resolveSizeClass`, so the
 * ladder (not an if-branch) picks the presentation:
 *
 * - `1x1` — one `Stat`: the project count.
 * - `2x1` — two `Stat`s: projects + attention.
 * - `2x2` — a five-cell `VitalsBand`.
 * - `3x3` (and any larger footprint, resolved down) — the full band.
 *
 * Part floors: each cell wrapper carries the part's ui-exported
 * `MIN_CONTENT` as `data-part-min-w/h` (the part-min probe's measurement
 * handles) AND as the cell's layout floor, so a part never renders below
 * its declared minimum. The markers sit on the wrapper — not via
 * `definePart` — because cloned-in props only reach the DOM through a
 * component that spreads rest props onto its root, and the ui readout parts
 * render fixed roots; the P4/P5 parts work should route the stamping
 * through the parts that own those roots. ReportGate is deliberately absent
 * (P4 surface; this kind needs only the workspace slice). Data is live scan
 * data: while the first scan is in flight the provider's honest empty-set
 * zeros render — never a fake board.
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

function attentionTone(attention: number): Tone | undefined {
  return attention > 0 ? "critical" : undefined;
}

function vitalsCells(vitals: FleetVitals): VitalsCell[] {
  return [
    { label: "Projects", value: vitals.total },
    { label: "Active 7d", value: vitals.activeWeek },
    { label: "Attention", value: vitals.attention, tone: attentionTone(vitals.attention) },
    { label: "Pinned", value: vitals.pinned },
    { label: "Dirty files", value: vitals.dirtySum },
    { label: "Ahead", value: vitals.aheadSum },
    { label: "Behind", value: vitals.behindSum },
  ];
}

/** One numeral cell: the part's box, floored at its declared MIN_CONTENT. */
function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
}) {
  return (
    <div
      data-part-min-w={STAT_MIN_CONTENT.w}
      data-part-min-h={STAT_MIN_CONTENT.h}
      style={{ minWidth: STAT_MIN_CONTENT.w, minHeight: STAT_MIN_CONTENT.h }}
    >
      <Stat label={label} value={value} tone={tone} />
    </div>
  );
}

/** The fleet band's box, floored at its declared MIN_CONTENT. */
function BandCell({ cells }: { cells: VitalsCell[] }) {
  return (
    <div
      data-part-min-w={VITALS_BAND_MIN_CONTENT.w}
      data-part-min-h={VITALS_BAND_MIN_CONTENT.h}
      style={{ minWidth: VITALS_BAND_MIN_CONTENT.w, minHeight: VITALS_BAND_MIN_CONTENT.h }}
      className="min-w-0"
    >
      <VitalsBand cells={cells} ariaLabel="Workspace vitals" />
    </div>
  );
}

/**
 * Fill-box root: the shell stretches to the placed footprint, so the inner
 * shell gets `h-full w-full` — the density probe measures an honestly
 * filled box at every rung.
 */
export function VitalsSkeleton({ size }: RegisteredWidgetProps) {
  const { vitals } = useWorkspace();
  const cells = vitalsCells(vitals);

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden">
            <StatCell label="Projects" value={vitals.total} />
          </div>
        ),
        "2x1": (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-wrap items-center gap-x-6 gap-y-2 overflow-hidden">
            <StatCell label="Projects" value={vitals.total} />
            <StatCell
              label="Attention"
              value={vitals.attention}
              tone={attentionTone(vitals.attention)}
            />
          </div>
        ),
        "2x2": (
          <div className="flex h-full min-h-0 w-full min-w-0 items-center overflow-hidden">
            <BandCell cells={cells.slice(0, 5)} />
          </div>
        ),
        "3x3": (
          <div className="flex h-full min-h-0 w-full min-w-0 items-center overflow-hidden">
            <BandCell cells={cells} />
          </div>
        ),
      }}
    >
      <BandCell cells={cells} />
    </WidgetShell>
  );
}
