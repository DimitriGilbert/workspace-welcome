import { useState } from "react";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { RefreshCw } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { cn } from "@workspace-welcome/ui/lib/utils";
import type { Project } from "@workspace-welcome/api/lib/types";
import type { ReportExport } from "@workspace-welcome/api/lib/report-export";

import { CadenceChart, SplitDonut } from "./charts";
import { Led } from "./led";
import type { FleetVitals } from "./metrics";
import { dirtyLeaders, stackDistribution } from "./metrics";
import { useMbOpenProject } from "./open-project";
import {
  aggregateAlertLabels,
  aggregateCadence,
  formatCompact,
  formatCost,
  languageRows,
} from "./report-utils";

/**
 * The dashboard's signal instruments, extracted props-first so any surface —
 * the dashboard's signal line AND the project pages' channels — renders the
 * exact same widgets. The alerts census, the tabbed activity panel, the
 * stacks donut and the dirty bars each take the report/scan data they read;
 * none of them reach into page-level context.
 */

/* ------------------------------------------------------------------ shell */

export function InstrumentShell({
  label,
  meta,
  className,
  tabs,
  children,
}: {
  label: string;
  meta?: string;
  className?: string;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn("mb-panel flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="mb-inst-head shrink-0">
        <h3 className="mb-label">{label}</h3>
        {meta ? <span className="mb-num ml-auto text-[10px] text-muted-foreground">{meta}</span> : null}
      </div>
      {tabs ? <div className="shrink-0 px-3.5 pt-2.5">{tabs}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3 pt-2.5">{children}</div>
    </section>
  );
}

export function MiniTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Views" className="flex shrink-0 items-center gap-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className="mb-chip"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const SEV_HUE = {
  critical: "var(--mb-red)",
  warning: "var(--mb-amber)",
  info: "var(--mb-blue)",
} as const;

/* ----------------------------------------------------------------- alerts */

/**
 * Report-derived quality-signals census. Severity rows are pure LED +
 * numeral (the LED language; bars stay reserved for true comparisons).
 */
export function AlertsInstrument({
  exportData,
  missing = false,
  onGenerate,
  generating = false,
  className,
}: {
  exportData: ReportExport | null;
  missing?: boolean;
  onGenerate?: () => void;
  generating?: boolean;
  className?: string;
}) {
  return (
    <InstrumentShell
      label="Alerts"
      meta="snitch"
      className={cn("mb-line--alerts", className)}
    >
      <AlertsCensus exportData={exportData} missing={missing} onGenerate={onGenerate} generating={generating} />
    </InstrumentShell>
  );
}

/**
 * The alerts census body (tabs + severity LED rows / label bars) without its
 * shell — composed into the merged signals panel on project pages.
 */
export function AlertsCensus({
  exportData,
  missing = false,
  onGenerate,
  generating = false,
}: {
  exportData: ReportExport | null;
  missing?: boolean;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const [tab, setTab] = useState<"sev" | "label">("sev");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MiniTabs
        tabs={[
          { id: "sev", label: "Sev" },
          { id: "label", label: "Label" },
        ]}
        value={tab}
        onChange={(id) => setTab(id === "label" ? "label" : "sev")}
      />
      <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-2 pt-2">
        {exportData === null ? (
          <MissingNote missing={missing} onGenerate={onGenerate} generating={generating} />
        ) : tab === "sev" ? (
          <SeverityLedger exportData={exportData} />
        ) : (
          <LabelRows exportData={exportData} />
        )}
      </div>
    </div>
  );
}

function SeverityLedger({ exportData }: { exportData: ReportExport }) {
  const counts = { critical: 0, warning: 0, info: 0 };
  const sources =
    exportData.projects.length > 0
      ? exportData.projects.flatMap((p) => p.alerts)
      : exportData.totals.alerts;
  for (const a of sources) counts[a.severity]++;
  const rows = [
    { key: "critical" as const, label: "CRIT", tone: "error" as const },
    { key: "warning" as const, label: "WARN", tone: "warn" as const },
    { key: "info" as const, label: "INFO", tone: "info" as const },
  ];
  return (
    <div role="list" aria-label="Report alerts by severity" className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div key={row.key} role="listitem" className="flex items-center gap-2.5">
          <Led tone={row.tone} />
          <span className="w-8 shrink-0 font-mono text-[9px] tracking-[0.12em] text-muted-foreground">
            {row.label}
          </span>
          <span
            className={cn(
              "mb-num ml-auto text-[15px]",
              row.key === "critical" && counts[row.key] > 0 && "text-[var(--mb-red)]",
              row.key === "warning" && counts[row.key] > 0 && "text-[var(--mb-amber)]",
            )}
          >
            {counts[row.key]}
          </span>
        </div>
      ))}
    </div>
  );
}

function LabelRows({ exportData }: { exportData: ReportExport }) {
  const rows = aggregateAlertLabels(exportData).slice(0, 4);
  if (rows.length === 0) {
    return <QuietNote note="No signals recorded." />;
  }
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div role="img" aria-label="Report alerts by label" className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className="mb-bar-row" title={row.label}>
          <span className="w-14 shrink-0 truncate text-[10.5px] text-foreground">
            {row.label}
          </span>
          <span className="mb-bar-track">
            <span
              className="mb-bar-fill"
              style={{ width: `${Math.max(4, (row.count / max) * 100)}%`, background: SEV_HUE[row.worst] }}
            />
          </span>
          <span className="mb-num w-6 shrink-0 text-right text-[11px] text-muted-foreground">
            {row.count}
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- activity */

type ActivityTab = "commits" | "languages" | "ai";

/**
 * The wide report instrument: commit cadence area, language census and AI
 * usage — the Activity / Code / AI report console, tabbed. Charts fill their
 * pane edge-to-edge; the caller owns the panel height.
 */
export function ActivityInstrument({
  exportData,
  missing = false,
  onGenerate,
  generating = false,
  className,
}: {
  exportData: ReportExport | null;
  missing?: boolean;
  onGenerate?: () => void;
  generating?: boolean;
  className?: string;
}) {
  const [tab, setTab] = useState<ActivityTab>("commits");
  return (
    <InstrumentShell
      label="Activity"
      meta="snitch"
      className={cn("mb-line--activity", className)}
      tabs={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MiniTabs
            tabs={[
              { id: "commits", label: "Commits" },
              { id: "languages", label: "Languages" },
              { id: "ai", label: "AI usage" },
            ]}
            value={tab}
            onChange={(id) => setTab(id as ActivityTab)}
          />
          {exportData ? (
            <span className="mb-num text-[11px] text-muted-foreground">
              {formatCompact(exportData.totals.commits)} commits ·{" "}
              {exportData.totals.contributors} contributors · {exportData.totals.repositories} repos
            </span>
          ) : null}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {exportData === null ? (
          <MissingNote missing={missing} onGenerate={onGenerate} generating={generating} />
        ) : tab === "commits" ? (
          <CadencePane exportData={exportData} />
        ) : tab === "languages" ? (
          <LanguagesPane exportData={exportData} />
        ) : (
          <AiPane exportData={exportData} />
        )}
      </div>
    </InstrumentShell>
  );
}

/** Commit cadence area, filling its pane. */
export function CadencePane({ exportData }: { exportData: ReportExport }) {
  const series = aggregateCadence(exportData);
  if (series.length === 0) return <QuietNote note="No cadence data in this report." />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-num pb-1 text-[10px] text-muted-foreground">
        commits per period, oldest → newest
      </div>
      <div className="min-h-0 flex-1">
        <CadenceChart series={series} />
      </div>
    </div>
  );
}

/** Language census bars with totals — a true comparison, so bars. */
export function LanguagesPane({ exportData }: { exportData: ReportExport }) {
  const rows = languageRows(exportData);
  if (rows.length === 0) return <QuietNote note="No language data in this report." />;
  const max = Math.max(...rows.map((r) => r.lines));
  const totalLines = rows.reduce((sum, r) => sum + r.lines, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-1.5">
      <div role="img" aria-label="Lines of code by language" className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.language} className="mb-bar-row" aria-hidden>
            <span className="w-28 shrink-0 truncate text-[11px] text-foreground sm:w-40">
              {row.language}
            </span>
            <span className="mb-bar-track">
              <span
                className="mb-bar-fill"
                style={{
                  width: `${Math.max(2, (row.lines / max) * 100)}%`,
                  background: "color-mix(in oklch, var(--mb-blue) 75%, transparent)",
                }}
              />
            </span>
            <span className="mb-num w-12 shrink-0 text-right text-[10.5px] text-muted-foreground">
              {formatCompact(row.lines)}
            </span>
          </div>
        ))}
      </div>
      <span className="mb-num text-[10px] text-muted-foreground">
        {formatCompact(totalLines)} lines · {rows.length} languages
      </span>
    </div>
  );
}

/**
 * AI usage from the export: subsidized cost as the headline numeral, then
 * records and token volumes. `donut` swaps the split bar for a radial
 * split — used on the project page's AI channel.
 */
export function AiPane({
  exportData,
  donut = false,
}: {
  exportData: ReportExport;
  donut?: boolean;
}) {
  const usage = exportData.aiUsage;
  if (usage === null || usage.records === 0) {
    return <QuietNote note="No AI usage recorded in this report window." />;
  }
  const { input, output, total } = usage.tokens;
  const inputPct = total > 0 ? Math.round((input / total) * 100) : 0;
  return (
    <div className={cn("flex min-h-0 flex-1 gap-4", donut ? "flex-row items-center" : "flex-col justify-evenly")}>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-6 gap-y-2">
        <BigStat label="Subsidized cost" value={formatCost(usage.cost)} tone="accent" big />
        <BigStat label="Records" value={usage.records.toLocaleString()} />
        <BigStat label="Tokens in" value={formatCompact(input)} />
        <BigStat label="Tokens out" value={formatCompact(output)} />
        <BigStat label="Tokens total" value={formatCompact(total)} />
      </div>
      {donut ? (
        <div className="h-[150px] w-[150px] shrink-0">
          <SplitDonut
            segments={[
              { name: "Input", value: input, fill: "var(--mb-accent)" },
              { name: "Output", value: output, fill: "var(--mb-blue)" },
            ]}
            center={`${inputPct}%`}
            centerLabel="input"
          />
        </div>
      ) : (
        <div>
          <div
            role="img"
            aria-label={`Token split: ${inputPct}% input, ${100 - inputPct}% output`}
            className="flex h-1.5 overflow-hidden rounded-full"
          >
            <span className="block h-full" style={{ width: `${inputPct}%`, background: "var(--mb-accent)" }} />
            <span
              className="block h-full"
              style={{
                width: `${100 - inputPct}%`,
                background: "color-mix(in oklch, var(--mb-blue) 70%, transparent)",
              }}
            />
          </div>
          <div className="mt-1.5 flex gap-4 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--mb-accent)" }} />
              input {inputPct}%
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--mb-blue)" }} />
              output {100 - inputPct}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function BigStat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: "accent";
  big?: boolean;
}) {
  return (
    <span className="flex flex-col-reverse gap-1">
      <span className="mb-label">{label}</span>
      <span
        className={cn("mb-num", big ? "text-[26px]" : "text-[18px]")}
        style={{ color: tone === "accent" ? "var(--mb-accent)" : "var(--foreground)" }}
      >
        {value}
      </span>
    </span>
  );
}

/* ------------------------------------------------------- scan instruments */

const STACK_RAMP = [
  "var(--mb-accent)",
  "var(--mb-blue)",
  "var(--mb-amber)",
  "oklch(0.76 0.09 300)",
  "oklch(0.72 0.1 15)",
  "oklch(0.6 0.02 255)",
];

/** Scan-derived stack census donut — the only place stacks live. */
export function StacksInstrument({
  projects,
  className,
}: {
  projects: Project[];
  className?: string;
}) {
  const slices = stackDistribution(projects);
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;
  const data = slices.map((s, i) => ({
    name: s.label,
    value: s.count,
    fill: STACK_RAMP[i % STACK_RAMP.length],
  }));
  return (
    <InstrumentShell label="Stacks" meta="scan" className={cn("mb-line--stacks", className)}>
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="66%"
              outerRadius="94%"
              paddingAngle={3}
              strokeWidth={0}
              isAnimationActive
              animationDuration={450}
            >
              {data.map((slice) => (
                <Cell key={slice.name} fill={slice.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="mb-num text-[20px] text-foreground">{total}</span>
          <span className="mb-label mt-0.5">units</span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
        {slices.map((s, i) => (
          <span
            key={s.id}
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: STACK_RAMP[i % STACK_RAMP.length] }}
            />
            {s.label} {s.count}
          </span>
        ))}
      </div>
      <span className="sr-only">Stack census across the fleet</span>
    </InstrumentShell>
  );
}

/** Scan-derived uncommitted-work leaders; rows open the project page. */
export function DirtyInstrument({
  projects,
  className,
}: {
  projects: Project[];
  className?: string;
}) {
  const rows = dirtyLeaders(projects, 5);
  const onOpen = useMbOpenProject();
  return (
    <InstrumentShell label="Dirty" meta="uncommitted" className={cn("mb-line--dirty", className)}>
      {rows.length === 0 ? (
        <QuietNote note="Working trees clean." />
      ) : (
        <div role="list" aria-label="Dirty leaders" className="flex min-h-0 flex-1 flex-col justify-evenly gap-2">
          {rows.map((row) => (
            <button
              key={row.path}
              type="button"
              role="listitem"
              onClick={() => onOpen(row.path)}
              className="mb-bar-row"
              aria-label={`Open ${row.name} — ${row.dirty} uncommitted files`}
            >
              <span className="mb-bar-name w-14 shrink-0 truncate text-[10.5px] text-foreground transition-colors">
                {row.name}
              </span>
              <span aria-hidden className="mb-bar-track">
                <span
                  className="mb-bar-fill"
                  style={{ width: `${Math.max(4, (row.dirty / Math.max(...rows.map((r) => r.dirty))) * 100)}%` }}
                />
              </span>
              <span className="mb-num w-6 shrink-0 text-right text-[11px] text-[var(--mb-amber)]">
                {row.dirty}
              </span>
            </button>
          ))}
        </div>
      )}
    </InstrumentShell>
  );
}

/* ----------------------------------------------------------------- shared */

/**
 * Masthead numerals: the fleet reports itself in tabular Geist Mono before a
 * single tile appears. Scan-derived fleet state — units, liveness, sync.
 */
export function VitalsBand({ vitals }: { vitals: FleetVitals }) {
  const cells: { label: string; value: number; tone?: "warn" | "accent" }[] = [
    { label: "Units", value: vitals.total },
    { label: "Live 7d", value: vitals.liveWeek, tone: "accent" },
    { label: "Triage", value: vitals.triage, tone: vitals.triage > 0 ? "warn" : undefined },
    { label: "Dirty", value: vitals.dirty, tone: vitals.dirty > 0 ? "warn" : undefined },
    { label: "Unshared", value: vitals.unshared, tone: "accent" },
    { label: "Behind", value: vitals.behind },
  ];
  return (
    <dl className="flex flex-wrap items-end gap-x-9 gap-y-4 min-[2200px]:gap-x-12">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col-reverse gap-1.5">
          <dt className="mb-label">{cell.label}</dt>
          <dd
            className={cn(
              "mb-num text-[30px] min-[2200px]:text-[36px]",
              cell.tone === "warn" && "text-[var(--mb-amber)]",
              cell.tone === "accent" && "text-[var(--mb-accent)]",
              !cell.tone && "text-foreground",
            )}
          >
            {String(cell.value).padStart(2, "0")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MissingNote({
  missing,
  onGenerate,
  generating,
}: {
  missing: boolean;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 border border-dashed border-[var(--mb-line-strong)] px-4 py-6 text-center">
      <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
        <Led tone="nominal" /> No report cached for this scope
      </span>
      {missing && onGenerate ? (
        <Button size="sm" onClick={onGenerate} disabled={generating}>
          <RefreshCw className={cn("size-3.5", generating && "animate-spin")} />
          {generating ? "Starting…" : "Generate report"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">The report line lights up once a run settles.</p>
      )}
    </div>
  );
}

function QuietNote({ note }: { note: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <p className="py-6 text-center font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
