import { RefreshCw, ExternalLink } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project } from "@workspace-welcome/api/lib/types";

import { Led } from "./led";
import {
  ActivityInstrument,
  AlertsInstrument,
  DirtyInstrument,
  StacksInstrument,
  VitalsBand,
} from "./instruments";
import { useWorkspaceReport, REPORT_PERIODS } from "./report-data";
import type { ReportStatus } from "./report-data";

export { VitalsBand };

/**
 * ONE aligned instrument row (owner round-3): report-backed where the snitch
 * report is the best surface — alerts census, the tabbed activity panel
 * (commits area / languages / AI usage) — and scan-backed where only the
 * scan knows it (stack donut, dirty bars). The report controls (period,
 * staleness, regenerate, open) are one strip above the row, not a stacked
 * card of its own. Every widget is the shared instrument from
 * ./instruments, fed by the workspace report provider.
 */
export function SignalLine({ projects }: { projects: Project[] }) {
  const report = useWorkspaceReport();

  return (
    <section aria-label="Signal line" className="flex flex-col gap-2.5">
      <ReportStrip status={report.status} />
      <div className="mb-line">
        <AlertsInstrument
          exportData={report.exportData}
          missing={report.status === "missing"}
          onGenerate={report.regenerate}
          generating={report.regenerating}
        />
        <ActivityInstrument
          exportData={report.exportData}
          missing={report.status === "missing"}
          onGenerate={report.regenerate}
          generating={report.regenerating}
        />
        <StacksInstrument projects={projects} />
        <DirtyInstrument projects={projects} />
      </div>
    </section>
  );
}

function ReportStrip({ status }: { status: ReportStatus }) {
  const report = useWorkspaceReport();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--mb-line)] pb-2">
      <h2 className="mb-label text-foreground">Snitch line</h2>
      <span className="font-mono text-[9.5px] text-muted-foreground">
        workspace
      </span>

      <div role="group" aria-label="Report period" className="flex items-center gap-1">
        {REPORT_PERIODS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="mb-chip"
            aria-pressed={report.period === p.value}
            onClick={() => report.setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <StatusTag status={status} />
        {status === "stale" || status === "fresh" ? (
          <Button
            variant="outline"
            size="xs"
            onClick={report.regenerate}
            disabled={report.regenerating}
            className={cn(
              status === "stale" &&
                "border-[color-mix(in_oklch,var(--mb-amber)_45%,transparent)] text-[var(--mb-amber)]",
            )}
          >
            <RefreshCw className={cn("size-3", report.regenerating && "animate-spin")} />
            Regenerate
          </Button>
        ) : null}
        {report.key !== null ? (
          <a
            href={`/reports/${report.key}`}
            target="_blank"
            rel="noreferrer"
            className="mb-act"
            title="Open the full HTML report in a new tab"
          >
            <ExternalLink className="size-3" />
            <span className="hidden md:inline">Open</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: ReportStatus }) {
  const report = useWorkspaceReport();
  if (status === "no-root" || status === "loading") return null;
  if (status === "running") {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--mb-amber)]">
        <Led tone="warn" /> Running
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
        <Led tone="nominal" /> No report
      </span>
    );
  }
  const exportData = report.exportData;
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em]"
      style={{ color: status === "stale" ? "var(--mb-amber)" : "var(--mb-accent)" }}
      title={exportData ? `Generated ${new Date(exportData.generatedAt).toLocaleString()}` : undefined}
    >
      <Led tone={status === "stale" ? "warn" : "live"} />
      {status === "stale" ? "Stale" : "Fresh"}
      {exportData ? ` · ${relativeAge(exportData.generatedAt)}` : ""}
    </span>
  );
}

function relativeAge(iso: string): string {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
