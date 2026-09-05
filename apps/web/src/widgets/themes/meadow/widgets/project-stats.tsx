/**
 * Meadow project report strip (T3-meadow) — port of the design's
 * `ProjectReportStats` (`components/designs/meadow/report-section.tsx`):
 * five warm figures from this repo's report — commits, contributors, top
 * language, the subsidized AI cost as the honey-tinted loud cell, and the
 * token total. The report state machine (missing/stale/running/fresh) is
 * ReportGate's; the numbers read the report context's normalized view.
 */
import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";

import { formatCost, formatTokens } from "@/lib/format";
import { useReport } from "@/widgets/contexts/report-context";
import { ReportGate } from "@/widgets/parts";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** The report view-model as the report context serves it (stays on the
 * sanctioned import surface — no direct lib/report-view dependency). */
type ReportView = NonNullable<ReturnType<typeof useReport>["view"]>;

function StatCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div data-slot="meadow-card" className="flex min-w-0 flex-col gap-0.5 p-3">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-2xl leading-tight font-semibold tracking-tight text-foreground">
        {value}
      </span>
      {sub ? <span className="text-[10px] text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function StatsStrip({ view }: { view: ReportView }) {
  const top = view.languageRows[0];
  return (
    <div className="grid h-full w-full grid-cols-2 content-center gap-2 sm:grid-cols-3 xl:grid-cols-5">
      <StatCell label="commits" value={view.totals.commits.toLocaleString()} />
      <StatCell
        label={view.totals.contributors === 1 ? "contributor" : "contributors"}
        value={String(view.totals.contributors)}
      />
      <StatCell
        label="top language"
        value={top?.language ?? "—"}
        sub={top ? `${formatTokens(top.lines)} lines` : undefined}
      />
      <div
        data-slot="meadow-card"
        className="flex min-w-0 flex-col gap-0.5 p-3"
        style={{
          background: "color-mix(in oklch, var(--pinned-accent) 6%, var(--card))",
          borderColor: "color-mix(in oklch, var(--pinned-accent) 22%, var(--border))",
        }}
      >
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          AI cost · subsidized
        </span>
        {view.aiUsage ? (
          <>
            <AnimatedNumber
              value={formatCost(view.aiUsage.cost)}
              className="truncate text-2xl leading-tight font-semibold tracking-tight"
              style={{ color: "var(--pinned-accent)" }}
            />
            <span className="text-[10px] text-muted-foreground">
              across {formatTokens(view.aiUsage.records)} tracked records
            </span>
          </>
        ) : (
          <span className="py-1 text-sm text-muted-foreground">no AI usage recorded</span>
        )}
      </div>
      <StatCell
        label="AI tokens"
        value={view.aiUsage ? formatTokens(view.aiUsage.tokens.total) : "—"}
        sub={view.aiUsage ? `${formatTokens(view.aiUsage.records)} records` : undefined}
      />
    </div>
  );
}

export function MeadowProjectStats({ size }: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;

  const gatedStrip = (
    <ReportGate mode="banner" className="flex min-h-0 flex-1 flex-col">
      {view !== null ? <StatsStrip view={view} /> : null}
    </ReportGate>
  );

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": (
          <div className="flex h-full w-full min-w-0 items-center overflow-hidden px-1">
            <span className="truncate text-sm font-semibold tabular-nums text-foreground">
              {view === null ? "—" : `${view.totals.commits.toLocaleString()} commits`}
            </span>
          </div>
        ),
        "2x1": (
          <div className="flex h-full w-full min-w-0 flex-wrap content-center items-baseline gap-x-4 gap-y-0.5 overflow-hidden px-1">
            <span className="text-[11px] text-muted-foreground">
              <AnimatedNumber
                value={view?.totals.commits ?? 0}
                className="text-xs font-semibold tabular-nums text-foreground"
              />{" "}
              commits
            </span>
            <span className="text-[11px] text-muted-foreground">
              <AnimatedNumber
                value={view?.totals.contributors ?? 0}
                className="text-xs font-semibold tabular-nums text-foreground"
              />{" "}
              {view?.totals.contributors === 1 ? "contributor" : "contributors"}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {view?.languageRows[0]?.language ?? "—"}
            </span>
          </div>
        ),
        "12x1": gatedStrip,
      }}
    >
      {gatedStrip}
    </WidgetShell>
  );
}
