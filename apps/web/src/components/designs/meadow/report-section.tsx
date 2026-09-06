/**
 * The project page's snitch-report building blocks — the same widgets the
 * dashboard renders, exported per-section so the page's tabs (ACTIVITY /
 * CODE / AI) compose them: the cadence area panel, the language-distribution
 * donut + ranked bars, alert cards with their full summaries, and the
 * subsidized-AI-cost band. All read through the same lazy cached pipeline
 * the mosaic tiles use, and a missing report collapses into one compact
 * generate strip instead of empty framing.
 */

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BrainCircuit,
  Check,
  Copy,
  FileText,
  FlaskConical,
  History,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";

import { SoftNumber } from "@/components/designs/meadow/bits";
import {
  CadenceArea,
  Donut,
  HBars,
  RatioBar,
} from "@/components/designs/meadow/charts";
import {
  formatCost,
  formatTokens,
  useReportJson,
  useReportRunner,
} from "@/components/designs/meadow/report-data";
import type { ReportView } from "@/components/designs/meadow/report-data";
import { toReportView } from "@/components/designs/meadow/report-data";

interface ProjectReportProps {
  path: string;
  updatedAt: string;
}

const SEVERITY_COLOR: Record<"info" | "warning" | "critical", string> = {
  info: "var(--sev-info)",
  warning: "var(--sev-warning)",
  critical: "var(--sev-critical)",
};

/** Soft pastel ramp for distribution slices (top-N + "other"). */
const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * Gate every report panel behind the shared pipeline: spinner while the
 * cache is read, one compact generate strip when no export exists, and the
 * normalized view handed to children when it does.
 */
function ProjectReportRequire({
  path,
  updatedAt,
  children,
}: ProjectReportProps & { children: (view: ReportView) => React.ReactNode }) {
  const { key, command, commandError, data, pending } = useReportJson({
    kind: "repo",
    path,
  });
  const { generate, busy } = useReportRunner({ kind: "repo", path });
  const [commandCopied, setCommandCopied] = useState(false);

  const copyCommand = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCommandCopied(true);
      setTimeout(() => setCommandCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy the command");
    }
  };

  if (pending) {
    return (
      <div className="meadow-panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Reading the report cache…
      </div>
    );
  }

  const view = data !== null ? toReportView(data, [updatedAt]) : null;
  if (view !== null) return <>{children(view)}</>;

  return (
    <section
      aria-label="Generate project report"
      className="meadow-panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
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
        <Button size="xs" disabled={!key} onClick={() => generate(false)}>
          {key ? (
            <FlaskConical aria-hidden className="size-3" />
          ) : (
            <Loader2 aria-hidden className="size-3 animate-spin" />
          )}
          {busy ? "Starting…" : "Generate report"}
        </Button>
        {command ? (
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
      {command ? (
        <pre className="w-full overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-2.5 font-mono text-[0.6rem] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
          {command}
        </pre>
      ) : commandError ? (
        <p className="w-full text-[10px]" style={{ color: "var(--sev-critical)" }}>
          Command unavailable: {commandError}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The headline strip: five warm figures from the report — the subsidized
 * AI cost deliberately the loudest cell on the strip.
 */
export function ProjectReportStats({ path, updatedAt }: ProjectReportProps) {
  return (
    <ProjectReportRequire path={path} updatedAt={updatedAt}>
      {(view) => (
        <section
          aria-label="Project report at a glance"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
        >
          <StatCell
            label="commits"
            value={view.totals.commits.toLocaleString()}
          />
          <StatCell
            label={
              view.totals.contributors === 1 ? "contributor" : "contributors"
            }
            value={view.totals.contributors}
          />
          <StatCell
            label="top language"
            value={view.languages[0]?.language ?? "—"}
            sub={
              view.languages[0]
                ? `${formatTokens(view.languages[0].lines)} lines`
                : undefined
            }
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
        </section>
      )}
    </ProjectReportRequire>
  );
}

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
        className="text-2xl leading-tight font-semibold tracking-tight text-foreground"
      />
      {sub ? (
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      ) : null}
    </div>
  );
}

/**
 * ACTIVITY tab: the cadence area filling its panel edge to edge, with the
 * repo totals carried in the header.
 */
export function ProjectCadencePanel({
  path,
  updatedAt,
}: ProjectReportProps) {
  return (
    <ProjectReportRequire path={path} updatedAt={updatedAt}>
      {(view) => (
        <section
          aria-label="Commit cadence"
          className="meadow-panel flex min-h-0 flex-col gap-2 p-4"
        >
          <PanelHead
            icon={History}
            title="Commit cadence"
            trailing={
              <span className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {view.totals.commits.toLocaleString()}
                </span>
                commits ·
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {view.totals.contributors}
                </span>
                {view.totals.contributors === 1 ? "contributor" : "contributors"}
              </span>
            }
          />
          {view.cadence.length === 0 ? (
            <p className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
              No dated commits to chart.
            </p>
          ) : (
            <CadenceArea
              data={view.cadence}
              className="h-80"
              label={`${view.export.targetPath}: commits per period`}
            />
          )}
        </section>
      )}
    </ProjectReportRequire>
  );
}

/**
 * CODE tab, left column: the language distribution as a soft donut with
 * the ranked line-count bars beside it.
 */
export function ProjectLanguagesPanel({
  path,
  updatedAt,
}: ProjectReportProps) {
  return (
    <ProjectReportRequire path={path} updatedAt={updatedAt}>
      {(view) => {
        const top = view.languages.slice(0, 5);
        const restLines = view.languages
          .slice(5)
          .reduce((sum, l) => sum + l.lines, 0);
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
        const totalLines = view.languages.reduce((sum, l) => sum + l.lines, 0);

        return (
          <section
            aria-label="Language distribution"
            className="meadow-panel flex min-h-0 flex-col gap-3 p-4"
          >
            <PanelHead icon={FileText} title="Language mix" />
            {view.languages.length === 0 ? (
              <p className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
                No language data in this report.
              </p>
            ) : (
              <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex justify-center">
                  <Donut
                    slices={slices}
                    centerValue={formatTokens(totalLines)}
                    centerLabel="lines"
                    label="Language share by lines of code"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <HBars
                    data={view.languages.slice(0, 6).map((l) => ({
                      label: l.language,
                      value: l.lines,
                      display: `${formatTokens(l.lines)} ln · ${l.files} files`,
                    }))}
                    label="Lines of code by language"
                  />
                </div>
              </div>
            )}
          </section>
        );
      }}
    </ProjectReportRequire>
  );
}

/**
 * CODE tab, right column: the health alerts as cards carrying their full
 * summaries, stacked.
 */
export function ProjectAlertsPanel({ path, updatedAt }: ProjectReportProps) {
  return (
    <ProjectReportRequire path={path} updatedAt={updatedAt}>
      {(view) => (
        <section aria-label="Health alerts" className="flex min-w-0 flex-col gap-2">
          <PanelHead icon={BadgeCheck} title="Health alerts" tone />
          {view.alerts.length === 0 ? (
            <div className="meadow-panel flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
              All clear — no health alerts in this report.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {view.alerts.map((a) => (
                <article
                  key={`${a.label}-${a.value}`}
                  className="meadow-panel flex flex-col gap-1.5 p-3.5"
                  style={{
                    borderColor: `color-mix(in oklch, ${SEVERITY_COLOR[a.severity]} 30%, var(--border))`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: SEVERITY_COLOR[a.severity] }}
                    />
                    <h4 className="text-xs font-semibold tracking-tight text-foreground">
                      {a.label}
                    </h4>
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                      style={{
                        color: SEVERITY_COLOR[a.severity],
                        background: `color-mix(in oklch, ${SEVERITY_COLOR[a.severity]} 10%, transparent)`,
                      }}
                    >
                      {a.value}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {a.summary}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </ProjectReportRequire>
  );
}

/**
 * AI tab: the subsidized-cost band — the loudest figure on the page — with
 * token totals, records, and the input/output ratio.
 */
export function ProjectAiBand({ path, updatedAt }: ProjectReportProps) {
  return (
    <ProjectReportRequire path={path} updatedAt={updatedAt}>
      {(view) =>
        view.aiUsage === null ? (
          <div className="meadow-panel flex min-h-56 items-center justify-center p-6 text-sm text-muted-foreground">
            No AI usage recorded for this project in the current report.
          </div>
        ) : (
          <section
            aria-label="AI usage"
            className="meadow-panel flex min-h-56 flex-col justify-center gap-6 p-6"
            style={{
              background:
                "color-mix(in oklch, var(--pinned-accent) 4%, var(--card))",
            }}
          >
            <PanelHead icon={BrainCircuit} title="AI usage" tone />
            <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Subsidized cost (recorded)
                </span>
                <SoftNumber
                  value={formatCost(view.aiUsage.cost)}
                  className="text-5xl leading-tight font-semibold tracking-tight"
                  style={{ color: "var(--pinned-accent)" }}
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Tokens total
                </span>
                <span className="text-2xl leading-tight font-semibold tabular-nums text-foreground">
                  {formatTokens(view.aiUsage.tokens.total)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Records
                </span>
                <span className="text-2xl leading-tight font-semibold tabular-nums text-foreground">
                  {view.aiUsage.records.toLocaleString()}
                </span>
              </div>
              <div className="ml-auto flex w-full max-w-sm flex-col gap-1.5">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>in {formatTokens(view.aiUsage.tokens.input)}</span>
                  <span>out {formatTokens(view.aiUsage.tokens.output)}</span>
                </div>
                <RatioBar
                  a={view.aiUsage.tokens.input}
                  b={view.aiUsage.tokens.output}
                  colorA="var(--pinned-accent)"
                  label="Input vs output token ratio"
                />
                <p className="text-[10px] text-muted-foreground">
                  What the plans subsidize: the recorded spend against{" "}
                  {view.aiUsage.records.toLocaleString()} tracked model calls.
                </p>
              </div>
            </div>
          </section>
        )
      }
    </ProjectReportRequire>
  );
}

function PanelHead({
  icon: Icon,
  title,
  trailing,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  trailing?: React.ReactNode;
  tone?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-full"
        style={
          tone
            ? {
                color: "var(--pinned-accent)",
                background:
                  "color-mix(in oklch, var(--pinned-accent) 11%, transparent)",
              }
            : {
                color: "var(--recency-fresh)",
                background:
                  "color-mix(in oklch, var(--recency-fresh) 11%, transparent)",
              }
        }
      >
        <Icon className="size-3" />
      </span>
      <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </div>
  );
}
