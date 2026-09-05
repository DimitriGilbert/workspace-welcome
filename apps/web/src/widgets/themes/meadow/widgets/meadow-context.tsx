/**
 * Meadow context panel (T2-meadow) — port of
 * `components/designs/meadow/context.tsx` + `report.tsx`.
 *
 * The design's right rail: the tabbed snitch report on top, then the
 * momentum / rhythm / stacks / directories digests. The design hosts the
 * panel in a react-resizable-panels split against the mosaic; the runtime's
 * region grids stack vertically, so this kind carries the resizable-panel
 * identity INSIDE the widget — wide placements render the report and the
 * digests as two drag-resizable panels with the design's warm separator;
 * narrow placements use the design's stacked presentation. The report state
 * machine (missing/stale/running/fresh) is ReportGate's — never re-implemented.
 *
 * Charts render only in the authored full rung (guaranteed ≥ 200x160 boxes);
 * smaller rungs get non-chart numerals + SegBar geometry.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Group, Panel, Separator } from "react-resizable-panels";
import { FileText, FlaskConical } from "lucide-react";

import { AnimatedNumber } from "@workspace-welcome/ui/components/animated-number";
import { Chart } from "@workspace-welcome/ui/components/chart";
import { HBars } from "@workspace-welcome/ui/components/h-bars";
import { SegBar } from "@workspace-welcome/ui/components/seg-bar";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { formatCost, formatTokens, relativeTime } from "@/lib/format";
import { touchedWithinDays } from "@/lib/scan-metrics";
import { useReport } from "@/widgets/contexts/report-context";
import { useWorkspace } from "@/widgets/contexts/workspace-context";
import { ReportGate } from "@/widgets/parts";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell, WidgetTabs } from "@/widgets/runtime/widget-shell";

import {
  DirectoriesCard,
  MomentumCard,
  RhythmBar,
  RhythmCard,
  StacksCard,
} from "./context-cards";

/** The report view-model as the report context serves it (stays on the
 * sanctioned import surface — no direct lib/report-view dependency). */
type ReportView = NonNullable<ReturnType<typeof useReport>["view"]>;
type ReportAlertSeverity = ReportView["alerts"][number]["severity"];
type ReportPeriod = NonNullable<ReturnType<typeof useReport>["period"]>;

/** git-snitch period presets; "all" = no period flag (full history). */
const PERIODS: (ReportPeriod | "all")[] = ["all", "7d", "1m", "3m", "6m", "1y"] as const;

const REPORT_TABS = [
  { id: "activity", label: "Activity" },
  { id: "health", label: "Health" },
  { id: "code", label: "Code" },
  { id: "ai", label: "AI usage" },
] as const;

type ReportTab = (typeof REPORT_TABS)[number]["id"];

const SEVERITY_COLOR: Record<ReportAlertSeverity, string> = {
  critical: "var(--sev-critical)",
  warning: "var(--sev-warning)",
  info: "var(--sev-info)",
};

/** Desktop-width gate for the two-panel split (the design's `wide`). */
const WIDE_QUERY = "(min-width: 1024px)";

function useWide(): boolean {
  const [wide, setWide] = useState(
    () => typeof window === "undefined" || window.matchMedia(WIDE_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return wide;
}

/** The tabbed report card — the design's `MeadowReport`, ReportGate-backed. */
function ReportPanel({ className }: { className?: string }) {
  const report = useReport();
  const [tab, setTab] = useState<ReportTab>("activity");
  const view = report.view;

  return (
    <section
      aria-label="Workspace report"
      data-slot="meadow-card"
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3.5",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <FlaskConical aria-hidden className="size-3.5" style={{ color: "var(--recency-fresh)" }} />
        <h3 className="text-[11px] font-semibold tracking-tight text-muted-foreground">
          Workspace report
        </h3>
        {report.generatedAt !== null ? (
          <span
            className="ml-auto shrink-0 text-[9px] text-muted-foreground"
            title={`Generated ${new Date(report.generatedAt).toLocaleString()}`}
          >
            {relativeTime(report.generatedAt)}
          </span>
        ) : null}
      </div>

      <WidgetTabs
        tabs={REPORT_TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id as ReportTab)}
        className="shrink-0 px-0"
      />

      <div
        role="group"
        aria-label="Report period"
        className="flex shrink-0 items-center gap-1 self-start rounded-full border border-border/70 bg-muted/50 p-0.5"
      >
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={report.period === (p === "all" ? undefined : p)}
            onClick={() => report.setPeriod(p === "all" ? undefined : p)}
            className="meadow-focus rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums transition-colors hover:text-foreground data-[pressed=true]:bg-card data-[pressed=true]:text-foreground"
            data-pressed={report.period === (p === "all" ? undefined : p)}
          >
            {p}
          </button>
        ))}
      </div>

      <ReportGate mode="banner" className="flex min-h-0 flex-1 flex-col gap-2">
        {view !== null ? <ReportBody view={view} tab={tab} /> : null}
      </ReportGate>

      {report.key !== null ? (
        <Link
          to="/reports/$key"
          params={{ key: report.key }}
          className="meadow-focus inline-flex shrink-0 items-center gap-1 self-start rounded-full text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          style={{ color: "var(--recency-fresh)" }}
        >
          <FileText aria-hidden className="size-3" />
          Full HTML report
        </Link>
      ) : null}
    </section>
  );
}

/** One report tab's content — charts only where the rung guarantees floors. */
function ReportBody({ view, tab }: { view: ReportView; tab: ReportTab }) {
  if (tab === "activity") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Chart
          variant="area"
          points={view.cadence.map((point) => ({ label: point.period, value: point.commits }))}
          color="var(--recency-fresh)"
          maxPoints={12}
          dots
          ariaLabel={`Commits per period across ${view.projectCount} ${view.projectCount === 1 ? "repository" : "repositories"}`}
          className="h-40 min-h-40 w-full shrink-0"
        />
        <div className="flex shrink-0 items-baseline gap-x-4 gap-y-0.5">
          <span className="text-[11px] text-muted-foreground">
            <AnimatedNumber value={view.totals.commits} className="text-xs font-semibold tabular-nums text-foreground" />{" "}
            commits
          </span>
          <span className="text-[11px] text-muted-foreground">
            <AnimatedNumber value={view.totals.contributors} className="text-xs font-semibold tabular-nums text-foreground" />{" "}
            {view.totals.contributors === 1 ? "contributor" : "contributors"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            <AnimatedNumber value={view.totals.repositories} className="text-xs font-semibold tabular-nums text-foreground" />{" "}
            repositories
          </span>
        </div>
      </div>
    );
  }

  if (tab === "health") {
    if (view.alerts.length === 0) {
      return <p className="text-[11px] text-muted-foreground">All clear — no health alerts in this report.</p>;
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <HBars
          rows={view.alerts.slice(0, 6).map((a) => ({
            label: a.label,
            value: a.value,
            display: `${a.value} · ×${a.count}`,
            color: SEVERITY_COLOR[a.severity],
          }))}
          ariaLabel="Health alerts by score"
        />
        <ul className="flex shrink-0 flex-col gap-1">
          {view.alerts.slice(0, 3).map((a) => (
            <li key={a.label} className="text-[10px] leading-relaxed text-muted-foreground">
              <span className="font-semibold" style={{ color: SEVERITY_COLOR[a.severity] }}>
                {a.label}
              </span>{" "}
              {a.summary}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (tab === "code") {
    if (view.languageRows.length === 0) {
      return <p className="text-[11px] text-muted-foreground">No language data in this report.</p>;
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <HBars
          rows={view.languageRows.slice(0, 7).map((l) => ({
            label: l.language,
            value: l.lines,
            display: `${formatTokens(l.lines)} ln`,
          }))}
          ariaLabel="Lines of code by language"
        />
      </div>
    );
  }

  // AI usage.
  if (view.aiUsage === null) {
    return <p className="text-[11px] text-muted-foreground">No AI usage recorded in this report.</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-baseline gap-2">
        <AnimatedNumber
          value={formatCost(view.aiUsage.cost)}
          className="text-xl font-semibold tracking-tight text-foreground"
        />
        <span className="text-[10px] text-muted-foreground">recorded (subsidized)</span>
      </div>
      <div className="flex shrink-0 items-baseline gap-x-4">
        <span className="text-[11px] text-muted-foreground">
          <AnimatedNumber value={formatTokens(view.aiUsage.tokens.total)} className="text-xs font-semibold tabular-nums text-foreground" />{" "}
          total tokens
        </span>
        <span className="text-[11px] text-muted-foreground">
          <AnimatedNumber value={formatTokens(view.aiUsage.records)} className="text-xs font-semibold tabular-nums text-foreground" />{" "}
          records
        </span>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>in {formatTokens(view.aiUsage.tokens.input)}</span>
          <span>out {formatTokens(view.aiUsage.tokens.output)}</span>
        </div>
        <SegBar
          height={10}
          ariaLabel="Input vs output token ratio"
          segments={[
            { value: view.aiUsage.tokens.input, color: "var(--recency-fresh)", label: "input tokens" },
            { value: view.aiUsage.tokens.output, color: "var(--sev-info)", label: "output tokens" },
          ]}
        />
      </div>
    </div>
  );
}

/** The digest cards grid — momentum carries a chart only in the full rung. */
function DigestGrid({ chart, className }: { chart: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] items-start gap-3 overflow-hidden",
        className,
      )}
    >
      <MomentumCard chart={chart} />
      <RhythmCard />
      <StacksCard />
      <DirectoriesCard />
    </div>
  );
}

/** Small-rung momentum readout (non-chart). */
function MomentumRung() {
  const workspace = useWorkspace();
  const touched = useMemo(
    () => touchedWithinDays(workspace.projects, 7, workspace.now),
    [workspace.projects, workspace.now],
  );
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-1 overflow-hidden px-1">
      <p className="flex items-baseline gap-2">
        <AnimatedNumber
          value={touched}
          className="text-xl leading-none font-semibold tracking-tight text-foreground"
        />
        <span className="text-[11px] text-muted-foreground">touched this week</span>
      </p>
    </div>
  );
}

/** The full context presentation: resizable two-panel wide, stacked narrow. */
function ContextFull() {
  const wide = useWide();

  if (!wide) {
    return (
      <div className="flex h-full w-full min-h-0 flex-col gap-3 overflow-hidden">
        <ReportPanel />
        <div className="min-h-40 flex-1">
          <DigestGrid chart />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 overflow-hidden">
      <Group
        orientation="horizontal"
        className="h-full min-h-0 w-full"
        defaultLayout={{ "meadow-report": 34, "meadow-digests": 66 }}
      >
        <Panel id="meadow-report" minSize="22%" defaultSize="34%">
          <div className="h-full min-h-0">
            <ReportPanel className="h-full" />
          </div>
        </Panel>
        <Separator className="meadow-context-separator" />
        <Panel id="meadow-digests" minSize="30%" defaultSize="66%">
          <div className="h-full min-h-0">
            <DigestGrid chart />
          </div>
        </Panel>
      </Group>
    </div>
  );
}

/**
 * Fill-box root with the authored rungs: the full context at the dashboard
 * placement, honest non-chart numerals below it.
 */
export function MeadowContext({ size }: RegisteredWidgetProps) {
  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "1x1": <MomentumRung />,
        "2x1": (
          <div className="flex h-full w-full min-w-0 flex-col justify-center gap-2 overflow-hidden px-1">
            <MomentumRung />
            <RhythmBar />
          </div>
        ),
        "2x2": (
          <div className="flex h-full w-full min-h-0 flex-col gap-2 overflow-hidden">
            <MomentumRung />
            <div className="min-h-0 flex-1">
              <RhythmCard />
            </div>
            <div className="min-h-0 flex-1">
              <StacksCard />
            </div>
          </div>
        ),
        "12x6": <ContextFull />,
      }}
    >
      <ContextFull />
    </WidgetShell>
  );
}
