/**
 * McReportActivity — the ACTIVITY report widget (T2 port of the design's
 * `ReportActivityWidget`): the snitch-style cadence time graph with a
 * TABLE view toggle — the shell's tabs (the ONE WidgetTabs implementation)
 * switch graph/units-table; the meta line carries the generated age + HTML
 * link.
 *
 * The chart is ui `Chart` (the ONE chart engine) and is rendered only at
 * rungs ≥ 200×160 ("3x3" and up — a 2x3 placement resolves to the 2x2
 * stats rung by rank, so no chart ever lands below its MIN_CONTENT floor;
 * smaller rungs present the totals numerals instead). The units table is
 * the design's scan ledger narrowed to the context zone: unit, commits,
 * alerts at a 260px floor.
 */
import { useMemo, useState } from "react";

import type { ReportExport } from "@workspace-welcome/api/lib/report-export";
import { Chart, MIN_CONTENT as CHART_MIN } from "@workspace-welcome/ui/components/chart";
import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";
import { Stat } from "@workspace-welcome/ui/components/stat";
import type { Tone } from "@workspace-welcome/ui/lib/tokens";

import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate, ReportGeneratedMeta } from "./report-shared";

type ActivityTab = "graph" | "table";

const ACTIVITY_TABS: readonly { id: ActivityTab; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "table", label: "Table" },
];

interface UnitRow {
  name: string;
  branch: string;
  commits: number;
  alerts: number;
}

const unitHelper = createDataTableColumnHelper<UnitRow>();

const unitColumns = unitHelper.columns([
  unitHelper.accessor((r) => r.name, {
    id: "unit",
    sortFn: "alphanumeric",
    size: 20,
    header: "Unit",
    cell: (ctx) => (
      <span className="block truncate text-[11.5px] text-foreground" title={ctx.getValue()}>
        {ctx.getValue()}
      </span>
    ),
  }),
  unitHelper.accessor((r) => r.commits, {
    id: "commits",
    sortFn: "alphanumeric",
    size: 8,
    header: "Cmt",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[10.5px] tabular-nums text-muted-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
  unitHelper.accessor((r) => r.alerts, {
    id: "alerts",
    sortFn: "alphanumeric",
    size: 8,
    header: "Alr",
    cell: (ctx) => {
      const v = ctx.getValue();
      return (
        <span
          className="block text-right font-mono text-[10.5px] tabular-nums"
          style={{ color: v > 0 ? "var(--sev-warning)" : "color-mix(in oklch, var(--muted-foreground) 30%, transparent)" }}
        >
          {v > 0 ? v : "·"}
        </span>
      );
    },
  }),
]);

function unitsRows(data: ReportExport): UnitRow[] {
  return data.projects.map((p) => ({
    name: p.name,
    branch: p.branch ?? "",
    commits: p.totalCommits,
    alerts: p.alerts.length,
  }));
}

/** Totals trio — the below-chart-floor presentation. */
function TotalsRun({ commits, contributors, repositories }: { commits: number; contributors: number; repositories: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
      <Stat label="Commits" value={commits} />
      <Stat label="Contributors" value={contributors} />
      <Stat label="Repos" value={repositories} tone={"accent" satisfies Tone} />
    </div>
  );
}

export function McReportActivity(_props: RegisteredWidgetProps) {
  const report = useReport();
  const [tab, setTab] = useState<ActivityTab>("graph");
  const view = report.view;

  const cadence = useMemo(
    () => (view === null ? [] : view.cadence.map((point) => ({ label: point.period, value: point.commits }))),
    [view],
  );
  const total = useMemo(() => cadence.reduce((sum, p) => sum + p.value, 0), [cadence]);

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="flex items-center gap-3">
          <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
            {total} commits · {view?.totals.contributors ?? 0} contributors
          </span>
          {view === null ? null : <ReportGeneratedMeta />}
        </span>
      }
      tabs={ACTIVITY_TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id === "table" ? "table" : "graph")}
    >
      <McReportGate>
        <WidgetShell
          className="h-full w-full"
          sizes={{
            "1x1": (
              <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
                <Stat label="Commits" value={total} />
              </div>
            ),
            "2x2": (
              <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
                <TotalsRun
                  commits={total}
                  contributors={view?.totals.contributors ?? 0}
                  repositories={view?.totals.repositories ?? 0}
                />
              </div>
            ),
            "3x3": (
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3 pb-3">
                {view === null ? null : tab === "graph" ? (
                  cadence.length === 0 ? (
                    <p className="py-2 font-mono text-[11px] text-muted-foreground">No cadence data in this window.</p>
                  ) : (
                    <div
                      data-part-min-w={CHART_MIN.w}
                      data-part-min-h={CHART_MIN.h}
                      style={{ minWidth: CHART_MIN.w, minHeight: CHART_MIN.h }}
                      className="min-h-0 min-w-0 flex-1"
                    >
                      <Chart
                        variant="area"
                        points={cadence}
                        maxPoints={12}
                        color="var(--chart-1)"
                        ariaLabel="Commit cadence over the report window"
                      />
                    </div>
                  )
                ) : (
                  <div className="min-h-0 min-w-0">
                    <DataTable
                      columns={unitColumns}
                      data={unitsRows(view.export)}
                      initialSort={[{ id: "commits", desc: true }]}
                      minWidth={260}
                      ariaLabel="Projects in the report: name, commits, alerts"
                      empty="No units in this report"
                    />
                  </div>
                )}
              </div>
            ),
          }}
        >
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
            <Stat label="Commits" value={total} />
          </div>
        </WidgetShell>
      </McReportGate>
    </WidgetShell>
  );
}
