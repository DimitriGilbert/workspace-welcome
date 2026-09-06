import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@workspace-welcome/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace-welcome/ui/components/tabs";
import { cn } from "@workspace-welcome/ui/lib/utils";
import {
  isReportStale,
  latestUpdatedAtOf,
} from "@workspace-welcome/api/lib/report-staleness";
import type { ReportExport } from "@workspace-welcome/api/lib/report-export";
import type { ReportPeriod } from "@workspace-welcome/api/routers/reports";

import { DataCarousel } from "@/components/designs/bento/data-carousel";
import { useTRPC } from "@/utils/trpc";
import { relativeTime } from "@/lib/format";
import {
  aggregateCadence,
  aiUsageLeaders,
  tallyAlerts,
  topLanguages,
} from "@/components/designs/bento/bento-metrics";

/**
 * The tabbed snitch-report widget: Activity / Health / Code / AI usage over
 * one ReportExport. Contract per the data's own state:
 *   MISSING   — no export for the key → empty state, "Generate report"
 *               button, and the copyable CLI invocation.
 *   RUNNING   — a generate run is in flight → live progress from the job.
 *   STALE     — the project moved ≥24h past generatedAt → charts render from
 *               the existing export plus a clearly clickable regenerate badge.
 *   FRESH     — charts.
 * The widget is frame-agnostic: callers supply the tile/chrome around it.
 */

export interface ReportPanelProps {
  /** "scan" compares a whole root; "repo" is one project. */
  kind: "scan" | "repo";
  /** Absolute root or project path the report targets. */
  path: string;
  /**
   * The scanned projects under `path` (all for scan, one for repo) — the
   * staleness input: the newest updatedAt among them.
   */
  projects: { updatedAt: string }[];
  /** Optional period preset; absent = all history (default cache slot). */
  period?: ReportPeriod;
  /** Widget heading. */
  title?: string;
  /** Deterministic stagger seed for the activity carousel. */
  seed?: string;
  className?: string;
}

const SEVERITY_COLOR = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
} as const;

export function ReportPanel({
  kind,
  path,
  projects,
  period,
  title = "Workspace pulse",
  seed,
  className,
}: ReportPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("activity");

  const commandQuery = useQuery(
    trpc.reports.command.queryOptions({ kind, path, period }),
  );
  const key = commandQuery.data?.key ?? null;

  const exportQuery = useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: key ?? "" },
      { enabled: key !== null },
    ),
  );

  // A run we started (or joined): poll its job until it settles.
  const [runInFlight, setRunInFlight] = useState(false);
  const jobQuery = useQuery(
    trpc.reports.job.queryOptions(
      { key: key ?? "" },
      {
        enabled: runInFlight && key !== null,
        refetchInterval: (query) =>
          query.state.data?.status === "running" ? 1500 : false,
      },
    ),
  );

  const generate = useMutation(
    trpc.reports.generate.mutationOptions({
      onSuccess: (job) => {
        if (job.status === "running") {
          setRunInFlight(true);
        } else {
          // Cache hit — the export already exists; pick it up.
          void queryClient.invalidateQueries({
            queryKey: trpc.reports.jsonExport.queryKey({ key: job.key }),
          });
        }
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  useEffect(() => {
    const job = jobQuery.data;
    if (!runInFlight || job === undefined || job === null) return;
    if (job.status === "running") return;
    setRunInFlight(false);
    if (job.status === "done") {
      void queryClient.invalidateQueries({
        queryKey: trpc.reports.jsonExport.queryKey({ key: job.key }),
      });
      toast.success("Report ready");
    } else {
      const lines = job.stderrTail.split("\n").filter((l) => l.trim() !== "");
      toast.error(lines[lines.length - 1] ?? "Report failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQuery.data, runInFlight]);

  const data = exportQuery.data ?? null;
  const stale =
    data !== null &&
    isReportStale(data.generatedAt, latestUpdatedAtOf(projects.map((p) => p.updatedAt)));

  const generating =
    generate.isPending ||
    (runInFlight && (jobQuery.isLoading || jobQuery.data?.status === "running"));

  const copyCommand = async () => {
    const command = commandQuery.data?.command;
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
              {data.totals.commits.toLocaleString()} commits ·{" "}
              {data.totals.contributors} contrib.
              {data.totals.languages.length > 0
                ? ` · ${data.totals.languages.length} languages`
                : ""}
              {data.aiUsage ? ` · AI $${data.aiUsage.cost.toFixed(2)}` : ""}
            </span>
            {stale ? (
              <button
                type="button"
                onClick={() => generate.mutate({ kind, path, force: true, period })}
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
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: "var(--state-positive)" }}
                />
                fresh
              </span>
            )}
          </>
        ) : (
          <span className="font-mono text-[0.68rem] text-muted-foreground">
            git-snitch · {kind === "scan" ? "comparative root report" : "single repo report"}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1.5">
          {data !== null && !stale ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => generate.mutate({ kind, path, force: true, period })}
              disabled={generating}
            >
              <RefreshCw className={cn("size-3", generating && "animate-spin")} /> Regenerate
            </Button>
          ) : null}
          {commandQuery.data?.command ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={copyCommand}
              title="Copy the git-snitch CLI invocation"
            >
              <TerminalIcon className="size-3" /> CLI
            </Button>
          ) : null}
        </span>
      </div>

      <div className="mt-3 flex min-h-0 flex-1">
        {commandQuery.isPending || (key !== null && exportQuery.isPending) ? (
          <SkeletonState />
        ) : commandQuery.isError ? (
          <MissingState
            message={`Couldn't resolve a report target: ${commandQuery.error.message}`}
          />
        ) : generating ? (
          <RunningState job={jobQuery.data ?? null} />
        ) : data === null ? (
          <MissingState
            message={
              commandQuery.data?.command === null
                ? (commandQuery.data?.error ??
                  "The git-snitch CLI is not resolvable on this host.")
                : "No cached report for this target yet. Generate one — the charts read the structured JSON the run saves alongside the HTML."
            }
            command={commandQuery.data?.command ?? null}
            source={commandQuery.data?.source ?? null}
            onGenerate={() => generate.mutate({ kind, path, force: true, period })}
            generating={generate.isPending}
          />
        ) : (
          <ReportTabs data={data} tab={tab} onTabChange={setTab} seed={seed ?? data.key} />
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
    <Tabs value={tab} onValueChange={(v) => onTabChange(v ?? "activity")} className="b-tabs flex min-h-0 flex-1 flex-col">
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
  const cadence = aggregateCadence(data);
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
              <p className="font-mono text-[0.68rem] text-muted-foreground">
                {total.toLocaleString()} commits across {cadence.length} months
              </p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cadence} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bento-cadence-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          style={{ stopColor: "var(--bento-c1)", stopOpacity: 0.45 }}
                        />
                        <stop
                          offset="100%"
                          style={{ stopColor: "var(--bento-c1)", stopOpacity: 0 }}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                    <XAxis
                      dataKey="period"
                      tickFormatter={(v: string) => v.slice(2)}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      tickMargin={6}
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={38} />
                    <Tooltip
                      content={(props) => (
                        <CadenceTooltip
                          active={props.active}
                          payload={props.payload}
                        />
                      )}
                      cursor={{ stroke: "oklch(1 0 0 / 0.14)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="commits"
                      name="Commits"
                      strokeWidth={2}
                      style={{ stroke: "var(--bento-c1)" }}
                      fill="url(#bento-cadence-fill)"
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ),
        },
        {
          label: "table",
          content: (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 font-medium text-muted-foreground">month</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">commits</th>
                    <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">share</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {[...cadence].reverse().map((point) => (
                    <tr key={point.period} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-1.5">{point.period}</td>
                      <td className="px-3 py-1.5 text-right">{point.commits.toLocaleString()}</td>
                      <td className="hidden px-3 py-1.5 text-right text-muted-foreground sm:table-cell">
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

interface CadenceTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: { period?: string; commits?: number } }[];
}

function CadenceTooltip({ active, payload }: CadenceTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <ValueTooltip label={point?.period} value={point?.commits ?? 0} unit="commits" />
  );
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: readonly { name?: unknown; value?: unknown }[];
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload?.length) return null;
  const slice = payload[0];
  const name = typeof slice?.name === "string" ? slice.name : "";
  const value = typeof slice?.value === "number" ? slice.value : 0;
  return <ValueTooltip label={name} value={value} unit="lines" />;
}

function ValueTooltip({
  label,
  value,
  unit,
}: {
  label: string | undefined;
  value: number;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-xl">
      <p className="font-mono text-[0.68rem] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">
        {value.toLocaleString()} {unit}
      </p>
    </div>
  );
}

function HealthTab({ data }: { data: ReportExport }) {
  const tally = tallyAlerts(data);
  const total = Math.max(tally.total, 1);
  // First-seen summary per label — the snitch prose explains each signal.
  const summaries = new Map<string, string>();
  for (const alert of data.totals.alerts) {
    const key = `${alert.severity}:${alert.label}`;
    if (!summaries.has(key)) summaries.set(key, alert.summary);
  }

  if (tally.total === 0) {
    return <QuietLine>No quality signals flagged in this report.</QuietLine>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="b-segbar" role="img"
        aria-label={`${tally.critical} critical, ${tally.warning} warning, ${tally.info} info signals`}
      >
        {tally.critical > 0 ? <span style={{ flexGrow: tally.critical, background: SEVERITY_COLOR.critical }} /> : null}
        {tally.warning > 0 ? <span style={{ flexGrow: tally.warning, background: SEVERITY_COLOR.warning }} /> : null}
        {tally.info > 0 ? <span style={{ flexGrow: tally.info, background: SEVERITY_COLOR.info }} /> : null}
      </div>
      <div className="flex items-center gap-4 font-mono text-[0.7rem]">
        <SeverityStat name="critical" value={tally.critical} color={SEVERITY_COLOR.critical} />
        <SeverityStat name="warning" value={tally.warning} color={SEVERITY_COLOR.warning} />
        <SeverityStat name="info" value={tally.info} color={SEVERITY_COLOR.info} />
        <span className="ml-auto text-muted-foreground">
          {tally.total.toLocaleString()} signals
        </span>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5 overflow-y-auto pr-0.5">
        {tally.top.map((row) => (
          <li
            key={`${row.severity}:${row.label}`}
            className="flex items-start gap-2.5 rounded-lg border border-border bg-white/[0.02] px-2.5 py-1.5 text-xs"
            title={summaries.get(`${row.severity}:${row.label}`) ?? row.label}
          >
            <span
              className="mt-1 size-2 shrink-0 rounded-[3px]"
              style={{ background: SEVERITY_COLOR[row.severity] }}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{row.label}</span>
              <span className="line-clamp-1 block text-[0.66rem] leading-snug text-muted-foreground">
                {summaries.get(`${row.severity}:${row.label}`) ?? "Recurring quality signal"}
              </span>
            </span>
            <span className="b-dirtybar mt-2 w-20 shrink-0 sm:w-32">
              <span
                style={{
                  width: `${Math.max((row.value / total) * 100, 6)}%`,
                  background: SEVERITY_COLOR[row.severity],
                }}
              />
            </span>
            <span className="b-num w-9 shrink-0 text-right text-sm" style={{ color: SEVERITY_COLOR[row.severity] }}>
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
  const languages = topLanguages(data);
  const totalLines = languages.reduce((sum, l) => sum + l.lines, 0);
  const max = Math.max(...languages.map((l) => l.lines), 1);

  if (languages.length === 0) {
    return <QuietLine>No language statistics in this report.</QuietLine>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-8">
      <div className="relative mx-auto size-[190px] shrink-0 lg:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={languages.map((l) => ({ name: l.language, value: l.lines }))}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={72}
              paddingAngle={2}
              strokeWidth={0}
            >
              {languages.map((l, i) => (
                <Cell key={l.language} fill={STACK_COLOR(i)} />
              ))}
            </Pie>
            <Tooltip
              content={(props) => (
                <DonutTooltip active={props.active} payload={props.payload} />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
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
        <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-2 overflow-y-auto">
          {languages.map((l, i) => (
            <li
              key={l.language}
              className="flex min-h-10 items-center gap-3 rounded-xl border border-border bg-white/[0.02] px-3 text-xs"
            >
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: STACK_COLOR(i) }}
              />
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
              <span className="b-num w-14 shrink-0 text-right text-sm">
                {formatCompact(l.lines)}
              </span>
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

function AiTab({ data }: { data: ReportExport }) {
  const usage = data.aiUsage;
  const leaders = aiUsageLeaders(data);

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
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {leaders.map((l) => (
            <li key={l.name} className="flex items-center gap-2.5 text-xs">
              <span className="w-32 shrink-0 truncate sm:w-44" title={l.name}>
                {l.name}
              </span>
              <span className="b-dirtybar min-w-0 flex-1">
                <span
                  style={{
                    width: `${Math.max((l.tokens / leaders[0].tokens) * 100, 5)}%`,
                    background: "linear-gradient(90deg, oklch(0.82 0.12 90 / 0.7), var(--bento-c4))",
                  }}
                />
              </span>
              <span className="b-num w-16 shrink-0 text-right text-sm">
                {formatCompact(l.tokens)}
              </span>
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
  source = null,
  onGenerate,
  generating = false,
}: {
  message: string;
  command?: string | null;
  source?: string | null;
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
      {source ? (
        <p className="font-mono text-[0.62rem] text-muted-foreground/70">
          cli source: {source}
        </p>
      ) : null}
    </div>
  );
}

function RunningState({ job }: { job: { stderrTail: string } | null }) {
  const lastLine =
    job?.stderrTail.split("\n").filter((l) => l.trim()).at(-1) ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm font-semibold tracking-tight">Generating report…</p>
      <p className="max-w-xl font-mono text-[0.66rem] leading-relaxed text-muted-foreground">
        {lastLine ?? "Running git-snitch — the charts fill in when it lands."}
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

/** "12.4k / 3.1M" — compact magnitude for token and line counts. */
function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}
