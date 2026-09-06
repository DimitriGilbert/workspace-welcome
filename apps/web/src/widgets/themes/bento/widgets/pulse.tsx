/**
 * Bento's workspace pulse — port of the design's `report-panel.tsx` (the
 * tabbed snitch-report band: Activity / Health / Code / AI usage over one
 * export, with the MISSING / RUNNING / STALE / FRESH machine). The state
 * machine, CLI command, generate pipeline and staleness verdict come from
 * the page's ReportProvider (`useReport`) instead of the design's local
 * queries — the same react-query cache, mounted once per page. Charts:
 * the activity tab rides the ui Chart part; the code tab is the design's
 * pure-SVG donut; everything else is the design's markup verbatim.
 */
import { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  Check,
  Copy,
  FileClock,
  Gauge,
  Loader2,
  RefreshCw,
  Terminal as TerminalIcon,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { Chart } from "@workspace-welcome/ui/components/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace-welcome/ui/components/tabs";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { ReportExport } from "@workspace-welcome/api/lib/report-export";

import { formatCompact, relativeTime } from "@/lib/format";
import { aiUsageLeaders, alertTally, aggregateCadence, languageRows } from "@/lib/scan-metrics";

import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";

import { BentoTile } from "../bits";
import { DataCarousel } from "../data-carousel";

const SEVERITY_COLOR = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
} as const;

/** Donut slice color for the i-th language, off the shared categorical ramp. */
function STACK_COLOR(i: number): string {
  const ramp = [
    "var(--bento-c1)",
    "var(--bento-c2)",
    "var(--bento-c3)",
    "var(--bento-c4)",
    "var(--bento-c5)",
    "var(--bento-c6)",
  ];
  return ramp[i % ramp.length];
}

export interface ReportPanelProps {
  /** Widget heading (the design's b-label row). */
  title?: string;
  className?: string;
}

/**
 * The tabbed snitch-report widget over the page's report scope. Callers
 * supply only chrome inputs — scope, staleness and the write pipeline are
 * the provider's.
 */
export function ReportPanel({ title = "Workspace pulse", className }: ReportPanelProps) {
  const report = useReport();
  const [tab, setTab] = useState("activity");

  const data = report.exportData;
  const stale = report.status === "stale";
  const generating = report.generating;

  const copyCommand = async () => {
    const command = report.command;
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Command copied");
    } catch {
      toast.error("Couldn't copy command");
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="b-label">{title}</h2>
        {data !== null ? (
          <>
            <span className="font-mono text-[0.68rem] text-muted-foreground">
              generated {relativeTime(data.generatedAt)} · {data.totals.repositories}{" "}
              {data.totals.repositories === 1 ? "repo" : "repos"} ·{" "}
              {data.totals.commits.toLocaleString()} commits · {data.totals.contributors} contrib.
              {data.totals.languages.length > 0
                ? ` · ${data.totals.languages.length} languages`
                : ""}
              {data.aiUsage ? ` · AI $${data.aiUsage.cost.toFixed(2)}` : ""}
            </span>
            {stale ? (
              <button
                type="button"
                onClick={() => report.generate({ force: true })}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.68rem] transition-colors disabled:opacity-60"
                style={{
                  color: "var(--sev-warning)",
                  borderColor: "color-mix(in oklch, var(--sev-warning) 45%, transparent)",
                  background: "color-mix(in oklch, var(--sev-warning) 10%, transparent)",
                }}
                title="The project moved on after this report was generated — regenerate to catch up"
              >
                {generating ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FileClock className="size-3" />
                )}
                {generating ? "Regenerating…" : "Stale — regenerate"}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 font-mono text-[0.68rem]"
                style={{ color: "var(--state-positive)" }}
                title="Report is newer than the latest project change"
              >
                <span className="size-1.5 rounded-full" style={{ background: "var(--state-positive)" }} />
                fresh
              </span>
            )}
          </>
        ) : (
          <span className="font-mono text-[0.68rem] text-muted-foreground">
            git-snitch · comparative root report
          </span>
        )}

        <span className="ml-auto flex items-center gap-1.5">
          {data !== null && !stale ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => report.generate({ force: true })}
              disabled={generating}
            >
              <RefreshCw className={cn("size-3", generating && "animate-spin")} /> Regenerate
            </Button>
          ) : null}
          {report.command ? (
            <Button variant="ghost" size="xs" onClick={copyCommand} title="Copy the git-snitch CLI invocation">
              <TerminalIcon className="size-3" /> CLI
            </Button>
          ) : null}
        </span>
      </div>

      <div className="mt-3 flex min-h-0 flex-1">
        {report.status === "loading" ? (
          <SkeletonState />
        ) : report.status === "running" ? (
          <RunningState />
        ) : data === null ? (
          <MissingState
            message={
              report.command === null
                ? (report.commandError ?? "The git-snitch CLI is not resolvable on this host.")
                : "No cached report for this target yet. Generate one — the charts read the structured JSON the run saves alongside the HTML."
            }
            command={report.command}
            onGenerate={() => report.generate()}
            generating={generating}
          />
        ) : (
          <ReportTabs data={data} tab={tab} onTabChange={setTab} seed={data.key} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

function ReportTabs({
  data,
  tab,
  onTabChange,
  seed,
}: {
  data: ReportExport;
  tab: string;
  onTabChange: (tab: string) => void;
  seed: string;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => onTabChange(v ?? "activity")}
      className="b-tabs flex min-h-0 flex-1 flex-col"
    >
      <TabsList>
        <TabsTrigger value="activity">
          <TrendingUp className="size-3" /> Activity
        </TabsTrigger>
        <TabsTrigger value="health">
          <Gauge className="size-3" /> Health
        </TabsTrigger>
        <TabsTrigger value="code">
          <TerminalIcon className="size-3" /> Code
        </TabsTrigger>
        <TabsTrigger value="ai">
          <BrainCircuit className="size-3" /> AI usage
        </TabsTrigger>
      </TabsList>

      <TabsContent value="activity" className="mt-3 flex min-h-0 flex-1 flex-col">
        <ActivityTab data={data} seed={seed} />
      </TabsContent>
      <TabsContent value="health" className="mt-3 flex min-h-0 flex-1 flex-col">
        <HealthTab data={data} />
      </TabsContent>
      <TabsContent value="code" className="mt-3 flex min-h-0 flex-1 flex-col">
        <CodeTab data={data} />
      </TabsContent>
      <TabsContent value="ai" className="mt-3 flex min-h-0 flex-1 flex-col">
        <AiTab data={data} />
      </TabsContent>
    </Tabs>
  );
}

function ActivityTab({ data, seed }: { data: ReportExport; seed: string }) {
  const cadence = aggregateCadence(data, 14);
  const total = cadence.reduce((sum, p) => sum + p.commits, 0);

  if (cadence.length === 0) {
    return <QuietLine>No cadence data in this report.</QuietLine>;
  }
  return (
    <DataCarousel
      ariaLabel="commit cadence"
      autoMs={8000}
      seed={seed}
      className="min-h-0 flex-1"
      cards={[
        {
          label: "graph",
          content: (
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <p className="shrink-0 font-mono text-[0.68rem] text-muted-foreground">
                {total.toLocaleString()} commits across {cadence.length}{" "}
                {cadence.length === 1 ? "month" : "months"}
              </p>
              <div className="min-h-0 w-full flex-1">
                <Chart
                  variant="area"
                  points={cadence.map((p) => ({ label: p.period, value: p.commits }))}
                  maxPoints={14}
                  ariaLabel="Commits per month across the workspace"
                  className="h-full w-full"
                />
              </div>
            </div>
          ),
        },
        {
          label: "table",
          content: (
            <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden rounded-xl border border-border">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">month</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">commits</th>
                    <th className="hidden px-4 py-2.5 text-right font-medium text-muted-foreground sm:table-cell">
                      share
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {[...cadence].reverse().map((point) => (
                    <tr key={point.period} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">{point.period}</td>
                      <td className="px-4 py-3 text-right">{point.commits.toLocaleString()}</td>
                      <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                        {total > 0 ? `${Math.round((point.commits / total) * 100)}%` : "0%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
      ]}
    />
  );
}

function HealthTab({ data }: { data: ReportExport }) {
  const tally = alertTally(data);
  const counts = tally.severityCounts;
  const total = Math.max(tally.total, 1);

  if (tally.total === 0) {
    return <QuietLine>No quality signals flagged in this report.</QuietLine>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        className="b-segbar"
        role="img"
        aria-label={`${counts.critical} critical, ${counts.warning} warning, ${counts.info} info signals`}
      >
        {counts.critical > 0 ? (
          <span style={{ flexGrow: counts.critical, background: SEVERITY_COLOR.critical }} />
        ) : null}
        {counts.warning > 0 ? (
          <span style={{ flexGrow: counts.warning, background: SEVERITY_COLOR.warning }} />
        ) : null}
        {counts.info > 0 ? (
          <span style={{ flexGrow: counts.info, background: SEVERITY_COLOR.info }} />
        ) : null}
      </div>
      <div className="flex items-center gap-4 font-mono text-[0.7rem]">
        <SeverityStat name="critical" value={counts.critical} color={SEVERITY_COLOR.critical} />
        <SeverityStat name="warning" value={counts.warning} color={SEVERITY_COLOR.warning} />
        <SeverityStat name="info" value={counts.info} color={SEVERITY_COLOR.info} />
        <span className="ml-auto text-muted-foreground">{tally.total.toLocaleString()} signals</span>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5 pr-0.5">
        {tally.rows.slice(0, 6).map((row) => (
          <li
            key={`${row.worst}:${row.label}`}
            className="flex items-start gap-2.5 rounded-lg border border-border bg-white/[0.02] px-2.5 py-1.5 text-xs"
            title={row.summary}
          >
            <span
              className="mt-1 size-2 shrink-0 rounded-[3px]"
              style={{ background: SEVERITY_COLOR[row.worst] }}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{row.label}</span>
              <span className="line-clamp-1 block text-[0.66rem] leading-snug text-muted-foreground">
                {row.summary}
              </span>
            </span>
            <span className="b-dirtybar mt-2 w-20 shrink-0 sm:w-32">
              <span
                style={{
                  width: `${Math.max((row.value / total) * 100, 6)}%`,
                  background: SEVERITY_COLOR[row.worst],
                }}
              />
            </span>
            <span className="b-num w-9 shrink-0 text-right text-sm" style={{ color: SEVERITY_COLOR[row.worst] }}>
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeverityStat({ name, value, color }: { name: string; value: number; color: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5" style={{ color }}>
      <span className="b-num text-base">{value}</span>
      <span className="text-muted-foreground">{name}</span>
    </span>
  );
}

function CodeTab({ data }: { data: ReportExport }) {
  const languages = languageRows(data, 8);
  const totalLines = languages.reduce((sum, l) => sum + l.lines, 0);
  const max = Math.max(...languages.map((l) => l.lines), 1);
  const R = 58;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2.5;

  if (languages.length === 0) {
    return <QuietLine>No language statistics in this report.</QuietLine>;
  }

  let offset = 0;
  const segments = languages.map((l, i) => {
    const frac = totalLines === 0 ? 0 : l.lines / totalLines;
    const dash = Math.max(frac * CIRC - GAP, 0.75);
    const seg = { language: l, dash, offset, color: STACK_COLOR(i) };
    offset += frac * CIRC;
    return seg;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-8">
      <div className="relative mx-auto size-[190px] shrink-0 lg:mx-0">
        <svg viewBox="0 0 140 140" className="block size-full" aria-hidden>
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--bento-track-soft)" strokeWidth={16} />
          {segments.map((seg) => (
            <circle
              key={seg.language.language}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              strokeWidth={16}
              style={{ stroke: seg.color }}
              strokeDasharray={`${seg.dash} ${CIRC - seg.dash}`}
              strokeDashoffset={-seg.offset}
              transform="rotate(-90 70 70)"
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="b-num text-lg">{formatCompact(totalLines)}</span>
          <span className="b-label">lines</span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="font-mono text-[0.68rem] text-muted-foreground">
          {languages.length} {languages.length === 1 ? "language" : "languages"} ·{" "}
          {formatCompact(totalLines)} lines
        </p>
        <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-2">
          {languages.map((l, i) => (
            <li
              key={l.language}
              className="flex min-h-10 items-center gap-3 rounded-xl border border-border bg-white/[0.02] px-3 text-xs"
            >
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: STACK_COLOR(i) }} />
              <span className="w-28 shrink-0 truncate font-medium" title={l.language}>
                {l.language}
              </span>
              <span className="b-dirtybar min-w-0 flex-1">
                <span
                  style={{
                    width: `${Math.max((l.lines / max) * 100, 4)}%`,
                    background: STACK_COLOR(i),
                  }}
                />
              </span>
              <span className="b-num w-14 shrink-0 text-right text-sm">{formatCompact(l.lines)}</span>
              <span className="w-16 shrink-0 text-right font-mono text-[0.62rem] text-muted-foreground">
                {l.files} files
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AiTab({ data }: { data: ReportExport }) {
  const usage = data.aiUsage;
  const leaders = aiUsageLeaders(data, 6);

  if (usage === null) {
    return <QuietLine>No AI usage recorded in this report window.</QuietLine>;
  }
  return (
    <div className="grid min-h-0 flex-1 content-center gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* The subsidized AI cost leads the tab — the headline number of the
          whole widget. */}
      <div className="flex min-w-0 flex-col justify-center gap-2">
        <span className="b-label">Subsidized AI cost</span>
        <span
          className="b-num text-[56px]"
          style={{ color: "var(--bento-c4)" }}
          aria-label={`Subsidized AI cost ${usage.cost.toFixed(2)} dollars`}
        >
          ${usage.cost.toFixed(2)}
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {usage.cost === 0
            ? "Fully subsidized — the matched assistant messages carried no recorded spend for this report window."
            : "Recorded spend of the matched assistant messages for this report window."}
        </p>
      </div>
      <dl className="grid grid-cols-2 content-stretch gap-3 self-stretch">
        <AiStat label="requests" value={usage.records.toLocaleString()} />
        <AiStat label="tokens in" value={formatCompact(usage.tokens.input)} />
        <AiStat label="tokens out" value={formatCompact(usage.tokens.output)} />
        <AiStat label="total tokens" value={formatCompact(usage.tokens.total)} />
      </dl>
      {data.kind === "scan" && leaders.length > 0 ? (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5">
          {leaders.map((l) => (
            <li key={l.name} className="flex items-center gap-2.5 text-xs">
              <span className="w-32 shrink-0 truncate sm:w-44" title={l.name}>
                {l.name}
              </span>
              <span className="b-dirtybar min-w-0 flex-1">
                <span
                  style={{
                    width: `${Math.max((l.tokens / leaders[0].tokens) * 100, 5)}%`,
                    background: "var(--bento-ai-bar)",
                  }}
                />
              </span>
              <span className="b-num w-16 shrink-0 text-right text-sm">{formatCompact(l.tokens)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-20 flex-col justify-center gap-1 rounded-xl border border-border bg-white/[0.03] px-4 py-3">
      <dt className="b-label">{label}</dt>
      <dd className="b-num text-2xl">{value}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- states */

function MissingState({
  message,
  command = null,
  onGenerate,
  generating = false,
}: {
  message: string;
  command?: string | null;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy command");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
      <span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-2xl border border-border bg-white/[0.04] text-muted-foreground"
      >
        <TrendingUp className="size-5" />
      </span>
      <p className="max-w-xl text-sm font-semibold tracking-tight">No report yet</p>
      <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{message}</p>
      <div className="flex items-center gap-2">
        {onGenerate ? (
          <Button size="sm" onClick={onGenerate} disabled={generating}>
            {generating ? <Loader2 className="size-3.5 animate-spin" /> : <TrendingUp className="size-3.5" />}
            {generating ? "Generating…" : "Generate report"}
          </Button>
        ) : null}
        {command ? (
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy CLI"}
          </Button>
        ) : null}
      </div>
      {command ? (
        <pre
          className="max-w-full overflow-x-auto rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-left font-mono text-[0.66rem] leading-relaxed text-muted-foreground"
          aria-label="Report CLI command"
        >
          {command}
        </pre>
      ) : null}
    </div>
  );
}

function RunningState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm font-semibold tracking-tight">Generating report…</p>
      <p className="max-w-xl font-mono text-[0.66rem] leading-relaxed text-muted-foreground">
        Running git-snitch — the charts fill in when it lands.
      </p>
    </div>
  );
}

function SkeletonState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" aria-hidden>
      <div className="b-skel h-5 w-64" style={{ borderRadius: 8 }} />
      <div className="b-skel min-h-0 flex-1" style={{ borderRadius: 12 }} />
    </div>
  );
}

function QuietLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ widget --- */

/**
 * Workspace pulse — the full-width tabbed report band: the design's
 * `BentoTile span="sp-pulse"` with the ReportPanel inside; the gate states
 * render inside the panel per the provider's machine.
 */
export function BentoPulse(_props: RegisteredWidgetProps) {
  const report = useReport();

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col p-5">
      {report.status === "no-scope" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          No report scope — track a root to generate the workspace report.
        </div>
      ) : (
        <ReportPanel className="min-h-0 flex-1" />
      )}
    </BentoTile>
  );
}
