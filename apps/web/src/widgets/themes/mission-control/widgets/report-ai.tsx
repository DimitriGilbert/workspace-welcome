/**
 * McReportAi — the AI-usage report widget (port of the design's
 * `ReportAiWidget` body, `components/designs/mission-control/
 * report-widgets.tsx`): the subsidized cost is the hero numeral (40px mono,
 * accent register) beside the per-record/per-token ratios; the token
 * in/out split rides the design's TokenBar pair over a hairline-topped
 * tokens block. No AI usage in the window renders the totals trio honestly.
 * Below the full rung: cost + token totals; smallest: the cost numeral.
 */
import { Stat } from "@workspace-welcome/ui/components/stat";

import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { useWidgetSize, WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate, ReportGeneratedMeta } from "./report-shared";

/** Compact 12.4k / 1.2M numeral for chart centers and legends. */
function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** The design's MiniStat: micro caps label under a mid-size mono numeral. */
export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[15px] leading-none font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

/** The design's TokenBar: label, hairline bar, right-aligned numeral. */
function TokenBar({
  label,
  value,
  total,
  fill,
}: {
  label: string;
  value: number;
  total: number;
  fill: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span aria-hidden className="h-1.5 flex-1 bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)]">
        <span
          className="block h-full"
          style={{ width: `${Math.round((value / Math.max(1, total)) * 100)}%`, background: fill }}
        />
      </span>
      <span className="w-16 text-right font-mono text-[10.5px] tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export function McReportAi(_props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const ai = view?.aiUsage ?? null;
  const placed = useWidgetSize();

  const totals = view?.totals ?? { commits: 0, contributors: 0, repositories: 0 };
  const full = placed.cols >= 3 && placed.rows >= 3;
  const mid = placed.cols >= 2 && placed.rows >= 2;

  return (
    <WidgetShell
      className="h-full w-full"
      meta={view === null || ai === null ? undefined : <ReportGeneratedMeta />}
    >
      <McReportGate>
        {ai !== null && full ? (
          // The design's full cluster: cost hero + ratios, then the tokens
          // block — everything visible at once, no tabbed dead halves.
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-between gap-4 overflow-hidden px-3.5 pb-3">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="flex items-baseline gap-2.5">
                <span
                  className="font-mono text-[40px] leading-none font-medium tracking-tight tabular-nums text-(--mc-accent)"
                  title="Subsidized cost of recorded AI usage"
                >
                  ${ai.cost.toFixed(ai.cost < 10 ? 2 : 0)}
                </span>
                <span className="font-mono text-[9.5px] uppercase leading-tight tracking-[0.14em] text-muted-foreground">
                  subsidized
                  <br />
                  cost
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                <MiniStat label="cost / record" value={`$${(ai.cost / Math.max(1, ai.records)).toFixed(4)}`} />
                <MiniStat label="tokens / record" value={Math.round(ai.tokens.total / Math.max(1, ai.records)).toLocaleString()} />
                <MiniStat label="cost / 1k tok" value={`$${((ai.cost / Math.max(1, ai.tokens.total)) * 1000).toFixed(4)}`} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-(--mc-line) pt-3">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  tokens · {ai.records.toLocaleString()} records
                </span>
                <span className="font-mono text-[12px] tabular-nums text-foreground">
                  {ai.tokens.total.toLocaleString()}
                </span>
              </div>
              <TokenBar label="in" value={ai.tokens.input} total={ai.tokens.total} fill="var(--chart-5)" />
              <TokenBar label="out" value={ai.tokens.output} total={ai.tokens.total} fill="var(--chart-1)" />
            </div>
          </div>
        ) : ai !== null && mid ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-4 overflow-hidden px-3.5 pb-2">
            <Stat
              label="Subsidized cost"
              value={`$${compactCount(ai.cost)}`}
              tone="accent"
              size="lg"
              hint="Subsidized cost of recorded AI usage"
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                tokens · {ai.records.toLocaleString()} records · {ai.tokens.total.toLocaleString()} total
              </span>
              <TokenBar label="in" value={ai.tokens.input} total={ai.tokens.total} fill="var(--chart-5)" />
              <TokenBar label="out" value={ai.tokens.output} total={ai.tokens.total} fill="var(--chart-1)" />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 w-full min-w-0 items-center overflow-hidden px-3.5 pb-2">
            {ai === null ? (
              <div className="flex min-w-0 flex-col gap-2 py-1">
                <p className="font-mono text-[11px] text-muted-foreground">
                  No AI usage recorded in this window.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="commits" value={totals.commits.toLocaleString()} />
                  <MiniStat label="contributors" value={String(totals.contributors)} />
                  <MiniStat label="repos" value={String(totals.repositories)} />
                </div>
              </div>
            ) : (
              <Stat
                label="Subsidized cost"
                value={`$${ai.cost.toFixed(ai.cost < 10 ? 2 : 0)}`}
                tone="accent"
                hint="Subsidized cost of recorded AI usage"
              />
            )}
          </div>
        )}
      </McReportGate>
    </WidgetShell>
  );
}
