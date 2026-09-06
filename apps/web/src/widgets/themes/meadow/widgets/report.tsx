/**
 * The tabbed report widget, ported from `components/designs/meadow/report.tsx`
 * into the theme namespace (owner correction: theme widgets carry the
 * prototype's presentation). Sized for the context rail and the project
 * page's overview: real chart data from the snitch report with the full
 * widget contract —
 *
 *   MISSING → empty state with a "Generate report" button + copyable command
 *   STALE   → charts from the existing export + a clearly clickable
 *             regenerate badge (updatedAt ≥ 24h newer than generatedAt)
 *   FRESH   → charts
 *
 * Tabs group the metrics: Activity (cadence + totals), Health (alerts),
 * Code (languages + repo facts), AI usage (subsidized cost + tokens).
 *
 * Data rides the page's ONE report state machine (`useReport`) — the
 * design's local useReportJson/useReportRunner pipeline promoted into the
 * widget system's ReportProvider — so the presentation here is the
 * prototype's and the fetching is the sanctioned context path.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BrainCircuit,
  Check,
  Copy,
  FileText,
  FlaskConical,
  HeartPulse,
  History,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";

import { SoftNumber } from "./bits";
import {
  CadenceArea,
  HBars,
  RatioBar,
} from "./bits";
import type { ReportView } from "@/lib/report-view";
import { ageMs, formatCost, formatTokens, relativeTime } from "@/lib/format";
import { useReport } from "@/widgets/contexts/report-context";

/** git-snitch period presets; "all" = no period flag (full history). */
const PERIODS = ["all", "7d", "1m", "3m", "6m", "1y"] as const;

type ReportTab = "activity" | "health" | "code" | "ai";

const TABS: { id: ReportTab; label: string; icon: LucideIcon }[] = [
  { id: "activity", label: "Activity", icon: History },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "code", label: "Code", icon: FileText },
  { id: "ai", label: "AI usage", icon: BrainCircuit },
];

export interface MeadowReportProps {
  /** Panel heading, e.g. "Workspace report" / "Project report". */
  title: string;
}

export function MeadowReport({ title }: MeadowReportProps) {
  const report = useReport();
  const [tab, setTab] = useState<ReportTab>("activity");
  const [commandCopied, setCommandCopied] = useState(false);

  const view = report.view;

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

  const state: "missing" | "stale" | "fresh" = view
    ? view.stale
      ? "stale"
      : "fresh"
    : "missing";

  return (
    <section
      aria-labelledby={reportTitleId(title)}
      className="meadow-panel flex flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full"
          style={chipGreen}
        >
          <FlaskConical className="size-3" />
        </span>
        <h2
          id={reportTitleId(title)}
          className="text-[13px] font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        {view !== null && report.generatedAt !== null ? (
          <GeneratedBadge generatedAt={report.generatedAt} state={state} />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div
          role="tablist"
          aria-label="Report sections"
          className="flex flex-wrap items-center gap-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`meadow-focus inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                tab === t.id
                  ? "meadow-tab-active"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon aria-hidden className="size-3" />
              {t.label}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label="Report period"
          className="ml-auto flex items-center rounded-full border border-border/70 bg-muted/50 p-0.5"
        >
          {PERIODS.map((p) => {
            const period = p === "all" ? undefined : p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={report.period === period}
                onClick={() => report.setPeriod(period)}
                className={`meadow-focus rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums transition-colors ${
                  report.period === period
                    ? "bg-card text-foreground shadow-[0_1px_2px_color-mix(in_oklch,var(--foreground)_10%,transparent)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {state === "stale" ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-2.5 py-1.5 text-[10px]"
          style={{
            color: "var(--sev-warning)",
            background: "color-mix(in oklch, var(--sev-warning) 7%, transparent)",
          }}
        >
          Snapshot predates the latest work — charts show the existing report.
          <button
            type="button"
            disabled={report.generating || report.key === null}
            onClick={() => report.generate({ force: true })}
            className="meadow-focus inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold transition-colors disabled:opacity-50"
            style={{
              borderColor:
                "color-mix(in oklch, var(--sev-warning) 45%, var(--border))",
            }}
            title="Run the snitch again for a fresh read"
          >
            {report.generating ? (
              <Loader2 aria-hidden className="size-3 animate-spin" />
            ) : (
              <RefreshCw aria-hidden className="size-3" />
            )}
            Regenerate
          </button>
        </div>
      ) : null}

      {report.status === "loading" || report.status === "running" ? (
        view === null ? (
          <div className="flex items-center gap-2 py-5 text-xs text-muted-foreground">
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            Reading the report cache…
          </div>
        ) : null
      ) : view !== null ? (
        <ReportCharts view={view} tab={tab} />
      ) : (
        <MissingState
          title={title}
          command={report.command}
          commandError={report.commandError}
          copied={commandCopied}
          onCopy={copyCommand}
          onGenerate={report.key !== null ? () => report.generate() : null}
          busy={report.generating}
        />
      )}

      {report.generating && view !== null ? (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 aria-hidden className="size-3 animate-spin" />
          Fresh run in progress — charts switch over when it lands.
        </p>
      ) : null}
    </section>
  );
}

const chipGreen = {
  color: "var(--recency-fresh)",
  background: "color-mix(in oklch, var(--recency-fresh) 11%, transparent)",
} as const;

function reportTitleId(title: string): string {
  return `report-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** "generated 2h ago" pill; honey "may be stale" tint when stale. */
function GeneratedBadge({
  generatedAt,
  state,
}: {
  generatedAt: string;
  state: "missing" | "stale" | "fresh";
}) {
  const stale = state === "stale";
  return (
    <span
      title={`Generated ${new Date(generatedAt).toLocaleString()}`}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
      style={
        stale
          ? {
              color: "var(--sev-warning)",
              background:
                "color-mix(in oklch, var(--sev-warning) 12%, transparent)",
            }
          : {
              color: "var(--recency-fresh)",
              background:
                "color-mix(in oklch, var(--recency-fresh) 10%, transparent)",
            }
      }
    >
      {stale ? (
        <History aria-hidden className="size-3" />
      ) : (
        <BadgeCheck aria-hidden className="size-3" />
      )}
      {stale ? "stale · " : ""}
      {ageMs(generatedAt)} ago
    </span>
  );
}

function MissingState({
  title,
  command,
  commandError,
  copied,
  onCopy,
  onGenerate,
  busy,
}: {
  title: string;
  command: string | null;
  commandError: string | null;
  copied: boolean;
  onCopy: () => void;
  onGenerate: (() => void) | null;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-2.5 py-2">
      <p className="text-xs leading-relaxed text-muted-foreground">
        No {title.toLowerCase()} for this view yet — generate one for commit
        cadence, health alerts, language mix, and AI cost as charts, or run
        the command yourself.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="xs"
          disabled={onGenerate === null}
          onClick={onGenerate ?? undefined}
        >
          {onGenerate === null ? (
            <Loader2 aria-hidden className="size-3 animate-spin" />
          ) : (
            <FlaskConical aria-hidden className="size-3" />
          )}
          {busy ? "Starting…" : "Generate report"}
        </Button>
        {command ? (
          <Button variant="outline" size="xs" onClick={onCopy}>
            {copied ? (
              <Check aria-hidden className="size-3" />
            ) : (
              <Copy aria-hidden className="size-3" />
            )}
            {copied ? "Copied" : "Copy command"}
          </Button>
        ) : null}
      </div>
      {command ? (
        <pre className="meadow-scroll max-w-full overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-2.5 font-mono text-[0.6rem] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
          {command}
        </pre>
      ) : commandError ? (
        <p className="text-[10px]" style={{ color: "var(--sev-critical)" }}>
          Command unavailable: {commandError}
        </p>
      ) : null}
    </div>
  );
}

const SEVERITY_BAR: Record<"info" | "warning" | "critical", string> = {
  info: "var(--sev-info)",
  warning: "var(--sev-warning)",
  critical: "var(--sev-critical)",
};

function ReportCharts({ view, tab }: { view: ReportView; tab: ReportTab }) {
  const report = useReport();
  return (
    <div role="tabpanel" className="flex flex-col gap-3">
      {tab === "activity" ? (
        <>
          <CadenceArea
            data={view.cadence}
            className="h-28 min-h-0"
            label={`Commits per period across ${view.projectCount} ${view.projectCount === 1 ? "repository" : "repositories"}`}
          />
          <div className="grid grid-cols-3 gap-2">
            <BigFact label="commits" value={view.totals.commits} />
            <BigFact label="contributors" value={view.totals.contributors} />
            <BigFact label="repositories" value={view.totals.repositories} />
          </div>
        </>
      ) : null}

      {tab === "health" ? (
        view.alerts.length === 0 ? (
          <EmptyTab>All clear — no health alerts in this report.</EmptyTab>
        ) : (
          <div className="flex flex-col gap-3">
            <HBars
              data={view.alerts.slice(0, 6).map((a) => ({
                label: a.label,
                value: a.value,
                display: `${a.value} · ×${a.count}`,
                color: SEVERITY_BAR[a.severity],
              }))}
              label="Health alerts by score"
            />
            <ul className="flex flex-col gap-1.5">
              {view.alerts.slice(0, 3).map((a) => (
                <li
                  key={a.label}
                  className="text-[10px] leading-relaxed text-muted-foreground"
                >
                  <span
                    className="font-semibold"
                    style={{ color: SEVERITY_BAR[a.severity] }}
                  >
                    {a.label}
                  </span>{" "}
                  {a.summary}
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {tab === "code" ? (
        view.languageRows.length === 0 ? (
          <EmptyTab>No language data in this report.</EmptyTab>
        ) : (
          <>
            <HBars
              data={view.languageRows.slice(0, 7).map((l) => ({
                label: l.language,
                value: l.lines,
                display: `${formatTokens(l.lines)} ln`,
              }))}
              label="Lines of code by language"
            />
            <div className="grid grid-cols-3 gap-2">
              <BigFact label="commits" value={view.totals.commits} />
              <BigFact label="contributors" value={view.totals.contributors} />
              <BigFact label="repositories" value={view.totals.repositories} />
            </div>
          </>
        )
      ) : null}

      {tab === "ai" ? (
        view.aiUsage === null ? (
          <EmptyTab>No AI usage recorded in this report.</EmptyTab>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="meadow-soft-block flex items-baseline gap-2 rounded-2xl px-3 py-2.5">
              <SoftNumber
                value={formatCost(view.aiUsage.cost)}
                className="text-xl font-semibold tracking-tight text-foreground"
              />
              <span className="text-[10px] text-muted-foreground">
                recorded (subsidized)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <BigFact label="records" value={formatTokens(view.aiUsage.records)} />
              <BigFact
                label="total tokens"
                value={formatTokens(view.aiUsage.tokens.total)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>in {formatTokens(view.aiUsage.tokens.input)}</span>
                <span>out {formatTokens(view.aiUsage.tokens.output)}</span>
              </div>
              <RatioBar
                a={view.aiUsage.tokens.input}
                b={view.aiUsage.tokens.output}
                label="Input vs output token ratio"
              />
            </div>
          </div>
        )
      ) : null}

      {report.generatedAt !== null ? (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[9px] text-muted-foreground">
          Generated {relativeTime(report.generatedAt)} ·{" "}
          {report.key !== null ? (
            <Link
              to="/reports/$key"
              params={{ key: report.key }}
              className="meadow-focus inline-flex items-center gap-1 rounded-full font-medium hover:underline"
              style={{ color: "var(--recency-fresh)" }}
            >
              <FileText aria-hidden className="size-3" />
              Full HTML report
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function BigFact({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <SoftNumber
        value={value}
        className="text-lg leading-tight font-semibold tracking-tight text-foreground"
      />
      <span className="text-[9px] tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function EmptyTab({ children }: { children: string }) {
  return <p className="py-2 text-[11px] text-muted-foreground">{children}</p>;
}
