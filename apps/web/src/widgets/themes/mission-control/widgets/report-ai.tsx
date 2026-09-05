/**
 * McReportAi — the AI-usage report widget (T2 port of the design's
 * `ReportAiWidget`): the subsidized cost stays the hero numeral on every
 * tab. Full rung: the cost hero (lg Stat in the accent register) + the
 * per-record/per-token ratios + the token in/out split as a `SegBar`
 * (the design's TokenBar pair, one stacked bar of the same two segments).
 * Below the full rung: cost + token totals; smallest: the cost numeral.
 * No AI usage in the window renders the totals trio honestly.
 */
import { formatCost } from "@/lib/format";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { SegBar } from "@workspace-welcome/ui/components/seg-bar";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

import { McReportGate, ReportGeneratedMeta } from "./report-shared";

const TOKEN_IN_COLOR = "var(--chart-5)";
const TOKEN_OUT_COLOR = "var(--chart-1)";

export function McReportAi(props: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;
  const ai = view?.aiUsage ?? null;

  const totals = view?.totals ?? { commits: 0, contributors: 0, repositories: 0 };

  return (
    <WidgetShell
      className="h-full w-full"
      meta={view === null || ai === null ? undefined : <ReportGeneratedMeta />}
    >
      <McReportGate>
        <WidgetShell
          className="h-full w-full"
          size={{ cols: props.size.cols, rows: props.size.rows }}
          sizes={{
            "1x1": (
              <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
                <Stat label="AI cost" value={ai === null ? "—" : formatCost(ai.cost)} tone="accent" />
              </div>
            ),
            "2x2": (
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-4 overflow-hidden px-3 pb-2">
                <Stat
                  label="Subsidized cost"
                  value={ai === null ? "—" : formatCost(ai.cost)}
                  tone="accent"
                  size="lg"
                />
                {ai === null ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
                    <Stat label="Commits" value={totals.commits} size="sm" />
                    <Stat label="Contributors" value={totals.contributors} size="sm" />
                    <Stat label="Repos" value={totals.repositories} size="sm" />
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                      tokens · {ai.records.toLocaleString()} records · {ai.tokens.total.toLocaleString()} total
                    </span>
                    <SegBar
                      height={10}
                      ariaLabel={`Token split: ${ai.tokens.input.toLocaleString()} input, ${ai.tokens.output.toLocaleString()} output`}
                      segments={[
                        { value: ai.tokens.input, color: TOKEN_IN_COLOR, label: "input" },
                        { value: ai.tokens.output, color: TOKEN_OUT_COLOR, label: "output" },
                      ]}
                    />
                    <span className="flex gap-4 font-mono text-[9.5px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className="size-2" style={{ background: TOKEN_IN_COLOR }} />
                        in {ai.tokens.input.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className="size-2" style={{ background: TOKEN_OUT_COLOR }} />
                        out {ai.tokens.output.toLocaleString()}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            ),
            "3x3": (
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-between gap-4 overflow-hidden px-3 pb-3">
                {ai === null ? (
                  <div className="flex min-w-0 flex-col gap-3">
                    <p className="font-mono text-[11px] text-muted-foreground">
                      No AI usage recorded in this window.
                    </p>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
                      <Stat label="Commits" value={totals.commits.toLocaleString()} />
                      <Stat label="Contributors" value={String(totals.contributors)} />
                      <Stat label="Repos" value={String(totals.repositories)} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-3">
                      <Stat
                        label="Subsidized cost"
                        value={formatCost(ai.cost)}
                        tone="accent"
                        size="lg"
                        hint="Subsidized cost of recorded AI usage"
                      />
                      <div className="grid grid-cols-3 gap-x-5 gap-y-1">
                        <Stat label="Cost / record" value={formatCost(ai.cost / Math.max(1, ai.records))} size="sm" />
                        <Stat
                          label="Tokens / record"
                          value={Math.round(ai.tokens.total / Math.max(1, ai.records)).toLocaleString()}
                          size="sm"
                        />
                        <Stat
                          label="Cost / 1k tok"
                          value={formatCost((ai.cost / Math.max(1, ai.tokens.total)) * 1000)}
                          size="sm"
                        />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5 border-t border-(--mc-line) pt-3">
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                          tokens · {ai.records.toLocaleString()} records
                        </span>
                        <span className="font-mono text-[12px] tabular-nums text-foreground">
                          {ai.tokens.total.toLocaleString()}
                        </span>
                      </div>
                      <SegBar
                        height={10}
                        ariaLabel={`Token split: ${ai.tokens.input.toLocaleString()} input, ${ai.tokens.output.toLocaleString()} output`}
                        segments={[
                          { value: ai.tokens.input, color: TOKEN_IN_COLOR, label: "input" },
                          { value: ai.tokens.output, color: TOKEN_OUT_COLOR, label: "output" },
                        ]}
                      />
                      <span className="flex gap-4 font-mono text-[9.5px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className="size-2" style={{ background: TOKEN_IN_COLOR }} />
                          in {ai.tokens.input.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className="size-2" style={{ background: TOKEN_OUT_COLOR }} />
                          out {ai.tokens.output.toLocaleString()}
                        </span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            ),
          }}
        >
          <div className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 pb-2">
            <Stat label="AI cost" value={ai === null ? "—" : formatCost(ai.cost)} tone="accent" />
          </div>
        </WidgetShell>
      </McReportGate>
    </WidgetShell>
  );
}
