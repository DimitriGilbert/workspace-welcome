/**
 * Bento's project report pair (master plan §5 T3-bento): the design's
 * pulse-summary tile (overview band span 4 of 12) and its full "Pulse" tab
 * (the ReportPanel band) ported onto the widget system.
 *
 * - `bento-project-summary` — the project's snitch story on one tile, as
 *   PER-ENTRY report slices over `useReport().entry(path)` (the no-fan-out
 *   rule: one export, this project's slice): subsidized AI cost Stat, the
 *   commits/contributors/languages/signals register, the cadence area chart
 *   (only on a rung that clears the chart's 200x160 floor), and the worst
 *   signal. Report status (missing CTA / running strip / stale chip) is the
 *   ReportGate part's — this kind renders no status machine of its own.
 * - `bento-project-pulse` — the tabbed report band; the four tab bodies
 *   (Activity / Health / Code / AI usage) and the graph-table ViewCarousel
 *   are the shared dashboard pulse's (`./pulse`), re-rendered over the
 *   page's repo-scoped ReportProvider.
 */
import { useState } from "react";
import type { ReactNode } from "react";

import type { AlertSeverity } from "@workspace-welcome/api/lib/types";
import { Chart } from "@workspace-welcome/ui/components/chart";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { KvList } from "@workspace-welcome/ui/components/kv-list";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { formatCost, relativeTime } from "@/lib/format";

import { ReportGatePart } from "@/widgets/parts";
import { useProject } from "@/widgets/contexts/project-context";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

import { PULSE_TABS, PulseBody } from "./pulse";

const SEV_TOKEN: Record<AlertSeverity, string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

/* ------------------------------------------------------------ helpers --- */

function ReportFill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-col", className)}>
      {children}
    </div>
  );
}

function ReportQuiet({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/* ----------------------------------------------------------- summary --- */

function SummaryBody() {
  const path = useProject().path;
  const entry = useReport().entry(path);

  if (entry === null) {
    return (
      <ReportQuiet>
        No report entry for this project — generate the report to see its
        cadence, quality signals, and AI cost.
      </ReportQuiet>
    );
  }

  const worst = entry.alerts[0];
  return (
    <ReportFill className="gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Stat
          label="Subsidized AI cost"
          value={formatCost(entry.aiUsage?.cost ?? 0)}
          tone="accent"
          size="lg"
          hint={`${entry.aiUsage?.records.toLocaleString() ?? "0"} messages`}
        />
        <span className="text-right text-[0.66rem] leading-tight text-muted-foreground">
          subsidized AI cost
          <br />
          {entry.aiUsage?.records.toLocaleString() ?? "0"} messages
        </span>
      </div>

      <KvList
        density="compact"
        rows={[
          { label: "Commits", value: entry.totalCommits.toLocaleString(), mono: true },
          { label: "Contributors", value: String(entry.contributors), mono: true },
          { label: "Languages", value: String(entry.languages.length), mono: true },
          { label: "Signals", value: String(entry.alerts.length), mono: true },
        ]}
      />

      <div className="min-h-[160px] w-full flex-1">
        <Chart
          variant="area"
          points={entry.cadence
            .slice(-12)
            .map((point) => ({ label: point.period, value: point.commits }))}
          maxPoints={12}
          ariaLabel={`Commits per month for this project`}
        />
      </div>

      {worst ? (
        <p
          className="line-clamp-2 rounded-lg border border-border bg-white/[0.02] px-2.5 py-1.5 text-[0.66rem] leading-snug text-muted-foreground"
          title={worst.summary}
        >
          <span className="font-medium" style={{ color: SEV_TOKEN[worst.severity] }}>
            {worst.label}:
          </span>{" "}
          {worst.summary}
        </p>
      ) : null}
    </ReportFill>
  );
}

export function BentoProjectSummary({ size }: RegisteredWidgetProps) {
  const report = useReport();

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      meta={
        report.status === "stale" ? (
          <Chip tone="warning">stale</Chip>
        ) : report.status === "fresh" ? (
          <Chip tone="positive">fresh</Chip>
        ) : undefined
      }
      sizes={{
        "4x4": (
          <ReportGatePart className="min-h-0 w-full flex-1">
            <SummaryBody />
          </ReportGatePart>
        ),
        "1x1": (
          <ReportFill className="justify-center gap-1 px-2.5 py-2">
            <Stat
              label="AI cost"
              value={
                report.view === null
                  ? "—"
                  : formatCost(report.view.aiUsage?.cost ?? 0)
              }
              tone="accent"
              size="sm"
            />
          </ReportFill>
        ),
      }}
    />
  );
}

/* ------------------------------------------------------------- pulse --- */

/**
 * The full-width tabbed report band over the page's repo scope. The gate
 * renders the report state machine around the active tab body — missing →
 * CTA, running → strip over retained content, stale → chip + regenerate —
 * so no tab body ever sees a half-resolved report.
 */
export function BentoProjectPulse({ size }: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const [tab, setTab] = useState("activity");
  const full = size.cols >= 2 && size.rows >= 2;

  const meta =
    view !== null ? (
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        generated {relativeTime(view.export.generatedAt)} ·{" "}
        {view.totals.commits.toLocaleString()} commits
      </span>
    ) : (
      <span className="font-mono text-[10px] text-muted-foreground">
        git-snitch · repo report
      </span>
    );

  let body: ReactNode;
  if (report.status === "no-scope") {
    body = (
      <ReportQuiet>
        No report scope — this project page has no resolvable path.
      </ReportQuiet>
    );
  } else if (full) {
    body = (
      <ReportGatePart className="min-h-0 w-full flex-1">
        <PulseBody tab={tab} />
      </ReportGatePart>
    );
  } else {
    body = (
      <ReportFill className="flex-row flex-wrap items-center gap-x-6 gap-y-1 px-3 pb-2">
        <Stat label="Commits" value={view === null ? "—" : view.totals.commits.toLocaleString()} size="sm" />
      </ReportFill>
    );
  }

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      meta={meta}
      tabs={full ? PULSE_TABS : undefined}
      activeTab={full ? tab : undefined}
      onTabChange={full ? setTab : undefined}
    >
      {body}
    </WidgetShell>
  );
}
