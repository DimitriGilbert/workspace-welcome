import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@workspace-welcome/ui/lib/utils";
import { isReportStale } from "@workspace-welcome/api/lib/report-staleness";
import type { ReportExport } from "@workspace-welcome/api/lib/report-export";
import type { CommitLogEntry } from "@workspace-welcome/api/lib/types";

import { useTRPC } from "@/utils/trpc";
import { relativeTime } from "@/lib/format";

import {
  createMcColumnHelper,
  McTable,
} from "./mc-table";
import { DonutChart } from "./analytics-zone";

type ReportTabId = "graph" | "table";

const SEV_FILL: Record<string, string> = {
  info: "var(--sev-info)",
  warning: "var(--sev-warn)",
  critical: "var(--sev-error)",
};

const SEV_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

// ---------------------------------------------------------------------------
// Shared data hook: one snitch report address (kind + path) → key, command,
// export, staleness, generation. Every report widget composes from here, so
// the JSON fetch is cached and deduped by react-query — a project page and
// the widgets on it share one request, and nothing fan-outs.
// ---------------------------------------------------------------------------

/**
 * The one snitch-report react-query chain (command → key → jsonExport, plus
 * generate + job polling). Exported so tabbed pages can run it ONCE at page
 * level and feed the widgets by prop — react-query dedupes the keys, so a
 * page-level call and any widget-level call share one request.
 */
export function useReportExport(kind: "repo" | "scan", path: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const commandQ = useQuery(
    trpc.reports.command.queryOptions({ kind, path }, { enabled: path.length > 0 }),
  );
  const key = commandQ.data?.key ?? null;

  const exportQ = useQuery(
    trpc.reports.jsonExport.queryOptions(
      { key: key ?? "" },
      { enabled: key !== null },
    ),
  );

  const [runKey, setRunKey] = useState<string | null>(null);
  const generate = useMutation(
    trpc.reports.generate.mutationOptions({
      onSuccess: (job) => {
        if (job.status === "running") {
          setRunKey(job.key);
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: trpc.reports.jsonExport.queryKey({ key: job.key }),
        });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const jobQ = useQuery(
    trpc.reports.job.queryOptions(
      { key: runKey ?? "" },
      {
        enabled: runKey !== null,
        refetchInterval: (query) =>
          query.state.data?.status === "running" ? 1500 : false,
      },
    ),
  );
  useEffect(() => {
    const job = jobQ.data;
    if (runKey === null) return;
    // A null job means the in-memory registry is gone (server restart) —
    // settle rather than spin forever.
    if (job === null || job === undefined) {
      setRunKey(null);
      return;
    }
    if (job.status === "running") return;
    setRunKey(null);
    if (job.status === "failed") {
      toast.error(
        `Report run failed: ${job.stderrTail.split("\n").at(-1)?.slice(0, 140) || "see server logs"}`,
      );
    }
    void queryClient.invalidateQueries({
      queryKey: trpc.reports.jsonExport.queryKey({ key: runKey }),
    });
  }, [jobQ.data, runKey, queryClient, trpc]);

  const data = exportQ.data ?? null;
  const stale = isReportStale(data?.generatedAt ?? null, null);

  return {
    key,
    command: commandQ.data?.command ?? null,
    commandError: commandQ.data?.error ?? null,
    data,
    stale,
    generating: runKey !== null || generate.isPending,
    generate: (force: boolean) => generate.mutate({ kind, path, force }),
  };
}

/** Staleness against a known project timestamp (the repo-report case). */
function useStaleAgainst(generatedAt: string | null, latestUpdatedAt: string | null) {
  return useMemo(
    () => isReportStale(generatedAt, latestUpdatedAt),
    [generatedAt, latestUpdatedAt],
  );
}

/** Copy-to-clipboard button with a brief check confirmation. */
function CopyButton({ text, label = "cli" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Couldn't copy");
        }
      }}
      className="inline-flex h-7 items-center gap-1.5 border border-[var(--mc-line)] px-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      {copied ? (
        <Check aria-hidden className="size-3 text-[var(--mc-accent)]" />
      ) : (
        <Copy aria-hidden className="size-3" />
      )}
      {copied ? "copied" : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Widget shells
// ---------------------------------------------------------------------------

/** Rendered by pages that compose their own tab layouts. */
export { ReportWidgetShell };

function ReportWidgetShell({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mc-panel flex flex-col", className)}>
      <header className="flex items-center gap-2 border-b border-[var(--mc-line-strong)] px-3.5 py-2">
        <h2 className="mc-label">{title}</h2>
        {meta ? (
          <span className="ml-auto flex items-center gap-2 font-mono text-[9.5px] tabular-nums text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-3.5 py-3">{children}</div>
    </section>
  );
}

function McTabs<TabId extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: { id: TabId; label: string }[];
  active: TabId;
  onChange: (id: TabId) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="mc-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className="mc-tab"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staleness / generation header, shared by the zone
// ---------------------------------------------------------------------------

/** Rendered by pages that run `useReportExport` themselves. */
export { ReportStatusLine };

function ReportStatusLine({
  generatedAt,
  stale,
  generating,
  onGenerate,
  reportKey,
}: {
  generatedAt: string | null;
  stale: boolean;
  generating: boolean;
  onGenerate: () => void;
  reportKey: string | null;
}) {
  return (
    <span className="flex items-center gap-2">
      {generating ? (
        <span className="flex items-center gap-1.5 text-[var(--mc-accent)]">
          <Loader2 aria-hidden className="size-3 animate-spin" /> generating…
        </span>
      ) : stale && generatedAt !== null ? (
        <button
          type="button"
          onClick={onGenerate}
          className="flex items-center gap-1.5 border border-[color-mix(in_oklch,var(--sev-warn)_45%,transparent)] px-1.5 py-0.5 text-[var(--sev-warn)] outline-none transition-colors hover:bg-[color-mix(in_oklch,var(--sev-warn)_12%,transparent)] focus-visible:ring-1 focus-visible:ring-ring"
          title={`Data is stale — click to regenerate.`}
        >
          <span aria-hidden className="mc-stale-dot size-1.5 bg-[var(--sev-warn)]" />
          stale · regenerate
        </button>
      ) : generatedAt !== null ? (
        <span title={`Generated ${relativeTime(generatedAt)}`}>
          {relativeTime(generatedAt)}
        </span>
      ) : null}
      {reportKey !== null ? (
        <a
          href={`/reports/${reportKey}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-0.5 uppercase transition-colors hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring"
        >
          html <ExternalLink aria-hidden className="size-2.5" />
        </a>
      ) : null}
    </span>
  );
}

export { ReportMissing };

/** MISSING state: dashed block, generate button, the exact CLI command. */
function ReportMissing({
  kind,
  command,
  commandError,
  generating,
  onGenerate,
}: {
  kind: "repo" | "scan";
  command: string | null;
  commandError: string | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="m-3.5 mt-3 flex flex-col gap-3 border border-dashed border-[var(--mc-line-strong)] px-4 py-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        No report on record
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {kind === "scan"
          ? "A comparative git report for every project under this root — cadence, health, code mix, AI spend."
          : "A git report for this project — cadence, health, code mix, contributors, AI spend."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={generating || command === null}
          onClick={onGenerate}
          className="inline-flex h-8 items-center gap-1.5 border border-[var(--mc-line-strong)] bg-[color-mix(in_oklch,var(--mc-accent)_14%,transparent)] px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground outline-none transition-colors hover:border-[color-mix(in_oklch,var(--mc-accent)_50%,var(--mc-line-strong))] hover:text-[var(--mc-accent)] focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {generating ? <Loader2 aria-hidden className="size-3 animate-spin" /> : null}
          {generating ? "Generating…" : "Generate report"}
        </button>
        {command !== null ? <CopyButton text={command} /> : null}
        {commandError ? (
          <span className="font-mono text-[10px] text-[var(--sev-error)]">
            {commandError}
          </span>
        ) : null}
      </div>
      {command !== null ? (
        <pre className="overflow-x-auto border border-[var(--mc-line)] bg-[color-mix(in_oklch,var(--foreground)_3%,transparent)] p-2 font-mono text-[9.5px] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
          {command}
        </pre>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ACTIVITY — snitch-style cadence time graph + a real table view
// ---------------------------------------------------------------------------

/** Cadence series, oldest → newest, capped at the trailing 12 buckets. */
function flattenCadence(data: ReportExport): { period: string; commits: number }[] {
  const merged = new Map<string, number>();
  for (const project of data.projects) {
    for (const point of project.cadence) {
      merged.set(point.period, (merged.get(point.period) ?? 0) + point.commits);
    }
  }
  return [...merged.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, commits]) => ({ period, commits }))
    .slice(-12);
}

// --- units table (scan reports) -------------------------------------------

interface UnitRow {
  path: string;
  name: string;
  branch: string;
  commits: number;
  contributors: number;
  alerts: number;
}

const unitHelper = createMcColumnHelper<UnitRow>();

const unitColumns = unitHelper.columns([
  unitHelper.accessor((r) => r.name, {
    id: "unit",
    sortFn: "alphanumeric",
    size: 150,
    header: "Unit",
    cell: (ctx) => (
      <span className="block truncate text-[11.5px] text-foreground group-hover:text-[var(--mc-accent)]">
        {ctx.getValue()}
      </span>
    ),
  }),
  unitHelper.accessor((r) => r.branch, {
    id: "branch",
    sortFn: "alphanumeric",
    size: 80,
    header: "Branch",
    cell: (ctx) => (
      <span className="block truncate font-mono text-[10px] text-muted-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
  unitHelper.accessor((r) => r.commits, {
    id: "commits",
    sortFn: "alphanumeric",
    size: 56,
    header: "Cmt",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[10.5px] tabular-nums text-muted-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
  unitHelper.accessor((r) => r.contributors, {
    id: "contrib",
    sortFn: "alphanumeric",
    size: 48,
    header: "Ppl",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[10.5px] tabular-nums text-muted-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
  unitHelper.accessor((r) => r.alerts, {
    id: "alerts",
    sortFn: "alphanumeric",
    size: 44,
    header: "Alr",
    cell: (ctx) => {
      const v = ctx.getValue();
      return (
        <span
          className={cn(
            "block text-right font-mono text-[10.5px] tabular-nums",
            v > 0 ? "text-[var(--sev-warn)]" : "text-muted-foreground/30",
          )}
        >
          {v > 0 ? v : "·"}
        </span>
      );
    },
  }),
]);

function UnitsTable({
  data,
  onOpenProject,
}: {
  data: ReportExport;
  onOpenProject?: (path: string) => void;
}) {
  const rows = useMemo<UnitRow[]>(
    () =>
      data.projects.map((p) => ({
        path: p.path,
        name: p.name,
        branch: p.branch ?? "",
        commits: p.totalCommits,
        contributors: p.contributors,
        alerts: p.alerts.length,
      })),
    [data],
  );
  return (
    <McTable
      columns={unitColumns}
      data={rows}
      ariaLabel="Projects in the report: name, branch, commits, contributors, alerts"
      initialSort={[{ id: "commits", desc: true }]}
      onRowClick={onOpenProject ? (row) => onOpenProject(row.path) : undefined}
      minWidth={380}
      empty={<span className="mc-label">no units in export</span>}
    />
  );
}

// --- commits table (repo reports — live git log, richer than the export) ---

interface CommitRow {
  hash: string;
  subject: string;
  author: string;
  timestamp: number;
}

const commitHelper = createMcColumnHelper<CommitRow>();

const commitColumns = commitHelper.columns([
  commitHelper.accessor((r) => r.timestamp, {
    id: "date",
    sortFn: "alphanumeric",
    size: 76,
    header: "When",
    cell: (ctx) => (
      <span className="block whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground">
        {relativeTime(new Date(ctx.getValue() * 1000).toISOString())}
      </span>
    ),
  }),
  commitHelper.accessor((r) => r.author, {
    id: "author",
    sortFn: "alphanumeric",
    size: 80,
    header: "Author",
    cell: (ctx) => (
      <span className="block truncate font-mono text-[10px] text-muted-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
  commitHelper.accessor((r) => r.subject, {
    id: "subject",
    sortFn: "alphanumeric",
    size: 190,
    header: "Commit",
    cell: (ctx) => (
      <span className="block truncate text-[11px] text-foreground" title={ctx.getValue()}>
        {ctx.getValue()}
      </span>
    ),
  }),
  commitHelper.accessor((r) => r.hash, {
    id: "hash",
    enableSorting: false,
    size: 54,
    header: "Sha",
    cell: (ctx) => (
      <span className="block font-mono text-[10px] text-[var(--mc-accent)]">
        {ctx.getValue().slice(0, 7)}
      </span>
    ),
  }),
]);

export { CommitsTable };

function CommitsTable({ commits }: { commits: CommitLogEntry[] }) {
  const rows = useMemo<CommitRow[]>(
    () =>
      commits.map((c) => ({
        hash: c.hash,
        subject: c.subject,
        author: c.author,
        timestamp: c.timestamp,
      })),
    [commits],
  );
  return (
    <McTable
      columns={commitColumns}
      data={rows}
      ariaLabel="Commit history: date, author, message, short hash"
      initialSort={[{ id: "date", desc: true }]}
      minWidth={400}
      empty={<span className="mc-label">no commits</span>}
    />
  );
}

/**
 * ACTIVITY widget: the snitch-style cadence time graph with a TABLE view
 * toggle. Table = per-unit ledger (scan reports) or the live commit list
 * (repo reports, fed from projects.commitLog — richer than the export's
 * single lastCommit).
 */
export function ReportActivityWidget({
  data,
  mode,
  commits,
  commitsPending,
  onOpenProject,
  className,
}: {
  data: ReportExport;
  mode: "scan" | "repo";
  /** Live commit log for repo mode (projects.commitLog). */
  commits?: CommitLogEntry[];
  commitsPending?: boolean;
  onOpenProject?: (path: string) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<ReportTabId>("graph");
  const cadence = useMemo(() => flattenCadence(data), [data]);
  const total = cadence.reduce((sum, p) => sum + p.commits, 0);

  return (
    <ReportWidgetShell
      title="Activity"
      className={className}
      meta={
        <span>
          {total} commits · {data.totals.contributors} contributors
        </span>
      }
    >
      <McTabs
        tabs={[
          { id: "graph", label: "Graph" },
          { id: "table", label: "Table" },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Activity view"
      />
      <div className="pt-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            role="tabpanel"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            {tab === "graph" ? (
              cadence.length === 0 ? (
                <p className="py-2 font-mono text-[11px] text-muted-foreground">
                  No cadence data in this window.
                </p>
              ) : (
                <div className="h-64 min-h-64 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cadence} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
                      <defs>
                        <linearGradient id="mc-report-cadence" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" style={{ stopColor: "var(--mc-accent)", stopOpacity: 0.4 }} />
                          <stop offset="100%" style={{ stopColor: "var(--mc-accent)", stopOpacity: 0 }} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="period"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={24}
                        tick={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        tick={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="commits"
                        strokeWidth={1.5}
                        style={{ stroke: "var(--mc-accent)" }}
                        fill="url(#mc-report-cadence)"
                        isAnimationActive
                        animationDuration={400}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : mode === "scan" ? (
              <UnitsTable data={data} onOpenProject={onOpenProject} />
            ) : commitsPending ? (
              <p className="py-2 font-mono text-[11px] text-muted-foreground">loading commits…</p>
            ) : (
              <CommitsTable commits={commits ?? []} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </ReportWidgetShell>
  );
}

// ---------------------------------------------------------------------------
// AI USAGE — subsidized cost stays the hero numeral on every tab
// ---------------------------------------------------------------------------

export function ReportAiWidget({
  data,
  className,
}: {
  data: ReportExport;
  className?: string;
}) {
  const ai = data.aiUsage;

  return (
    <ReportWidgetShell
      title="AI usage"
      className={className}
      meta={ai !== null ? <span>{relativeTime(data.generatedAt)}</span> : null}
    >
      {ai === null ? (
        <div className="flex flex-col gap-2 py-1">
          <p className="font-mono text-[11px] text-muted-foreground">
            No AI usage recorded in this window.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="commits" value={data.totals.commits.toLocaleString()} />
            <MiniStat label="contributors" value={String(data.totals.contributors)} />
            <MiniStat label="repos" value={String(data.totals.repositories)} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-4">
          {/* Stat cluster — everything visible at once, no tabbed dead halves.
              The subsidized cost is the headline numeral. */}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex items-baseline gap-2.5">
              <span
                className="font-mono text-[40px] leading-none font-medium tracking-tight tabular-nums text-[var(--mc-accent)]"
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
          <div className="flex flex-col gap-1.5 border-t border-[var(--mc-line)] pt-3">
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
      )}
    </ReportWidgetShell>
  );
}

/** Compact 12.4k / 1.2M numeral for chart centers and legends. */
function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export { MiniStat };

function MiniStat({ label, value }: { label: string; value: string }) {
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

// ---------------------------------------------------------------------------
// HEALTH — report quality signals as a sortable table
// ---------------------------------------------------------------------------

interface LanguageRow {
  language: string;
  files: number;
  lines: number;
}

const languageHelper = createMcColumnHelper<LanguageRow>();

const languageColumns = languageHelper.columns([
  languageHelper.accessor((r) => r.language, {
    id: "language",
    sortFn: "alphanumeric",
    size: 130,
    header: "Language",
    cell: (ctx) => (
      <span className="block truncate font-mono text-[10.5px] text-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
  languageHelper.accessor((r) => r.files, {
    id: "files",
    sortFn: "alphanumeric",
    size: 60,
    header: "Files",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[10.5px] tabular-nums text-muted-foreground">
        {ctx.getValue().toLocaleString()}
      </span>
    ),
  }),
  languageHelper.accessor((r) => r.lines, {
    id: "lines",
    sortFn: "alphanumeric",
    size: 70,
    header: "Lines",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[10.5px] tabular-nums text-foreground">
        {ctx.getValue().toLocaleString()}
      </span>
    ),
  }),
]);

interface AlertRow {
  id: string;
  label: string;
  severity: string;
  value: number;
  summary: string;
}

const alertHelper = createMcColumnHelper<AlertRow>();

const alertColumns = alertHelper.columns([
  alertHelper.accessor((r) => SEV_RANK[r.severity] ?? 3, {
    id: "severity",
    sortFn: "alphanumeric",
    size: 44,
    header: "Sev",
    cell: (ctx) => {
      const row = ctx.row.original;
      return (
        <span className="flex items-center gap-1.5" title={row.severity}>
          <span
            aria-hidden
            className="size-1.5"
            style={{ background: SEV_FILL[row.severity] ?? "var(--sev-info)" }}
          />
          <span className="font-mono text-[9px] uppercase text-muted-foreground">
            {row.severity.slice(0, 4)}
          </span>
        </span>
      );
    },
  }),
  alertHelper.accessor((r) => r.label, {
    id: "signal",
    sortFn: "alphanumeric",
    size: 110,
    header: "Signal",
    cell: (ctx) => (
      <span className="block truncate font-mono text-[10.5px] text-foreground" title={ctx.row.original.summary}>
        {ctx.getValue()}
      </span>
    ),
  }),
  alertHelper.accessor((r) => r.value, {
    id: "value",
    sortFn: "alphanumeric",
    size: 48,
    header: "Value",
    cell: (ctx) => (
      <span className="block text-right font-mono text-[11px] tabular-nums text-foreground">
        {ctx.getValue()}
      </span>
    ),
  }),
]);

const HEALTH_MAX_ROWS = 12;

export function ReportHealthWidget({
  data,
  className,
}: {
  data: ReportExport;
  className?: string;
}) {
  const rows = useMemo<AlertRow[]>(
    () =>
      data.totals.alerts.map((a) => ({
        id: a.id,
        label: a.label,
        severity: a.severity,
        value: a.value,
        summary: a.summary,
      })),
    [data],
  );
  // Comparative reports repeat the same signal per project; show the worst
  // slice and say how many more rows exist.
  const shown = useMemo(
    () =>
      [...rows]
        .sort(
          (a, b) =>
            (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3) ||
            b.value - a.value,
        )
        .slice(0, HEALTH_MAX_ROWS),
    [rows],
  );
  const overflow = rows.length - shown.length;

  return (
    <ReportWidgetShell
      title="Health"
      className={className}
      meta={
        <span>
          {rows.length} signals
          {overflow > 0 ? ` · top ${shown.length}` : ""}
        </span>
      }
    >
      {rows.length === 0 ? (
        <div className="flex items-center gap-2 py-1">
          <span aria-hidden className="size-1.5 bg-[var(--state-positive)]" />
          <p className="font-mono text-[11px] text-muted-foreground">
            0 signals — health clean
          </p>
        </div>
      ) : (
        <>
          <McTable
            columns={alertColumns}
            data={shown}
            ariaLabel="Report health signals: severity, label, value, worst first"
            initialSort={[{ id: "severity", desc: false }]}
            minWidth={260}
          />
          {overflow > 0 ? (
            <p className="pt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              +{overflow} more signals in the export
            </p>
          ) : null}
        </>
      )}
    </ReportWidgetShell>
  );
}

// ---------------------------------------------------------------------------
// CODE — languages bars + totals numerals
// ---------------------------------------------------------------------------

export function ReportCodeWidget({
  data,
  commits,
  className,
}: {
  data: ReportExport;
  /** Live commit log — powers the per-author breakdown that fills the
   *  widget's second column on the project page. */
  commits?: CommitLogEntry[];
  className?: string;
}) {
  const languages = useMemo(
    () => [...data.totals.languages].sort((a, b) => b.lines - a.lines).slice(0, 6),
    [data],
  );
  const totalLines = data.totals.languages.reduce((s, l) => s + l.lines, 0);
  const totalFiles = data.totals.languages.reduce((s, l) => s + l.files, 0);
  // Distribution reads as a donut (the console's instrument for shares) —
  // bars stay reserved for true comparisons like the contributor counts.
  const languageSlices = useMemo(
    () =>
      languages.map((l, i) => ({
        key: l.language,
        value: l.lines,
        fill: `var(--chart-${(i % 6) + 1})`,
      })),
    [languages],
  );

  const contributors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of commits ?? []) {
      counts.set(c.author, (counts.get(c.author) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [commits]);
  const maxAuthor = Math.max(...contributors.map((c) => c.count), 1);

  return (
    <ReportWidgetShell
      title="Code"
      className={className}
      meta={
        <span>
          {totalFiles.toLocaleString()} files · {totalLines.toLocaleString()} lines
        </span>
      }
    >
      <div className="grid min-h-0 flex-1 gap-5 min-[900px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex gap-5">
            <MiniStat label="commits" value={data.totals.commits.toLocaleString()} />
            <MiniStat label="repos" value={String(data.totals.repositories)} />
          </div>
          {languages.length === 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">No language data.</p>
          ) : (
            <div className="flex min-h-44 flex-1 items-center gap-4">
              <DonutChart
                slices={languageSlices}
                center={compactCount(totalLines)}
                size="h-full min-h-32 flex-1"
              />
              <ul className="min-w-0 shrink-0">
                {languages.map((l, i) => (
                  <li key={l.language} className="flex items-baseline gap-2 py-[3px]">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 self-center"
                      style={{ background: `var(--chart-${(i % 6) + 1})` }}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                      {l.language}
                    </span>
                    <span className="font-mono text-[10.5px] tabular-nums text-foreground">
                      {compactCount(l.lines)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex gap-5">
            <MiniStat label="contributors" value={String(data.totals.contributors)} />
            <MiniStat
              label="log window"
              value={contributors.length > 0 ? `${(commits ?? []).length} commits` : "—"}
            />
          </div>
          {contributors.length === 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              No commit log available.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 pt-1">
              {contributors.map((c) => (
                <div key={c.author} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate font-mono text-[10px] text-muted-foreground" title={c.author}>
                    {c.author}
                  </span>
                  <span
                    aria-hidden
                    className="h-1.5 flex-1 max-w-40"
                    style={{
                      width: `${Math.max(4, (c.count / maxAuthor) * 100)}%`,
                      background: "var(--chart-3)",
                      opacity: 0.8,
                    }}
                  />
                  <span className="font-mono text-[10.5px] tabular-nums text-foreground">
                    {c.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {languages.length > 0 ? (
        <div className="border-t border-[var(--mc-line)] pt-2">
          <McTable
            columns={languageColumns}
            data={data.totals.languages}
            ariaLabel="Languages by files and lines"
            initialSort={[{ id: "lines", desc: true }]}
            minWidth={300}
          />
        </div>
      ) : null}
    </ReportWidgetShell>
  );
}

// ---------------------------------------------------------------------------
// THE ZONE — status line + widget stack for one report address
// ---------------------------------------------------------------------------

/**
 * The report console for one address (a root on the dashboard, a repo on the
 * project page): staleness/generation status, then the split widgets —
 * Activity (graph|table), AI usage (cost hero), Health (sortable signals),
 * Code (languages). The export arrives through one cached react-query chain;
 * commit data for repo mode rides the caller's commitLog query.
 */
export function ReportZone({
  kind,
  path,
  latestUpdatedAt,
  columns = 1,
  onOpenProject,
  commits,
  commitsPending,
  className,
}: {
  kind: "repo" | "scan";
  path: string;
  /** Freshest project updatedAt this report describes (staleness input). */
  latestUpdatedAt: string | null;
  /** Widget columns: 1 for the dashboard's narrow side panel, 2 for the
   *  project page's full-width mining grid. */
  columns?: 1 | 2;
  onOpenProject?: (path: string) => void;
  commits?: CommitLogEntry[];
  commitsPending?: boolean;
  className?: string;
}) {
  const report = useReportExport(kind, path);
  // Hooks stay unconditional; staleness only means anything once an export
  // with a generatedAt exists.
  const staleAgainstLatest = useStaleAgainst(
    report.data?.generatedAt ?? null,
    latestUpdatedAt,
  );
  const stale = report.data !== null ? staleAgainstLatest : false;

  if (path.length === 0) return null;

  if (report.data === null) {
    return (
      <section className={cn("mc-panel", className)}>
        <header className="flex items-center gap-2 border-b border-[var(--mc-line-strong)] px-3.5 py-2">
          <h2 className="mc-label">{kind === "scan" ? "Root report" : "Repo report"}</h2>
          <span className="ml-auto flex items-center gap-2 font-mono text-[9.5px] text-muted-foreground">
            <ReportStatusLine
              generatedAt={null}
              stale={false}
              generating={report.generating}
              onGenerate={() => report.generate(false)}
              reportKey={report.key}
            />
          </span>
        </header>
        <ReportMissing
          kind={kind}
          command={report.command}
          commandError={report.commandError}
          generating={report.generating}
          onGenerate={() => report.generate(false)}
        />
      </section>
    );
  }

  const status = (
    <ReportStatusLine
      generatedAt={report.data.generatedAt}
      stale={stale}
      generating={report.generating}
      onGenerate={() => report.generate(true)}
      reportKey={report.key}
    />
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between px-1">
        <span className="mc-label">{kind === "scan" ? "Root report" : "Repo report"}</span>
        {status}
      </div>
      {columns === 2 ? (
        // Full-width surfaces (project page): the tall activity panel leads,
        // code fills beneath it; the AI cluster and compact health stack on
        // the right. No row-spanning voids.
        <div className="grid items-start gap-3 min-[900px]:grid-cols-[1.45fr_1fr]">
          <div className="flex flex-col gap-3">
            <ReportActivityWidget
              data={report.data}
              mode={kind}
              commits={commits}
              commitsPending={commitsPending}
              onOpenProject={onOpenProject}
            />
            <ReportCodeWidget data={report.data} commits={commits} />
          </div>
          <div className="flex flex-col gap-3">
            <ReportAiWidget data={report.data} />
            <ReportHealthWidget data={report.data} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ReportActivityWidget
            data={report.data}
            mode={kind}
            commits={commits}
            commitsPending={commitsPending}
            onOpenProject={onOpenProject}
          />
          <ReportAiWidget data={report.data} />
          <ReportHealthWidget data={report.data} />
          <ReportCodeWidget data={report.data} commits={commits} />
        </div>
      )}
    </div>
  );
}
