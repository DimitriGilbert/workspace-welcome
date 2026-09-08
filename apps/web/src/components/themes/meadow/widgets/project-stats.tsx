/**
 * Meadow project report widgets, ported from the design's `ProjectReportStats`
 * (`components/designs/meadow/report-section.tsx`) into the theme namespace
 * (owner correction: theme widgets carry the prototype's presentation).
 *
 * Two presentations over this repo's report: the wide stat strip (five warm
 * figures — commits, contributors, top language, the honey-tinted subsidized
 * AI cost, the token total) and the right-rail glance card (compact figures
 * over the language donut + bars — the sizing law's "charts render whenever
 * the box fits them"). The report state machine (missing/stale/running/fresh)
 * is ReportProvider's; the numbers read the context's normalized view.
 */
import { useState } from "react";
import { Check, Copy, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";

import { Donut, HBars, SLICE_COLORS, SoftNumber } from "./bits";
import { formatCost, formatTokens } from "@/lib/format";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";
import { WidgetShell } from "@/components/widgets/widget-shell";
import type { ReportView } from "@/lib/report-view";

function StatCell({
  label,
  value,
  sub,
  accent = false,
  compact = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** The honey-tinted loud register (the subsidized AI cost). */
  accent?: boolean;
  /** Rail-card register: tighter padding, smaller figure. */
  compact?: boolean;
}) {
  return (
    <div
      className={`meadow-panel flex min-w-0 flex-col gap-0.5 ${compact ? "p-3" : "p-4"}`}
      style={
        accent
          ? {
              background:
                "color-mix(in oklch, var(--pinned-accent) 6%, var(--card))",
              borderColor:
                "color-mix(in oklch, var(--pinned-accent) 22%, var(--border))",
            }
          : undefined
      }
    >
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <SoftNumber
        value={value}
        className={`truncate leading-tight font-semibold tracking-tight ${compact ? "text-lg" : "text-2xl"} ${accent ? "" : "text-foreground"}`}
        style={accent ? { color: "var(--pinned-accent)" } : undefined}
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
      <StatCell
        accent
        label="AI cost · subsidized"
        value={view.aiUsage ? formatCost(view.aiUsage.cost) : "—"}
        sub={
          view.aiUsage
            ? `across ${formatTokens(view.aiUsage.records)} tracked records`
            : "no AI usage recorded"
        }
      />
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

/**
 * The right-rail glance card (the preset's 4x4 placement): four compact
 * figures over the language mix — the donut and bars render because the box
 * fits them, so the rail carries the report's shape, not just its totals.
 */
function StatsGlance({ view }: { view: ReportView }) {
  const languages = view.languageRows;
  const top = languages.slice(0, 4);
  const restLines = languages.slice(4).reduce((sum, l) => sum + l.lines, 0);
  const slices = [
    ...top.map((l, i) => ({
      label: l.language,
      value: l.lines,
      color: SLICE_COLORS[i] ?? "var(--muted)",
    })),
    ...(restLines > 0
      ? [
          {
            label: "Other",
            value: restLines,
            color:
              "color-mix(in oklch, var(--muted-foreground) 35%, var(--muted))",
          },
        ]
      : []),
  ];
  const totalLines = languages.reduce((sum, l) => sum + l.lines, 0);

  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-2.5 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2.5">
        <StatCell
          compact
          label="commits"
          value={view.totals.commits.toLocaleString()}
        />
        <StatCell
          compact
          label={
            view.totals.contributors === 1 ? "contributor" : "contributors"
          }
          value={view.totals.contributors}
        />
        <StatCell
          compact
          accent
          label="AI cost · subsidized"
          value={view.aiUsage ? formatCost(view.aiUsage.cost) : "—"}
          sub={
            view.aiUsage
              ? `${formatTokens(view.aiUsage.records)} records`
              : "none recorded"
          }
        />
        <StatCell
          compact
          label="AI tokens"
          value={view.aiUsage ? formatTokens(view.aiUsage.tokens.total) : "—"}
        />
      </div>
      {languages.length > 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-x-5 gap-y-3">
          <div className="aspect-square h-full max-w-44 shrink-0">
            <Donut
              fill
              slices={slices}
              centerValue={formatTokens(totalLines)}
              centerLabel="lines"
              label="Language share by lines of code"
            />
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            <HBars
              data={top.map((l) => ({
                label: l.language,
                value: l.lines,
                display: `${formatTokens(l.lines)} ln · ${l.files} files`,
              }))}
              label="Lines of code by language"
            />
          </div>
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">
          No language data in this report.
        </p>
      )}
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

/** Report-state gate shared by both presentations. */
function StatsFull({ glance = false }: { glance?: boolean }) {
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
  return glance ? <StatsGlance view={view} /> : <StatsStrip view={view} />;
}

export function MeadowProjectStats({ size }: RegisteredWidgetProps) {
  const report = useReport();
  const view = report.view;

  const gatedStrip = <StatsFull />;
  const gatedGlance = <StatsFull glance />;

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
        // Wide placements render the wrapping stat strip (2 cols on phones,
        // 5 on desktop); from the 2x3 rung up the box fits the glance card's
        // donut, so the rail placement carries the language charts too.
        "2x1": gatedStrip,
        "2x3": gatedGlance,
      }}
    >
      {gatedStrip}
    </WidgetShell>
  );
}
