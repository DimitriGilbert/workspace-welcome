/**
 * McReportHealth — the HEALTH report widget (port of the design's
 * `ReportHealthWidget` body, `components/designs/mission-control/
 * report-widgets.tsx`): the export's alert signals as a sortable table
 * (severity register, signal, value — worst first). The owner's sizing law
 * rules the rungs: every 2x1+ placement renders the signals LEDGER — row
 * count capped by the placed height with the "+N more signals" footer —
 * never a lone signals numeral. Below the container's 240px floor (a
 * phone-width column) the ledger swaps to the vertical severity census;
 * the 1x1 rung is the one place a single numeral is allowed. Clean reports
 * render the honest all-clear at every rung.
 */
import { useMemo } from "react";

import {
  createDataTableColumnHelper,
  DataTable,
} from "@workspace-welcome/ui/components/data-table";
import { Stat } from "@workspace-welcome/ui/components/stat";

import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate } from "./report-shared";

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
  // Content-proportioned: SEV and VALUE take what their content needs; the
  // SIGNAL column is the one flexible track and absorbs all remaining width
  // (owner fill law — no uniform voids between content-tight columns).
  signalHelper.accessor((r) => r.severity, {
    id: "severity",
    sortFn: "alphanumeric",
    size: 12,
    minSize: 12,
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
    size: 78,
    minSize: 40,
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
    size: 10,
    minSize: 10,
    header: "Value",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[11px] tabular-nums text-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
]);

/** The all-clear register, identical at every rung. */
function AllClear() {
  return (
    <div className="flex min-h-0 flex-1 items-center gap-2">
      <span aria-hidden className="size-1.5 bg-(--state-positive)" />
      <p className="font-mono text-[11px] text-muted-foreground">
        0 signals — health clean
      </p>
    </div>
  );
}

/** The narrow census: one severity row per line — fits a phone column. */
function SeverityCensus({ rows }: { rows: SignalRow[] }) {
  const order = ["critical", "warning", "info"];
  const counts = order.map((severity) => ({
    severity,
    count: rows.filter((r) => r.severity === severity).length,
  }));
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {counts.map(({ severity, count }) => (
        <div key={severity} className="flex min-h-0 flex-1 items-center gap-2.5 border-t border-(--mc-line) first:border-t-0">
          <span aria-hidden className="size-1.5 self-center" style={{ background: SEV_COLOR[severity] }} />
          <span className="w-7 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
            {SEV_TAG[severity]}
          </span>
          <span className="font-mono text-[13px] leading-none tabular-nums text-foreground">
            {count}
          </span>
          {count > 0 ? (
            <span className="ml-auto min-w-0 truncate font-mono text-[9.5px] text-muted-foreground">
              {rows.find((r) => r.severity === severity)?.label}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}


/** Inline severity census — bottom strip under the ledger (fills the rung). */
function SeverityStrip({ rows }: { rows: SignalRow[] }) {
  const order = ["critical", "warning", "info"];
  const counts = order.map((severity) => ({
    severity,
    count: rows.filter((r) => r.severity === severity).length,
  }));
  return (
    <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-(--mc-shell-hairline) pt-2">
      {counts.map(({ severity, count }) => (
        <span key={severity} className="flex min-w-0 items-baseline gap-1.5">
          <span aria-hidden className="size-1.5 shrink-0 self-center" style={{ background: SEV_COLOR[severity] }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {SEV_TAG[severity]}
          </span>
          <span className="font-mono text-[11px] leading-none tabular-nums text-foreground">{count}</span>
        </span>
      ))}
    </div>
  );
}

export function McReportHealth(_props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const placed = useWidgetSize();

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
  // The ledger window follows the placed height (~3 table rows per 96px
  // cell after the header + footer chrome) so the table never clips.
  const ledgerRows = Math.min(
    HEALTH_MAX_ROWS,
    Math.max(1, placed.rows * 3 - 2, Math.min(3, rows.length)),
  );
  const shown = rows.slice(0, ledgerRows);
  const overflow = rows.length - shown.length;
  const full = placed.cols >= 3 && placed.rows >= 3;
  const mid = placed.rows >= 2;

  const ledger = (
    <>
      <div className="min-h-0 min-w-0">
        <DataTable
          columns={signalColumns}
          data={shown}
          ariaLabel="Report health signals: severity, label, value, worst first"
          minWidth={220}
        />
      </div>
      {overflow > 0 ? (
        <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          +{overflow} more signals in the export
        </p>
      ) : null}
      {rows.length > 0 ? <SeverityStrip rows={rows} /> : null}
    </>
  );

  return (
    <WidgetShell
      className="h-full w-full"
      meta={
        <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
          {rows.length} signals{overflow > 0 ? ` · top ${shown.length}` : ""}
        </span>
      }
    >
      <McReportGate>
        {full ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3.5 pb-3">
            {rows.length === 0 ? <AllClear /> : ledger}
          </div>
        ) : mid ? (
          // Mid rungs keep the real ledger where the container clears the
          // table floor; a phone-width column swaps to the census.
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden px-3.5 pb-3">
            <div className="hidden h-full min-h-0 min-w-0 flex-col @[240px]:flex">
              {rows.length === 0 ? <AllClear /> : ledger}
            </div>
            <div className="flex h-full min-h-0 min-w-0 flex-col justify-center @[240px]:hidden">
              {rows.length === 0 ? <AllClear /> : <SeverityCensus rows={rows} />}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3.5 pb-2">
            <Stat label="Signals" value={rows.length} tone={rows.length > 0 ? "warning" : "positive"} />
          </div>
        )}
      </McReportGate>
    </WidgetShell>
  );
}
