/**
 * Bento's workspace pulse (master plan §5 T2-bento): the design's tabbed
 * snitch-report widget (`report-panel.tsx`) rebuilt on the widget system.
 * The MISSING / RUNNING / STALE / FRESH machine is the report context's and
 * its status pixels are the ReportGate part's — this kind contributes only
 * the four tab bodies (Activity / Health / Code / AI usage) over the
 * provider's normalized `view`, plus the design's graph-table carousel on
 * the activity tab (ui ViewCarousel, deterministically staggered).
 *
 * Tab chrome is the shell's ONE tabs implementation; the `Chart` part
 * only renders on the full (2x2+) rung — smaller footprints author Stat
 * numerals instead (ruling 5). `no-scope` (no tracked root) renders an
 * honest empty line, never a fake board.
 */
import { useState } from "react";
import type { ReactNode } from "react";

import type { AlertSeverity } from "@workspace-welcome/api/lib/types";
import { Chart } from "@workspace-welcome/ui/components/chart";
import { Donut } from "@workspace-welcome/ui/components/donut";
import { HBars } from "@workspace-welcome/ui/components/h-bars";
import { KvList } from "@workspace-welcome/ui/components/kv-list";
import { SegBar } from "@workspace-welcome/ui/components/seg-bar";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { ViewCarousel } from "@workspace-welcome/ui/components/view-carousel";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { formatCompact, formatCost, relativeTime } from "@/lib/format";
import { aiUsageLeaders } from "@/lib/scan-metrics";

import { ReportGatePart } from "@/widgets/parts";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import type { WidgetTab } from "@/widgets/runtime/widget-shell";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** The normalized report view the provider hands every consumer. */
type PulseView = NonNullable<ReturnType<typeof useReport>["view"]>;

const PULSE_TABS: readonly WidgetTab[] = [
  { id: "activity", label: "Activity" },
  { id: "health", label: "Health" },
  { id: "code", label: "Code" },
  { id: "ai", label: "AI usage" },
];

const SEV_TOKEN: Record<AlertSeverity, string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

function PulseFill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-col", className)}>
      {children}
    </div>
  );
}

function QuietLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- tabs --- */

function ActivityBody({ view }: { view: PulseView }) {
  const points = view.cadence.map((point) => ({ label: point.period, value: point.commits }));
  return (
    <ViewCarousel
      autoAdvance
      ariaLabel="Commit cadence"
      className="min-h-0 w-full flex-1"
      cards={[
        {
          id: "pulse-cadence-graph",
          label: "graph",
          node: (
            <PulseFill className="gap-1">
              <p className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                {view.totals.commits.toLocaleString()} commits across {points.length}{" "}
                {points.length === 1 ? "month" : "months"}
              </p>
              <div className="min-h-0 w-full flex-1">
                <Chart
                  variant="area"
                  points={points}
                  maxPoints={14}
                  ariaLabel="Commits per month across the workspace"
                />
              </div>
            </PulseFill>
          ),
        },
        {
          id: "pulse-cadence-table",
          label: "table",
          node: (
            <KvList
              density="compact"
              className="min-h-0 w-full flex-1"
              rows={[...view.cadence].reverse().map((point) => ({
                label: point.period,
                value: point.commits.toLocaleString(),
                mono: true,
              }))}
            />
          ),
        },
      ]}
    />
  );
}

function HealthBody({ view }: { view: PulseView }) {
  const tally = view.alertTally;
  if (tally.total === 0) {
    return <QuietLine>No quality signals flagged in this report.</QuietLine>;
  }
  const counts = tally.severityCounts;
  return (
    <PulseFill className="gap-2.5">
      <SegBar
        height={10}
        ariaLabel={`${counts.critical} critical, ${counts.warning} warning, ${counts.info} info signals`}
        segments={([
          ["critical", counts.critical],
          ["warning", counts.warning],
          ["info", counts.info],
        ] as const).map(([severity, value]) => ({
          value,
          color: SEV_TOKEN[severity],
          label: severity,
        }))}
      />
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
        <span style={{ color: SEV_TOKEN.critical }}>{counts.critical} critical</span>
        <span style={{ color: SEV_TOKEN.warning }}>{counts.warning} warning</span>
        <span style={{ color: SEV_TOKEN.info }}>{counts.info} info</span>
        <span className="ml-auto text-muted-foreground">{tally.total.toLocaleString()} signals</span>
      </div>
      <HBars
        maxRows={6}
        ariaLabel="Top report signals by value"
        className="min-h-0 w-full flex-1"
        rows={tally.rows.slice(0, 6).map((row) => ({
          label: row.label,
          value: row.value,
          color: SEV_TOKEN[row.worst],
        }))}
      />
    </PulseFill>
  );
}

function CodeBody({ view }: { view: PulseView }) {
  const rows = view.languageRows;
  if (rows.length === 0) {
    return <QuietLine>No language statistics in this report.</QuietLine>;
  }
  const totalLines = rows.reduce((sum, row) => sum + row.lines, 0);
  return (
    <PulseFill className="items-center gap-3 py-1">
      <Donut
        size={132}
        center={{ value: formatCompact(totalLines), label: "lines" }}
        slices={rows.map((row) => ({ label: row.language, value: row.lines }))}
        ariaLabel={`Lines of code by language: ${rows.map((row) => row.language).join(", ")}`}
      />
      <HBars
        maxRows={8}
        ariaLabel="Lines of code by language"
        className="min-h-0 w-full flex-1"
        rows={rows.map((row) => ({
          label: row.language,
          value: row.lines,
          display: formatCompact(row.lines),
        }))}
      />
    </PulseFill>
  );
}

function AiBody({ view }: { view: PulseView }) {
  const usage = view.aiUsage;
  if (usage === null) {
    return <QuietLine>No AI usage recorded in this report window.</QuietLine>;
  }
  const leaders = view.export.kind === "scan" ? aiUsageLeaders(view.export) : [];
  return (
    <PulseFill className="gap-3">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <Stat label="Subsidized AI cost" value={formatCost(usage.cost)} tone="accent" size="lg" />
        <Stat label="Requests" value={usage.records.toLocaleString()} />
        <Stat label="Tokens in" value={formatCompact(usage.tokens.input)} />
        <Stat label="Tokens out" value={formatCompact(usage.tokens.output)} />
        <Stat label="Total tokens" value={formatCompact(usage.tokens.total)} />
      </div>
      {leaders.length > 0 ? (
        <HBars
          maxRows={6}
          ariaLabel="AI tokens by repository"
          className="min-h-0 w-full flex-1"
          rows={leaders.map((leader) => ({
            label: leader.name,
            value: leader.tokens,
            display: formatCompact(leader.tokens),
          }))}
        />
      ) : null}
    </PulseFill>
  );
}

function PulseBody({ tab }: { tab: string }) {
  const report = useReport();
  const view = report.view;
  // Unreachable under the gate's stale/fresh/running branches (the export is
  // retained), but an honest null keeps the type tight.
  if (view === null) return null;
  if (tab === "health") return <HealthBody view={view} />;
  if (tab === "code") return <CodeBody view={view} />;
  if (tab === "ai") return <AiBody view={view} />;
  return <ActivityBody view={view} />;
}

/* ------------------------------------------------------------ widget --- */

/**
 * Workspace pulse — the full-width tabbed report band. The shell carries the
 * four tabs; the gate renders the report state machine around the active
 * tab body (missing → CTA, running → strip over retained content, stale →
 * chip + regenerate).
 */
export function BentoPulse({ size }: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const [tab, setTab] = useState("activity");
  const full = size.cols >= 2 && size.rows >= 2;

  const meta =
    view !== null ? (
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        generated {relativeTime(view.export.generatedAt)} · {view.totals.repositories}{" "}
        {view.totals.repositories === 1 ? "repo" : "repos"} ·{" "}
        {view.totals.commits.toLocaleString()} commits
      </span>
    ) : (
      <span className="font-mono text-[10px] text-muted-foreground">
        git-snitch · comparative root report
      </span>
    );

  let body: ReactNode;
  if (report.status === "no-scope") {
    body = (
      <QuietLine>
        No report scope — track a root to generate the workspace report.
      </QuietLine>
    );
  } else if (full) {
    body = (
      <ReportGatePart className="min-h-0 w-full flex-1">
        <PulseBody tab={tab} />
      </ReportGatePart>
    );
  } else {
    body = (
      <PulseFill className="flex-row flex-wrap items-center gap-x-6 gap-y-1 px-3 pb-2">
        <Stat label="Commits" value={view === null ? "—" : view.totals.commits.toLocaleString()} size="sm" />
        <Stat label="Repos" value={view === null ? "—" : view.totals.repositories} size="sm" />
      </PulseFill>
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
