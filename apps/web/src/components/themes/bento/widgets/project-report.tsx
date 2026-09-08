/**
 * Bento's project report pair — ports of `components/designs/bento/
 * project-page.tsx`: the pulse-summary tile (overview band span 4 of 12 —
 * the project's snitch story on one screen: subsidized AI cost headline,
 * meta, cadence shape, worst signal) and the full "Pulse" band (the same
 * ReportPanel the dashboard runs, repo-scoped by the page's provider).
 */
import { Activity } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

import { formatCost } from "@/lib/format";
import { isReportStale } from "@workspace-welcome/api/lib/report-staleness";

import { useProject } from "@/lib/contexts/project-context";
import { useReport } from "@/lib/contexts/report-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";

import { BentoTile, CadenceArea } from "../bits";
import { ReportPanel } from "./pulse";

/* ------------------------------------------------------------ summary --- */

export function BentoProjectSummary(_props: RegisteredWidgetProps) {
  const page = useProject();
  const report = useReport();
  const project = page.project;
  const path = page.path;
  const entry = report.entry(path);
  const stale =
    report.exportData !== null && isReportStale(report.exportData.generatedAt, project?.updatedAt ?? null);

  const scrollToPulse = () => {
    document.querySelector('[data-widget="project-pulse"]')?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="b-label">pulse</h2>
        {entry ? (
          stale ? (
            <span className="font-mono text-[0.64rem]" style={{ color: "var(--sev-warning)" }}>
              stale
            </span>
          ) : (
            <span className="font-mono text-[0.64rem]" style={{ color: "var(--state-positive)" }}>
              fresh
            </span>
          )
        ) : null}
      </div>

      {entry ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span
              className="b-num text-[34px]"
              style={{ color: "var(--bento-c4)" }}
              aria-label={`Subsidized AI cost ${(entry.aiUsage?.cost ?? 0).toFixed(2)} dollars`}
            >
              {formatCost(entry.aiUsage?.cost ?? 0)}
            </span>
            <span className="text-right text-[0.66rem] leading-tight text-muted-foreground">
              subsidized AI cost
              <br />
              {entry.aiUsage?.records.toLocaleString() ?? "0"} messages
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <Meta label="Commits" value={entry.totalCommits.toLocaleString()} />
            <Meta label="Contributors" value={String(entry.contributors)} />
            <Meta label="Languages" value={String(entry.languages.length)} />
            <Meta label="Signals" value={String(entry.alerts.length)} />
          </dl>

          {/* The worst-signal blurb is GONE — the nav bar carries the alert
              chips and the pulse band's Health tab carries the full ledger;
              a third copy was filler. The chart takes the room. */}
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <CadenceArea cadence={entry.cadence} />
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            No cached snitch report for this project yet — the pulse carries its cadence, quality
            signals, language mix, and subsidized AI cost.
          </p>
          <Button size="sm" variant="outline" onClick={scrollToPulse}>
            <Activity className="size-3.5" /> Open pulse
          </Button>
        </div>
      )}
    </BentoTile>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="b-label">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[0.72rem] text-foreground/90" title={value}>
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------- pulse --- */

/**
 * The project's full report band — the design's `b-pulse-xl` tile with the
 * repo-scoped ReportPanel (the page provider scopes kind/path/staleness).
 */
export function BentoProjectPulse(_props: RegisteredWidgetProps) {
  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col p-5">
      <ReportPanel title="Project pulse" className="min-h-0 flex-1" />
    </BentoTile>
  );
}
