/**
 * Bento's workspace pulse — port of the design's `report-panel.tsx` (the
 * tabbed snitch-report band: Activity / Health / Code / AI usage over one
 * export, with the MISSING / RUNNING / STALE / FRESH machine). The state
 * machine, CLI command, generate pipeline and staleness verdict come from
 * the page's ReportProvider (`useReport`) instead of the design's local
 * queries — the same react-query cache, mounted once per page.
 *
 * Every tab is graph-driven over the export's FULL census:
 * - activity — cadence area graph, per-repo commit leaders, month table
 *   (one DataCarousel, three views);
 * - health — severity segbar + the per-signal tally beside a per-repo
 *   offenders ledger (worst severity first);
 * - code — the design's pure-SVG donut + language rows beside a per-repo
 *   composition ledger (stacked language bars);
 * - AI usage — the `byDay` timeline as tight-domain stacked in+out bars
 *   (peak day labeled, exact day axis), a by-model / by-repo ledger with
 *   exact tokens and the CLI's unsubsidized est. $ per row, one
 *   exact-totals footer. The subsidized `cost` is the CLI's constant $0 —
 *   it stays a small honest line, never a hero figure; `records` counts
 *   are banned outright (owner verdict).
 *
 * Rows follow the fill-or-shrink law: equal flex inside the band, never
 * stretched voids, never overflow bleed (the mask-fade crop is the honest
 * end of a list that outruns a short band).
 */
import { useEffect, useId, useRef, useState } from "react";
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

import { formatCompact, formatCost, formatTokens, relativeTime } from "@/lib/format";
import { aiUsageLeaders, alertTally, aggregateCadence, languageRows } from "@/lib/scan-metrics";
import type { AlertTally } from "@/lib/scan-metrics";

import { useReport } from "@/lib/contexts/report-context";
import type { RegisteredWidgetProps } from "@/components/widgets/registry";

import { BentoTile } from "../bits";
import { DataCarousel } from "../data-carousel";

const SEVERITY_COLOR = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
} as const;

/** Penalty order of the canonical severities — worst-first sorts. */
const SEVERITY_WEIGHT = { critical: 2, warning: 1, info: 0 } as const;

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

type AlertSeverity = AlertTally["rows"][number]["worst"];

type AiUsage = NonNullable<ReportExport["aiUsage"]>;
type AiBreakdownRow = NonNullable<AiUsage["breakdowns"]>["byDay"][number];

/** MM-DD slice of a byDay key ("2026-09-06" → "09-06") — the axis register. */
function dayTick(key: string): string {
  return key.length >= 10 ? key.slice(5) : key;
}

/**
 * Color rank of every language in the export (heaviest lines first) so the
 * donut, the language rows and the per-repo composition bars all map the
 * same language to the same ramp tone.
 */
function languageColorMap(data: ReportExport): Map<string, number> {
  const source =
    data.totals.languages.length > 0
      ? data.totals.languages
      : (data.projects[0]?.languages ?? []);
  const ranked = [...source].sort((a, b) => b.lines - a.lines);
  return new Map(ranked.map((l, i) => [l.language, i]));
}

export interface ReportPanelProps {
  /** Widget heading (the design's b-label row). */
  title?: string;
  /**
   * Auto-cycle the tabs (activity → health → code → AI) so the band stays
   * alive without input. Pauses while the pointer is over the panel or
   * focus sits inside it; off entirely under prefers-reduced-motion. The
   * dashboard passes true — the project page's pulse stays manual.
   */
  autoCycleTabs?: boolean;
  className?: string;
}

/**
 * The tabbed snitch-report widget over the page's report scope. Callers
 * supply only chrome inputs — scope, staleness and the write pipeline are
 * the provider's.
 */
export function ReportPanel({ title = "Workspace pulse", autoCycleTabs = false, className }: ReportPanelProps) {
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

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
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
          <ReportTabs data={data} tab={tab} onTabChange={setTab} seed={data.key} autoCycle={autoCycleTabs} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

/** Tab cycle order — the auto-carousel walks this ring. */
const TAB_ORDER: readonly string[] = ["activity", "health", "code", "ai"];

/** Auto-cycle dwell per tab. Deterministic: one band, one phase. */
const TAB_CYCLE_MS = 8000;

function ReportTabs({
  data,
  tab,
  onTabChange,
  seed,
  autoCycle,
}: {
  data: ReportExport;
  tab: string;
  onTabChange: (tab: string) => void;
  seed: string;
  autoCycle: boolean;
}) {
  // The carousel pause surface: hover/focus holds the current tab so a
  // chart being read never switches underneath (DataCarousel semantics).
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Respect prefers-reduced-motion: no tab auto-advance at all.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!autoCycle || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (pausedRef.current) return;
      const at = TAB_ORDER.indexOf(tab);
      const next = TAB_ORDER[(at + 1) % TAB_ORDER.length] ?? TAB_ORDER[0];
      if (next !== undefined) onTabChange(next);
    }, TAB_CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [autoCycle, reducedMotion, tab, onTabChange]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
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

        {/* overflow-hidden: a tab body may never bleed over the header row —
            dense content fits by flexing, never by clipping upward. */}
        <TabsContent value="activity" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ActivityTab data={data} seed={seed} />
        </TabsContent>
        <TabsContent value="health" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          <HealthTab data={data} seed={seed} />
        </TabsContent>
        <TabsContent value="code" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          <CodeTab data={data} seed={seed} />
        </TabsContent>
        <TabsContent value="ai" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          <AiTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------ activity */

/** Commits across the report window, per repo, heaviest first. */
function commitLeaders(data: ReportExport, limit = 8): { name: string; commits: number }[] {
  return data.projects
    .map((p) => ({ name: p.name, commits: p.cadence.reduce((sum, c) => sum + c.commits, 0) }))
    .filter((r) => r.commits > 0)
    .sort((a, b) => b.commits - a.commits)
    .slice(0, limit);
}

function ActivityTab({ data, seed }: { data: ReportExport; seed: string }) {
  const cadence = aggregateCadence(data, 14);
  const total = cadence.reduce((sum, p) => sum + p.commits, 0);
  const leaders = commitLeaders(data);

  if (cadence.length === 0) {
    return <QuietLine>No cadence data in this report.</QuietLine>;
  }
  const peak = cadence.reduce((a, b) => (b.commits > a.commits ? b : a), cadence[0]);
  return (
    <DataCarousel
      ariaLabel="commit cadence"
      autoMs={8000}
      seed={seed}
      className="min-h-0 flex-1"
      cards={[
        {
          label: "graph",
          content:
            cadence.length >= 3 ? (
              <div className="flex min-h-0 flex-1 flex-col gap-1">
                <p className="shrink-0 font-mono text-[0.68rem] text-muted-foreground">
                  {total.toLocaleString()} commits across {cadence.length}{" "}
                  {cadence.length === 1 ? "month" : "months"}
                  <span className="text-foreground">
                    {" "}
                    · peak {peak.period} · {peak.commits.toLocaleString()}
                  </span>
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
            ) : (
              /* A one-bucket window has no shape to draw — the total reads
                 as a figure instead of a line stretched across the band. */
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
                <span className="b-label">commits in window</span>
                <span className="b-num text-[44px] text-foreground">{total.toLocaleString()}</span>
                <p className="font-mono text-[0.68rem] text-muted-foreground">
                  {cadence.length} {cadence.length === 1 ? "bucket" : "buckets"} · peak {peak.period} ·{" "}
                  {peak.commits.toLocaleString()}
                  {leaders.length > 0 ? ` · ${leaders[0].name} leads` : ""}
                </p>
              </div>
            ),
        },
        {
          label: "by repo",
          content:
            leaders.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <p className="shrink-0 font-mono text-[0.68rem] text-muted-foreground">
                commits in window · {leaders.length} of {data.totals.repositories}{" "}
                {data.totals.repositories === 1 ? "repo" : "repos"}
              </p>
              <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-0.5 overflow-hidden">
                {leaders.map((l) => (
                  <li key={l.name} className="flex min-h-0 max-h-12 flex-1 items-center gap-2.5 text-xs">
                    <span className="w-28 shrink-0 truncate @[900px]:w-44" title={l.name}>
                      {l.name}
                    </span>
                    <span className="b-dirtybar min-w-0 flex-1">
                      <span
                        style={{
                          width: `${Math.max((l.commits / leaders[0].commits) * 100, 3)}%`,
                          background: "var(--bento-c1)",
                        }}
                      />
                    </span>
                    <span className="b-num w-12 shrink-0 text-right text-sm">
                      {l.commits.toLocaleString()}
                    </span>
                    <span className="w-10 shrink-0 text-right font-mono text-[0.62rem] text-muted-foreground">
                      {total > 0 ? `${Math.round((l.commits / total) * 100)}%` : "0%"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                No commits recorded in this window.
              </div>
            ),
        },
        {
          label: "table",
          content: (
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border [mask-image:linear-gradient(to_bottom,var(--foreground)_calc(100%_-_28px),transparent)]"
            >
              {/* h-full makes the table a real design for the box it is in:
                  in tall bands (12x5) the rows distribute through the full
                  height instead of clustering with a void; where the months
                  outrun the height the crop fades out instead of cutting a
                  row mid-glyph. */}
              <table className="h-full w-full border-collapse text-xs">
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

/* -------------------------------------------------------------- health */

interface OffenderRow {
  name: string;
  worst: AlertSeverity;
  count: number;
  value: number;
}

/** Repos re-ranked by their worst signal, then by summed signal value. */
function healthOffenders(data: ReportExport, limit = 8): OffenderRow[] {
  return data.projects
    .map((p) => {
      let worst: AlertSeverity = "info";
      let count = 0;
      let value = 0;
      for (const alert of p.alerts) {
        count++;
        value += alert.value;
        if (SEVERITY_WEIGHT[alert.severity] > SEVERITY_WEIGHT[worst]) worst = alert.severity;
      }
      return { name: p.name, worst, count, value };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => SEVERITY_WEIGHT[b.worst] - SEVERITY_WEIGHT[a.worst] || b.value - a.value)
    .slice(0, limit);
}

function HealthTab({ data, seed }: { data: ReportExport; seed: string }) {
  const tally = alertTally(data);
  const counts = tally.severityCounts;
  const total = Math.max(tally.total, 1);
  const offenders = healthOffenders(data);
  const maxOffender = offenders.reduce((peak, o) => Math.max(peak, o.value), 1);

  if (tally.total === 0) {
    return <QuietLine>No quality signals flagged in this report.</QuietLine>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div
        className="b-segbar shrink-0"
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
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.7rem]">
        <SeverityStat name="critical" value={counts.critical} color={SEVERITY_COLOR.critical} />
        <SeverityStat name="warning" value={counts.warning} color={SEVERITY_COLOR.warning} />
        <SeverityStat name="info" value={counts.info} color={SEVERITY_COLOR.info} />
        <span className="ml-auto text-muted-foreground">{tally.total.toLocaleString()} signals</span>
      </div>
      <DataCarousel
        ariaLabel="health signals"
        autoMs={8000}
        seed={seed}
        className="min-h-0 flex-1"
        cards={[
          {
            label: "signals",
            content: (
              <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-0.5 overflow-hidden">
                {tally.rows.slice(0, 8).map((row) => (
                  <li
                    key={`${row.worst}:${row.label}`}
                    className="flex min-h-0 min-w-0 max-h-16 flex-1 items-center gap-2.5 rounded-lg border border-border bg-white/[0.02] px-2.5 text-xs"
                    title={row.summary}
                  >
                    <span
                      className="size-2 shrink-0 rounded-[3px]"
                      style={{ background: SEVERITY_COLOR[row.worst] }}
                    />
                    <span className="max-w-40 shrink-0 truncate font-medium" title={row.label}>
                      {row.label}
                    </span>
                    <span
                      className="hidden min-w-0 flex-1 truncate font-mono text-[0.62rem] text-muted-foreground sm:block"
                    >
                      {row.summary}
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono text-[0.62rem] text-muted-foreground">
                      {row.count}×
                    </span>
                    <span className="b-dirtybar w-20 shrink-0 @[900px]:w-32">
                      <span
                        style={{
                          width: `${Math.max((row.value / total) * 100, 6)}%`,
                          background: SEVERITY_COLOR[row.worst],
                        }}
                      />
                    </span>
                    <span
                      className="b-num w-11 shrink-0 text-right text-sm"
                      style={{ color: SEVERITY_COLOR[row.worst] }}
                    >
                      {row.value.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            label: "by repo",
            content:
              offenders.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                  <p className="shrink-0 font-mono text-[0.66rem] text-muted-foreground">
                    {offenders.length} flagged · worst signal first
                  </p>
                  <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-0.5 overflow-hidden">
                    {offenders.map((o) => (
                      <li
                        key={o.name}
                        className="flex min-h-0 max-h-12 flex-1 items-center gap-2.5 text-xs"
                        title={`${o.name} — ${o.count} ${o.count === 1 ? "signal" : "signals"}, worst ${o.worst}`}
                      >
                        <span
                          className="size-2 shrink-0 rounded-[3px]"
                          style={{ background: SEVERITY_COLOR[o.worst] }}
                        />
                        <span className="w-28 shrink-0 truncate @[900px]:w-44" title={o.name}>
                          {o.name}
                        </span>
                        <span className="b-dirtybar min-w-0 flex-1">
                          <span
                            style={{
                              width: `${Math.max((o.value / maxOffender) * 100, 3)}%`,
                              background: SEVERITY_COLOR[o.worst],
                            }}
                          />
                        </span>
                        <span className="w-9 shrink-0 text-right font-mono text-[0.62rem] text-muted-foreground">
                          {o.count}×
                        </span>
                        <span
                          className="b-num w-11 shrink-0 text-right text-sm"
                          style={{ color: SEVERITY_COLOR[o.worst] }}
                        >
                          {o.value.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                  No single repo flagged — signals are workspace-wide.
                </div>
              ),
          },
        ]}
      />
    </div>
  );
}

function SeverityStat({ name, value, color }: { name: string; value: number; color: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5" style={{ color }}>
      <span className="b-num text-base">{value.toLocaleString()}</span>
      <span className="text-muted-foreground">{name}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- code */

interface RepoStackRow {
  name: string;
  lines: number;
  files: number;
  segments: { language: string; lines: number; color: string }[];
}

/** Repos by total lines with their language mix pre-colored by global rank. */
function repoStackRows(
  data: ReportExport,
  colorOf: (language: string) => string,
  limit = 8,
): RepoStackRow[] {
  return data.projects
    .map((p) => {
      const files = p.languages.reduce((sum, l) => sum + l.files, 0);
      const segments = [...p.languages]
        .sort((a, b) => b.lines - a.lines)
        .map((l) => ({ language: l.language, lines: l.lines, color: colorOf(l.language) }));
      return {
        name: p.name,
        lines: p.languages.reduce((sum, l) => sum + l.lines, 0),
        files,
        segments,
      };
    })
    .filter((r) => r.lines > 0)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, limit);
}

function CodeTab({ data, seed }: { data: ReportExport; seed: string }) {
  const languages = languageRows(data, 8);
  const totalLines = languages.reduce((sum, l) => sum + l.lines, 0);
  const max = Math.max(...languages.map((l) => l.lines), 1);
  const R = 58;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2.5;

  const colorRank = languageColorMap(data);
  const colorOf = (language: string): string => STACK_COLOR(colorRank.get(language) ?? 0);
  const repos = repoStackRows(data, colorOf);
  const maxRepo = repos.reduce((peak, r) => Math.max(peak, r.lines), 1);

  if (languages.length === 0) {
    return <QuietLine>No language statistics in this report.</QuietLine>;
  }

  let offset = 0;
  const segments = languages.map((l) => {
    const frac = totalLines === 0 ? 0 : l.lines / totalLines;
    const dash = Math.max(frac * CIRC - GAP, 0.75);
    const seg = { language: l, dash, offset, color: colorOf(l.language) };
    offset += frac * CIRC;
    return seg;
  });

  return (
    <DataCarousel
      ariaLabel="code composition"
      autoMs={8000}
      seed={seed}
      className="min-h-0 flex-1"
      cards={[
        {
          label: "languages",
          content: (
            <div className="flex min-h-0 flex-1 flex-col gap-2 @[520px]:flex-row @[520px]:items-stretch @[520px]:gap-6">
              <div className="relative mx-auto aspect-square h-full max-h-[132px] w-auto shrink-0 @[520px]:mx-0 @[520px]:max-h-none">
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
                <p className="shrink-0 font-mono text-[0.66rem] text-muted-foreground">
                  {languages.length} {languages.length === 1 ? "language" : "languages"} ·{" "}
                  {formatCompact(totalLines)} lines
                </p>
                <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-0.5 overflow-hidden pt-1">
                  {languages.map((l) => (
                    <li
                      key={l.language}
                      className="flex min-h-0 max-h-14 flex-1 items-center gap-3 text-xs"
                      title={`${l.language} — ${l.lines.toLocaleString()} lines in ${l.files} files`}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ background: colorOf(l.language) }}
                      />
                      <span className="w-24 shrink-0 truncate font-medium @[900px]:w-32" title={l.language}>
                        {l.language}
                      </span>
                      <span className="b-dirtybar min-w-0 flex-1">
                        <span
                          style={{
                            width: `${Math.max((l.lines / max) * 100, 4)}%`,
                            background: colorOf(l.language),
                          }}
                        />
                      </span>
                      <span className="b-num w-12 shrink-0 text-right text-sm">
                        {formatCompact(l.lines)}
                      </span>
                      <span className="hidden w-16 shrink-0 text-right font-mono text-[0.62rem] whitespace-nowrap text-muted-foreground @[900px]:block">
                        {l.files} files
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ),
        },
        {
          label: "by repo",
          content:
            repos.length > 0 ? (
              <div className="flex min-h-0 flex-1 flex-col gap-1">
                <p className="shrink-0 font-mono text-[0.66rem] text-muted-foreground">
                  lines by repo · segment = language (ramp matches the donut)
                </p>
                <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-0.5 overflow-hidden">
                  {repos.map((r) => (
                    <li
                      key={r.name}
                      className="flex min-h-0 max-h-12 flex-1 items-center gap-3 text-xs"
                      title={`${r.name} — ${r.lines.toLocaleString()} lines in ${r.files} files`}
                    >
                      <span className="w-28 shrink-0 truncate font-medium @[900px]:w-44" title={r.name}>
                        {r.name}
                      </span>
                      <span
                        aria-hidden
                        className="flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full"
                        style={{ background: "var(--bento-track-soft)" }}
                      >
                        {r.segments.map((seg) => (
                          <span
                            key={seg.language}
                            style={{
                              flexGrow: seg.lines,
                              flexBasis: 0,
                              background: seg.color,
                            }}
                          />
                        ))}
                      </span>
                      <span className="b-num w-12 shrink-0 text-right text-sm">
                        {formatCompact(r.lines)}
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-[0.62rem] text-muted-foreground">
                        {maxRepo > 0 ? `${Math.round((r.lines / maxRepo) * 100)}%` : "0%"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                No per-repo language split in this report.
              </div>
            ),
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------ AI usage */

/**
 * Per-day stacked bars: input (base, cyan) + output (top, blue ramp) over a
 * TIGHT domain — the tallest day rides the top edge, the baseline the
 * bottom. No gridlines, no headroom: the bars ARE the box. Each day group
 * carries an exact `<title>` so hovering reads the real census.
 */
function StackedDayBars({ days, maxDay }: { days: AiBreakdownRow[]; maxDay: number }) {
  const gradientId = useId();
  const slot = 1000 / Math.max(1, days.length);
  const barW = Math.max(2, slot * 0.72);
  return (
    <svg
      role="img"
      aria-label="Token usage per day: input and output stacked"
      viewBox="0 0 1000 400"
      preserveAspectRatio="none"
      className="block h-full w-full"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--bento-c1)" stopOpacity={0.95} />
          <stop offset="100%" stopColor="var(--bento-c1)" stopOpacity={0.5} />
        </linearGradient>
      </defs>
      {days.map((day, i) => {
        const hIn = maxDay > 0 ? (day.tokens.input / maxDay) * 400 : 0;
        const hOut = maxDay > 0 ? (day.tokens.output / maxDay) * 400 : 0;
        const x = i * slot + (slot - barW) / 2;
        return (
          <g key={day.key}>
            <title>{`${day.key} — in ${day.tokens.input.toLocaleString()} · out ${day.tokens.output.toLocaleString()}`}</title>
            <rect x={x} y={400 - hIn} width={barW} height={hIn} fill="var(--bento-c2)" />
            <rect
              x={x}
              y={Math.max(0, 400 - hIn - hOut)}
              width={barW}
              height={hOut}
              fill={`url(#${gradientId})`}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Day axis under the bars: evenly sampled ticks at exact x shares — never
 * more than 7; middle ticks fold on narrow shells. */
function DayAxis({ days }: { days: AiBreakdownRow[] }) {
  const n = days.length;
  if (n === 0) return null;
  const idxs =
    n <= 7
      ? Array.from({ length: n }, (_, i) => i)
      : [...new Set([0, 1, 2, 3, 4, 5, 6].map((f) => Math.round((f / 6) * (n - 1))))];
  return (
    <div aria-hidden className="relative h-3.5 shrink-0">
      {idxs.map((i) => {
        const day = days[i];
        if (day === undefined) return null;
        const at = n <= 1 ? 0 : (i / (n - 1)) * 100;
        const anchor = i === 0 ? "0%" : i === n - 1 ? "-100%" : "-50%";
        return (
          <span
            key={day.key}
            className={`absolute top-0 font-mono text-[9px] leading-3 whitespace-nowrap text-muted-foreground${
              i > 0 && i < n - 1 ? " hidden @[520px]:inline" : ""
            }`}
            style={{ left: `${at}%`, transform: `translateX(${anchor})` }}
          >
            {dayTick(day.key)}
          </span>
        );
      })}
    </div>
  );
}

interface LedgerEntry {
  key: string;
  tokens: number;
  unsubsidizedCost: number | null | undefined;
}

/** Fill-or-shrink ledger row: exact tokens, est. $ when the CLI priced it. */
function LedgerRows({ rows }: { rows: LedgerEntry[] }) {
  const max = rows.reduce((peak, r) => Math.max(peak, r.tokens), 0);
  return (
    <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-px overflow-hidden">
      {rows.map((r) => {
        const share = max > 0 ? r.tokens / max : 0;
        return (
          <li
            key={r.key}
            className="flex min-h-0 max-h-12 flex-1 items-center gap-2.5 text-xs"
            title={`${r.key} — ${r.tokens.toLocaleString()} tokens`}
          >
            <span
              className="w-24 shrink-0 truncate font-mono text-[10px] uppercase tracking-[0.07em] text-muted-foreground @[900px]:w-28"
              title={r.key}
            >
              {r.key}
            </span>
            <span className="b-dirtybar min-w-0 flex-1">
              <span
                style={{
                  width: `${Math.max(share * 100, 2)}%`,
                  background: "var(--bento-c1)",
                  opacity: 0.45 + share * 0.55,
                }}
              />
            </span>
            <span className="b-num w-12 shrink-0 text-right text-sm @[340px]:w-14">
              {formatTokens(r.tokens)}
            </span>
            {r.unsubsidizedCost !== null && r.unsubsidizedCost !== undefined && r.unsubsidizedCost > 0 ? (
              <span className="hidden w-14 shrink-0 text-right font-mono text-[0.62rem] tabular-nums text-muted-foreground @[900px]:block">
                {formatCost(r.unsubsidizedCost)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The one dense footer line: exact token classes and the honest cost.
 * One line — overflow clips the muted tail classes (cache/reasoning) first,
 * never the in/out/Σ/est. core. */
function ExactTokens({ usage }: { usage: AiUsage }) {
  return (
    <p className="flex min-w-0 shrink-0 items-baseline gap-x-3 overflow-hidden whitespace-nowrap border-t border-border pt-1.5 font-mono text-[0.64rem] tabular-nums text-muted-foreground">
      <span className="shrink-0">
        in <span className="text-foreground">{usage.tokens.input.toLocaleString()}</span>
      </span>
      <span className="shrink-0">
        out <span className="text-foreground">{usage.tokens.output.toLocaleString()}</span>
      </span>
      <span className="shrink-0">
        Σ <span className="text-foreground">{usage.tokens.total.toLocaleString()}</span>
      </span>
      {usage.unsubsidizedCost !== null && usage.unsubsidizedCost !== undefined && usage.unsubsidizedCost > 0 ? (
        <span className="shrink-0">
          est. <span className="text-foreground">{formatCost(usage.unsubsidizedCost)}</span>
        </span>
      ) : null}
      {usage.tokens.cacheRead ? (
        <span>
          cache <span className="text-foreground">{usage.tokens.cacheRead.toLocaleString()}</span>
        </span>
      ) : null}
      {usage.tokens.reasoning ? (
        <span>
          reas. <span className="text-foreground">{usage.tokens.reasoning.toLocaleString()}</span>
        </span>
      ) : null}
    </p>
  );
}

function AiTab({ data }: { data: ReportExport }) {
  const usage = data.aiUsage;
  // Ledger sources: the per-model census, and — on scan reports — the same
  // treatment per repo. Manual toggle; the band's own cycle brings it round.
  const models: LedgerEntry[] = (usage?.breakdowns?.byModel ?? [])
    .map((m) => ({ key: m.key, tokens: m.tokens.total, unsubsidizedCost: m.unsubsidizedCost }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 6);
  const repoLeaders = aiUsageLeaders(data, 6).filter((l) => l.tokens > 0);
  const [ledger, setLedger] = useState<"models" | "repos">("models");

  if (usage === null || usage.tokens.total === 0) {
    return <QuietLine>No AI usage recorded in this report window.</QuietLine>;
  }

  const days = [...(usage.breakdowns?.byDay ?? [])].sort((a, b) => a.key.localeCompare(b.key));
  const maxDay = days.reduce((peak, d) => Math.max(peak, d.tokens.input + d.tokens.output), 0);
  const peak =
    days.length > 0 && maxDay > 0
      ? days.reduce((a, b) =>
          a.tokens.input + a.tokens.output >= b.tokens.input + b.tokens.output ? a : b,
        )
      : null;
  const clients = [...(usage.breakdowns?.byClient ?? [])]
    .sort((a, b) => b.tokens.total - a.tokens.total)
    .slice(0, 5);
  const clientTotal = clients.reduce((sum, c) => sum + c.tokens.total, 0);
  const estCost =
    usage.unsubsidizedCost !== null && usage.unsubsidizedCost !== undefined
      ? usage.unsubsidizedCost
      : null;
  const perDay = days.length > 0 ? (usage.tokens.input + usage.tokens.output) / days.length : 0;
  const repoRows: LedgerEntry[] = repoLeaders.map((l) => ({
    key: l.name,
    tokens: l.tokens,
    unsubsidizedCost: null,
  }));
  const showRepos = ledger === "repos" && repoRows.length > 0;
  const ledgerRows = showRepos ? repoRows : models;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Figures row: the honest est. cost leads when the CLI priced the
          window; the subsidized $0 fact stays a small line, never a hero.
          One line, no wrapping — a short band shrinks the chart, not the
          census (the note truncates first). */}
      <div className="flex min-w-0 shrink-0 items-baseline gap-x-3 overflow-hidden whitespace-nowrap">
        {estCost !== null && estCost > 0 ? (
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="b-num text-[24px] text-foreground" aria-label={`Estimated unsubsidized cost ${estCost.toFixed(2)} dollars`}>
              {formatCost(estCost)}
            </span>
            <span className="b-label">est. · unsubsidized</span>
          </span>
        ) : null}
        {usage.cost === 0 ? (
          <span
            className="min-w-0 truncate font-mono text-[0.62rem] text-muted-foreground"
            title="The matched assistant messages ran on the plan subsidy — the CLI recorded no charge."
          >
            subsidized · $0 charged
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[0.62rem] text-muted-foreground">
            recorded {formatCost(usage.cost)}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-baseline gap-3 font-mono text-[0.66rem] tabular-nums text-muted-foreground">
          <span>
            <span className="b-num text-sm text-foreground">{formatTokens(usage.tokens.total)}</span> tokens
          </span>
          {perDay > 0 ? (
            <span>
              <span className="b-num text-sm text-foreground">{formatTokens(perDay)}</span>/day
            </span>
          ) : null}
          {models.length > 0 ? (
            <span>
              <span className="b-num text-sm text-foreground">{models.length}</span>{" "}
              {models.length === 1 ? "model" : "models"}
            </span>
          ) : null}
        </span>
      </div>

      {/* Main band: the byDay timeline beside the breakdown ledger — two
          columns from a ~520px shell, stacked below it (the ledger clipping
          honestly before the chart ever collapses). */}
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-x-6 gap-y-2",
          models.length > 0 || repoLeaders.length > 0 ? "@[520px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "",
        )}
      >
        {days.length > 0 ? (
          <div className="flex min-h-[56px] min-w-0 flex-col">
            <div className="flex shrink-0 items-baseline justify-between gap-2 pb-1">
              <span className="b-label">tokens / day · in + out</span>
              {peak !== null ? (
                <span className="font-mono text-[0.64rem] tabular-nums text-muted-foreground">
                  peak{" "}
                  <span className="text-foreground">
                    {dayTick(peak.key)} · {formatTokens(peak.tokens.input + peak.tokens.output)}
                  </span>
                </span>
              ) : null}
            </div>
            <div className="relative min-h-0 min-w-0 flex-1">
              <div className="absolute inset-0">
                <StackedDayBars days={days} maxDay={maxDay} />
              </div>
            </div>
            <DayAxis days={days} />
          </div>
        ) : (
          /* Degrade for exports persisted before the breakdown existed: the
             honest in/out composition — never invented history. */
          <div className="flex min-h-0 min-w-0 flex-col justify-center gap-1.5">
            <span className="b-label">token mix · in + out</span>
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full"
              role="img"
              aria-label={`Tokens: in ${usage.tokens.input.toLocaleString()}, out ${usage.tokens.output.toLocaleString()}`}
              style={{ background: "var(--bento-track-soft)" }}
            >
              <span
                className="block h-full"
                style={{ flexGrow: usage.tokens.input, flexBasis: 0, background: "var(--bento-c2)" }}
              />
              <span
                className="block h-full"
                style={{ flexGrow: usage.tokens.output, flexBasis: 0, background: "var(--bento-c1)" }}
              />
            </div>
          </div>
        )}

        {ledgerRows.length > 0 ? (
          <div className="flex min-h-0 min-w-0 flex-col gap-1">
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="b-label">{showRepos ? "by repo" : "by model"}</span>
              {repoLeaders.length > 0 && models.length > 0 ? (
                <span className="flex items-center gap-0.5">
                  {(["models", "repos"] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setLedger(view)}
                      aria-pressed={ledger === view}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 font-mono text-[0.62rem] transition-colors",
                        ledger === view
                          ? "bg-white/[0.08] text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {view}
                    </button>
                  ))}
                </span>
              ) : null}
              {clientTotal > 0 && clients.length > 1 ? (
                <span
                  className="ml-auto hidden items-center gap-1.5 @[900px]:flex"
                  title={clients.map((c) => `${c.key} ${Math.round((c.tokens.total / clientTotal) * 100)}%`).join(" · ")}
                >
                  <span className="b-segbar w-16" aria-hidden>
                    {clients.map((c, i) => (
                      <span
                        key={c.key}
                        style={{ flexGrow: c.tokens.total, background: STACK_COLOR(i) }}
                      />
                    ))}
                  </span>
                  <span className="font-mono text-[0.6rem] text-muted-foreground">
                    {clients[0].key} {Math.round((clients[0].tokens.total / clientTotal) * 100)}%
                  </span>
                </span>
              ) : null}
            </div>
            <LedgerRows rows={ledgerRows} />
          </div>
        ) : null}
      </div>

      <ExactTokens usage={usage} />
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
 * Workspace pulse — the tabbed report band: the design's `BentoTile
 * span="sp-pulse"` with the ReportPanel inside; the gate states render
 * inside the panel per the provider's machine. On the dashboard the tabs
 * auto-cycle (activity → health → code → AI) so the band stays alive —
 * `autoCycleTabs`, paused on hover/focus, off under reduced motion.
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
        <ReportPanel className="min-h-0 flex-1" autoCycleTabs />
      )}
    </BentoTile>
  );
}
