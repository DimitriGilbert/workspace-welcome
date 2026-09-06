/**
 * Meadow project report strip, ported from the design's `ProjectReportStats`
 * (`components/designs/meadow/report-section.tsx`) into the theme namespace
 * (owner correction: theme widgets carry the prototype's presentation): five
 * warm figures from this repo's report — commits, contributors, top
 * language, the subsidized AI cost as the honey-tinted loud cell, and the
 * token total. The report state machine (missing/stale/running/fresh) is
 * ReportProvider's; the numbers read the context's normalized view.
 */
import { useState } from "react";
import { Check, Copy, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";

import { SoftNumber } from "./bits";
import { formatCost, formatTokens } from "@/lib/format";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";
import type { ReportView } from "@/lib/report-view";

function StatCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="meadow-panel flex flex-col gap-0.5 p-4">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <SoftNumber
        value={value}
        className="truncate text-2xl leading-tight font-semibold tracking-tight text-foreground"
      />
      {sub ? (
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      ) : null}
    </div>
  );
}

function StatsStrip({ view }: { view: ReportView }) {
  const top = view.languageRows[0];
  return (
    <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatCell label="commits" value={view.totals.commits.toLocaleString()} />
      <StatCell
        label={view.totals.contributors === 1 ? "contributor" : "contributors"}
        value={view.totals.contributors}
      />
      <StatCell
        label="top language"
        value={top?.language ?? "—"}
        sub={top ? `${formatTokens(top.lines)} lines` : undefined}
      />
      <div
        className="meadow-panel flex flex-col gap-0.5 p-4"
        style={{
          background:
            "color-mix(in oklch, var(--pinned-accent) 6%, var(--card))",
          borderColor:
            "color-mix(in oklch, var(--pinned-accent) 22%, var(--border))",
        }}
      >
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          AI cost · subsidized
        </span>
        {view.aiUsage ? (
          <>
            <SoftNumber
              value={formatCost(view.aiUsage.cost)}
              className="text-2xl leading-tight font-semibold tracking-tight"
              style={{ color: "var(--pinned-accent)" }}
            />
            <span className="text-[10px] text-muted-foreground">
              across {formatTokens(view.aiUsage.records)} tracked records
            </span>
          </>
        ) : (
          <span className="py-1 text-sm text-muted-foreground">
            no AI usage recorded
          </span>
        )}
      </div>
      <StatCell
        label="AI tokens"
        value={view.aiUsage ? formatTokens(view.aiUsage.tokens.total) : "—"}
        sub={
          view.aiUsage
            ? `${formatTokens(view.aiUsage.records)} records`
            : undefined
        }
      />
    </div>
  );
}

/** The design's generate strip for a missing report, over the context. */
function GenerateStrip() {
  const report = useReport();
  const [commandCopied, setCommandCopied] = useState(false);

  const copyCommand = async () => {
    if (!report.command) return;
    try {
      await navigator.clipboard.writeText(report.command);
      setCommandCopied(true);
      setTimeout(() => setCommandCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy the command");
    }
  };

  const busy = report.status === "running" || report.status === "loading";

  return (
    <section
      aria-label="Generate project report"
      className="meadow-panel flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4"
    >
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full"
        style={{
          color: "var(--recency-fresh)",
          background:
            "color-mix(in oklch, var(--recency-fresh) 11%, transparent)",
        }}
      >
        <FlaskConical className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">
          No snitch report for this project yet.
        </span>{" "}
        Generate one to light up the cadence graph, health alerts, language
        mix, and AI cost — or run the command yourself.
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          disabled={report.key === null}
          onClick={() => report.generate()}
        >
          {report.key === null ? (
            <Loader2 aria-hidden className="size-3 animate-spin" />
          ) : (
            <FlaskConical aria-hidden className="size-3" />
          )}
          {busy ? "Starting…" : "Generate report"}
        </Button>
        {report.command ? (
          <Button variant="outline" size="xs" onClick={copyCommand}>
            {commandCopied ? (
              <Check aria-hidden className="size-3" />
            ) : (
              <Copy aria-hidden className="size-3" />
            )}
            {commandCopied ? "Copied" : "Copy command"}
          </Button>
        ) : null}
      </div>
      {report.command ? (
        <pre className="meadow-scroll w-full overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-2.5 font-mono text-[0.6rem] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
          {report.command}
        </pre>
      ) : report.commandError ? (
        <p className="w-full text-[10px]" style={{ color: "var(--sev-critical)" }}>
          Command unavailable: {report.commandError}
        </p>
      ) : null}
    </section>
  );
}

function StatsFull() {
  const report = useReport();
  const view = report.view;

  if (report.status === "loading" && view === null) {
    return (
      <div className="meadow-panel flex w-full items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Reading the report cache…
      </div>
    );
  }
  if (view === null) return <GenerateStrip />;
  return <StatsStrip view={view} />;
}

export function MeadowProjectStats({ size }: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;

  const gatedStrip = <StatsFull />;

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
        // Every placement above 1x1 renders the ONE stat strip — its grid
        // wraps to the width (2 cols on phones, 5 on desktop).
        "2x1": gatedStrip,
      }}
    >
      {gatedStrip}
    </WidgetShell>
  );
}
