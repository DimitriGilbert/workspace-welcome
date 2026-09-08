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
import type { ReactNode } from "react";

import { Skeleton } from "@workspace-welcome/ui/components/skeleton";

import { ReportGate } from "@/widgets/parts";
import { useReport } from "@/widgets/contexts/report-context";

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
