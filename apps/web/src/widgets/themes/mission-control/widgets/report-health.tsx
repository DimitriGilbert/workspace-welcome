/**
 * McReportHealth — the HEALTH report widget (T2 port of the design's
 * `ReportHealthWidget`): the export's alert signals as a sortable DataTable
 * (severity register, signal, value — worst first), the comparative
 * export's repeated signals capped at the design's twelve-row window with
 * the "+N more signals" footer. Clean report renders the honest all-clear;
 * small rungs render the severity census numerals instead of the table.
 */
import { useMemo } from "react";

import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";
import { Stat } from "@workspace-welcome/ui/components/stat";

import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate, ReportGeneratedMeta } from "./report-shared";

const HEALTH_MAX_ROWS = 12;

const SEV_TAG: Record<string, string> = { critical: "ERR", warning: "WRN", info: "INF" };
const SEV_COLOR: Record<string, string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

interface SignalRow {
  label: string;
  severity: string;
  value: number;
  summary: string;
}

const signalHelper = createDataTableColumnHelper<SignalRow>();

const signalColumns = signalHelper.columns([
  signalHelper.accessor((r) => r.severity, {
    id: "severity",
    sortFn: "alphanumeric",
    size: 8,
    header: "Sev",
    cell: (ctx) => {
      const row = ctx.row.original;
      return (
        <span className="flex items-center gap-1.5" title={row.severity}>
          <span aria-hidden className="size-1.5" style={{ background: SEV_COLOR[row.severity] ?? "var(--sev-info)" }} />
          <span className="font-mono text-[9px] uppercase text-muted-foreground">
            {SEV_TAG[row.severity] ?? row.severity.slice(0, 4)}
          </span>
        </span>
      );
    },
  }),
  signalHelper.accessor((r) => r.label, {
    id: "signal",
    sortFn: "alphanumeric",
    size: 20,
    header: "Signal",
    cell: (ctx) => (
      <span className="block truncate font-mono text-[10.5px] text-foreground" title={ctx.row.original.summary}>
        {ctx.getValue()}
      </span>
    ),
  }),
  signalHelper.accessor((r) => r.value, {
    id: "value",
    sortFn: "alphanumeric",
    size: 8,
    header: "Value",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[11px] tabular-nums text-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
]);

export function McReportHealth(props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;

  const rows = useMemo<SignalRow[]>(
    () =>
      (view?.alerts ?? []).map((a) => ({
        label: a.label,
        severity: a.severity,
        value: a.value,
        summary: a.summary,
      })),
    [view],
  );
  const shown = rows.slice(0, HEALTH_MAX_ROWS);
  const overflow = rows.length - shown.length;
  const census = view?.alertTally.severityCounts;

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
          {rows.length} signals
          {overflow > 0 ? ` · top ${shown.length}` : ""}
          {view === null ? null : <ReportGeneratedMeta />}
        </span>
      }
    >
      <McReportGate>
        <WidgetShell
          className="h-full w-full"
          size={{ cols: props.size.cols, rows: props.size.rows }}
          sizes={{
            "1x1": (
              <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
                <Stat label="Signals" value={rows.length} tone={rows.length > 0 ? "warning" : "positive"} />
              </div>
            ),
            "2x2":
              census === undefined ? null : (
                <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-3 overflow-hidden px-3 pb-2">
                  {rows.length === 0 ? (
                    <p className="flex items-center gap-2 font-mono text-[11px]" style={{ color: "var(--state-positive)" }}>
                      <span aria-hidden className="size-1.5 bg-(--state-positive)" />
                      0 signals — health clean
                    </p>
                  ) : (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
                      <Stat label="Critical" value={census.critical} tone={census.critical > 0 ? "critical" : undefined} />
                      <Stat label="Warning" value={census.warning} tone={census.warning > 0 ? "warning" : undefined} />
                      <Stat label="Info" value={census.info} />
                    </div>
                  )}
                </div>
              ),
            "3x3": (
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3 pb-3">
                {rows.length === 0 ? (
                  <p className="flex items-center gap-2 py-1 font-mono text-[11px]" style={{ color: "var(--state-positive)" }}>
                    <span aria-hidden className="size-1.5 bg-(--state-positive)" />
                    0 signals — health clean
                  </p>
                ) : (
                  <>
                    <div className="min-h-0 min-w-0">
                      <DataTable
                        columns={signalColumns}
                        data={shown}
                        ariaLabel="Report health signals: severity, label, value, worst first"
                        minWidth={260}
                      />
                    </div>
                    {overflow > 0 ? (
                      <p className="mt-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        +{overflow} more signals in the export
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ),
          }}
        >
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
            <Stat label="Signals" value={rows.length} tone={rows.length > 0 ? "warning" : "positive"} />
          </div>
        </WidgetShell>
      </McReportGate>
    </WidgetShell>
  );
}
